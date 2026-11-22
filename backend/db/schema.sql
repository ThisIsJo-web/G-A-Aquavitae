-- ============================================================
-- AquaVitae RBAC Schema (Superadmin -> Owner -> Staff/Cashier)
-- Safe to run on an existing profiles table (idempotent).
-- Copy & paste into Supabase Dashboard -> SQL Editor -> Run
-- ============================================================

-- 1. Ensure profiles table exists
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  role text not null default 'cashier',
  is_active boolean not null default true,
  owner_id uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Upgrade existing profiles table with RBAC & ownership columns
alter table public.profiles
  add column if not exists is_active boolean not null default true,
  add column if not exists owner_id uuid references auth.users (id) on delete set null,
  add column if not exists created_by uuid references auth.users (id) on delete set null;

create index if not exists idx_profiles_owner_id on public.profiles (owner_id);
create index if not exists idx_profiles_role on public.profiles (role);

alter table public.profiles
  drop constraint if exists profiles_role_check;

update public.profiles
set role = 'superadmin'
where email = 'superadmin@aquavitae.ph';

update public.profiles
set role = 'cashier'
where role not in ('superadmin', 'owner', 'cashier', 'staff');

alter table public.profiles
  alter column role set default 'cashier',
  add constraint profiles_role_check
    check (role in ('superadmin', 'owner', 'cashier', 'staff'));

-- 3. Enable Row Level Security (RLS)
alter table public.profiles enable row level security;

-- 4. Security-definer helpers (prevents RLS infinite recursion)
create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'superadmin'
      and is_active = true
  );
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'owner'
      and is_active = true
  );
$$;

create or replace function public.get_current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.get_current_user_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select is_active from public.profiles where id = auth.uid();
$$;

create or replace function public.get_current_user_owner_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select owner_id from public.profiles where id = auth.uid();
$$;

-- 5. RLS Policies
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Superadmin can view all profiles" on public.profiles;
drop policy if exists "Users can view own profile or superadmin views all" on public.profiles;
drop policy if exists "Scoped profile read access" on public.profiles;
create policy "Scoped profile read access"
  on public.profiles
  for select
  to authenticated
  using (
    auth.uid() = id
    or public.is_superadmin()
    or (
      public.is_owner()
      and owner_id = auth.uid()
      and role in ('cashier', 'staff')
    )
  );

drop policy if exists "Superadmin can insert profiles" on public.profiles;
drop policy if exists "Superadmin or owner can insert profiles" on public.profiles;
create policy "Superadmin or owner can insert profiles"
  on public.profiles
  for insert
  to authenticated
  with check (
    public.is_superadmin()
    or (
      public.is_owner()
      and owner_id = auth.uid()
      and role in ('cashier', 'staff')
    )
  );

drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Superadmin can update any profile" on public.profiles;
drop policy if exists "Owner can update own staff profiles" on public.profiles;

create policy "Users can update own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = public.get_current_user_role()
    and is_active = public.get_current_user_active()
    and owner_id is not distinct from public.get_current_user_owner_id()
  );

create policy "Superadmin can update any profile"
  on public.profiles
  for update
  to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

create policy "Owner can update own staff profiles"
  on public.profiles
  for update
  to authenticated
  using (
    public.is_owner()
    and owner_id = auth.uid()
    and role in ('cashier', 'staff')
  )
  with check (
    public.is_owner()
    and owner_id = auth.uid()
    and role in ('cashier', 'staff')
  );

drop policy if exists "Superadmin can delete profiles" on public.profiles;
drop policy if exists "Superadmin or owner can delete profiles" on public.profiles;
create policy "Superadmin or owner can delete profiles"
  on public.profiles
  for delete
  to authenticated
  using (
    public.is_superadmin()
    or (
      public.is_owner()
      and owner_id = auth.uid()
      and role in ('cashier', 'staff')
    )
  );

-- 6. Automatically keep updated_at current
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_profiles_updated on public.profiles;
create trigger on_profiles_updated
  before update on public.profiles
  for each row
  execute function public.handle_updated_at();

-- 7. Sync newly created auth.users into public.profiles
-- role, owner_id, and created_by are read from admin-only raw_app_meta_data
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  assigned_role text;
  creator_uuid uuid;
  owner_uuid uuid;
begin
  assigned_role := coalesce(new.raw_app_meta_data ->> 'role', 'cashier');
  if assigned_role not in ('superadmin', 'owner', 'cashier', 'staff') then
    assigned_role := 'cashier';
  end if;

  begin
    creator_uuid := (new.raw_app_meta_data ->> 'created_by')::uuid;
  exception when others then
    creator_uuid := null;
  end;

  begin
    owner_uuid := (new.raw_app_meta_data ->> 'owner_id')::uuid;
  exception when others then
    owner_uuid := null;
  end;

  insert into public.profiles (id, email, full_name, avatar_url, role, owner_id, created_by)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', null),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', null),
    assigned_role,
    owner_uuid,
    creator_uuid
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ============================================================
-- 8. System Error Logs (Superadmin-exclusive observability)
-- ============================================================
create table if not exists public.system_error_logs (
  id uuid primary key default gen_random_uuid(),
  level text not null check (level in ('critical', 'error', 'warning')),
  layer text not null default 'backend' check (layer in ('backend', 'database_auth', 'frontend')),
  source text not null default 'api' check (source in ('api', 'database', 'auth', 'client', 'system')),
  message text not null,
  code text,
  route text,
  stack text,
  metadata jsonb not null default '{}'::jsonb,
  user_id uuid references auth.users (id) on delete set null,
  resolved boolean not null default false,
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Composite indexes for fast 3-section Severity & Layer queries and exports
create index if not exists idx_system_error_logs_level_created
  on public.system_error_logs (level, created_at desc);

create index if not exists idx_system_error_logs_layer_created
  on public.system_error_logs (layer, created_at desc);

create index if not exists idx_system_error_logs_resolved_created
  on public.system_error_logs (resolved, created_at desc);

create index if not exists idx_system_error_logs_created_at
  on public.system_error_logs (created_at desc);

-- Strict Superadmin-only RLS
alter table public.system_error_logs enable row level security;

drop policy if exists "Superadmin can view system error logs" on public.system_error_logs;
create policy "Superadmin can view system error logs"
  on public.system_error_logs
  for select
  to authenticated
  using (public.is_superadmin());

drop policy if exists "Superadmin can insert system error logs" on public.system_error_logs;
create policy "Superadmin can insert system error logs"
  on public.system_error_logs
  for insert
  to authenticated
  with check (public.is_superadmin());

drop policy if exists "Superadmin can update system error logs" on public.system_error_logs;
create policy "Superadmin can update system error logs"
  on public.system_error_logs
  for update
  to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

drop policy if exists "Superadmin can delete system error logs" on public.system_error_logs;
create policy "Superadmin can delete system error logs"
  on public.system_error_logs
  for delete
  to authenticated
  using (public.is_superadmin());

-- ============================================================
-- 9. Superadmin 2-Step Integrity Access Audit Logs
-- ============================================================
create table if not exists public.superadmin_access_audit_logs (
  id uuid primary key default gen_random_uuid(),
  superadmin_id uuid not null references auth.users (id) on delete cascade,
  target_owner_id uuid not null references auth.users (id) on delete cascade,
  scope text not null default 'cashier' check (scope in ('cashier')),
  reason text not null,
  verified_via text not null default 'password_and_totp',
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_sa_audit_superadmin_created
  on public.superadmin_access_audit_logs (superadmin_id, created_at desc);

alter table public.superadmin_access_audit_logs enable row level security;

drop policy if exists "Superadmin can view own audit logs" on public.superadmin_access_audit_logs;
create policy "Superadmin can view own audit logs"
  on public.superadmin_access_audit_logs
  for select
  to authenticated
  using (public.is_superadmin());

-- ============================================================
-- 10. Cashier Operations Module (Tenant-scoped by owner_id)
-- ============================================================
create or replace function public.current_tenant_owner_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when role = 'owner' then id
    when role = 'cashier' then owner_id
    else null
  end
  from public.profiles
  where id = auth.uid()
    and is_active = true;
$$;

-- 10a. Walk-in POS Products (Refill = 20, Gallon with water = 160 defaults)
create table if not exists public.pos_products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  category text not null check (category in ('refill', 'container', 'accessory')),
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

create index if not exists idx_pos_products_owner
  on public.pos_products (owner_id, is_active);

alter table public.pos_products enable row level security;

drop policy if exists "Tenant cashier/owner manages pos_products" on public.pos_products;
create policy "Tenant cashier/owner manages pos_products"
  on public.pos_products
  for all
  to authenticated
  using (owner_id = public.current_tenant_owner_id())
  with check (owner_id = public.current_tenant_owner_id());

-- 10b. Walk-in POS Sales & Sale Items
create table if not exists public.pos_sales (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  cashier_id uuid references auth.users (id) on delete set null,
  receipt_no text not null,
  customer_name text,
  payment_method text not null default 'cash' check (payment_method in ('cash', 'gcash', 'bank')),
  subtotal numeric(10, 2) not null check (subtotal >= 0),
  discount numeric(10, 2) not null default 0 check (discount >= 0),
  total_amount numeric(10, 2) not null check (total_amount >= 0),
  amount_tendered numeric(10, 2) not null default 0 check (amount_tendered >= 0),
  change_amount numeric(10, 2) not null default 0 check (change_amount >= 0),
  status text not null default 'completed' check (status in ('completed', 'voided')),
  notes text,
  business_date date not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_pos_sales_owner_date
  on public.pos_sales (owner_id, business_date desc, created_at desc);

alter table public.pos_sales enable row level security;

drop policy if exists "Tenant cashier/owner manages pos_sales" on public.pos_sales;
create policy "Tenant cashier/owner manages pos_sales"
  on public.pos_sales
  for all
  to authenticated
  using (owner_id = public.current_tenant_owner_id())
  with check (owner_id = public.current_tenant_owner_id());

create table if not exists public.pos_sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.pos_sales (id) on delete cascade,
  product_id uuid references public.pos_products (id) on delete set null,
  product_name text not null,
  category text not null default 'refill' check (category in ('refill', 'container', 'accessory')),
  quantity integer not null check (quantity > 0),
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  line_total numeric(10, 2) not null check (line_total >= 0)
);

create index if not exists idx_pos_sale_items_sale
  on public.pos_sale_items (sale_id);

alter table public.pos_sale_items enable row level security;

drop policy if exists "Tenant cashier/owner manages pos_sale_items" on public.pos_sale_items;
create policy "Tenant cashier/owner manages pos_sale_items"
  on public.pos_sale_items
  for all
  to authenticated
  using (
    exists (
      select 1 from public.pos_sales s
      where s.id = sale_id
        and s.owner_id = public.current_tenant_owner_id()
    )
  )
  with check (
    exists (
      select 1 from public.pos_sales s
      where s.id = sale_id
        and s.owner_id = public.current_tenant_owner_id()
    )
  );

-- 10c. Riders Roster (Non-system users; guide for deliveries managed by cashier/owner)
create table if not exists public.riders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  full_name text not null,
  phone text,
  vehicle_info text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_riders_owner
  on public.riders (owner_id, is_active);

alter table public.riders enable row level security;

drop policy if exists "Tenant cashier/owner manages riders" on public.riders;
create policy "Tenant cashier/owner manages riders"
  on public.riders
  for all
  to authenticated
  using (owner_id = public.current_tenant_owner_id())
  with check (owner_id = public.current_tenant_owner_id());

-- 10d. Deliveries (Tallied per delivery & per rider)
create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  cashier_id uuid references auth.users (id) on delete set null,
  rider_id uuid not null references public.riders (id) on delete restrict,
  customer_name text not null,
  customer_phone text,
  destination text not null,
  order_type text not null default 'refill' check (order_type in ('refill', 'gallon_with_water')),
  quantity integer not null check (quantity > 0),
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  delivery_fee numeric(10, 2) not null default 0 check (delivery_fee >= 0),
  total_amount numeric(10, 2) not null check (total_amount >= 0),
  payment_method text not null default 'cash' check (payment_method in ('cash', 'gcash', 'credit')),
  payment_status text not null default 'unpaid' check (payment_status in ('paid', 'unpaid')),
  delivery_status text not null default 'pending' check (delivery_status in ('pending', 'out_for_delivery', 'delivered', 'cancelled')),
  borrowed_gallons_count integer not null default 0 check (borrowed_gallons_count >= 0),
  notes text,
  business_date date not null,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_deliveries_owner_date
  on public.deliveries (owner_id, business_date desc, created_at desc);

create index if not exists idx_deliveries_owner_rider_date
  on public.deliveries (owner_id, rider_id, business_date desc);

alter table public.deliveries enable row level security;

drop policy if exists "Tenant cashier/owner manages deliveries" on public.deliveries;
create policy "Tenant cashier/owner manages deliveries"
  on public.deliveries
  for all
  to authenticated
  using (owner_id = public.current_tenant_owner_id())
  with check (owner_id = public.current_tenant_owner_id());

drop trigger if exists on_deliveries_updated on public.deliveries;
create trigger on_deliveries_updated
  before update on public.deliveries
  for each row
  execute function public.handle_updated_at();

-- 10e. Vendo Machine Income (Daily or Weekly collections)
create table if not exists public.vendo_collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  cashier_id uuid references auth.users (id) on delete set null,
  machine_name text not null default 'Main Vendo #1',
  period_type text not null check (period_type in ('daily', 'weekly')),
  period_start date not null,
  period_end date not null,
  amount numeric(10, 2) not null check (amount >= 0),
  meter_start numeric(12, 2),
  meter_end numeric(12, 2),
  notes text,
  business_date date not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_vendo_owner_date
  on public.vendo_collections (owner_id, business_date desc, created_at desc);

alter table public.vendo_collections enable row level security;

drop policy if exists "Tenant cashier/owner manages vendo_collections" on public.vendo_collections;
create policy "Tenant cashier/owner manages vendo_collections"
  on public.vendo_collections
  for all
  to authenticated
  using (owner_id = public.current_tenant_owner_id())
  with check (owner_id = public.current_tenant_owner_id());

-- 10f. Gallon Stock & Daily Inventory Movement Logs
create table if not exists public.gallon_stock (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  on_hand_qty integer not null default 0 check (on_hand_qty >= 0),
  damaged_qty integer not null default 0 check (damaged_qty >= 0),
  updated_at timestamptz not null default now(),
  unique (owner_id)
);

alter table public.gallon_stock enable row level security;

drop policy if exists "Tenant cashier/owner manages gallon_stock" on public.gallon_stock;
create policy "Tenant cashier/owner manages gallon_stock"
  on public.gallon_stock
  for all
  to authenticated
  using (owner_id = public.current_tenant_owner_id())
  with check (owner_id = public.current_tenant_owner_id());

drop trigger if exists on_gallon_stock_updated on public.gallon_stock;
create trigger on_gallon_stock_updated
  before update on public.gallon_stock
  for each row
  execute function public.handle_updated_at();

create table if not exists public.gallon_inventory_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  cashier_id uuid references auth.users (id) on delete set null,
  movement_type text not null check (
    movement_type in (
      'restock',
      'walkin_out',
      'delivery_out',
      'borrow_out',
      'borrow_return',
      'damaged',
      'adjustment'
    )
  ),
  quantity_delta integer not null,
  balance_after integer not null,
  reference_id uuid,
  notes text,
  business_date date not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_gallon_logs_owner_date
  on public.gallon_inventory_logs (owner_id, business_date desc, created_at desc);

alter table public.gallon_inventory_logs enable row level security;

drop policy if exists "Tenant cashier/owner manages gallon_inventory_logs" on public.gallon_inventory_logs;
create policy "Tenant cashier/owner manages gallon_inventory_logs"
  on public.gallon_inventory_logs
  for all
  to authenticated
  using (owner_id = public.current_tenant_owner_id())
  with check (owner_id = public.current_tenant_owner_id());

-- 10g. Borrowed Gallons Tracking
create table if not exists public.borrowed_gallons (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  cashier_id uuid references auth.users (id) on delete set null,
  delivery_id uuid references public.deliveries (id) on delete set null,
  customer_name text not null,
  customer_phone text,
  customer_address text,
  qty_borrowed integer not null check (qty_borrowed > 0),
  qty_returned integer not null default 0 check (qty_returned >= 0 and qty_returned <= qty_borrowed),
  deposit_amount numeric(10, 2) not null default 0 check (deposit_amount >= 0),
  status text not null default 'borrowed' check (status in ('borrowed', 'partial', 'returned')),
  borrowed_date date not null,
  returned_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_borrowed_gallons_owner_status
  on public.borrowed_gallons (owner_id, status, borrowed_date desc);

alter table public.borrowed_gallons enable row level security;

drop policy if exists "Tenant cashier/owner manages borrowed_gallons" on public.borrowed_gallons;
create policy "Tenant cashier/owner manages borrowed_gallons"
  on public.borrowed_gallons
  for all
  to authenticated
  using (owner_id = public.current_tenant_owner_id())
  with check (owner_id = public.current_tenant_owner_id());

drop trigger if exists on_borrowed_gallons_updated on public.borrowed_gallons;
create trigger on_borrowed_gallons_updated
  before update on public.borrowed_gallons
  for each row
  execute function public.handle_updated_at();

-- 10h. Closing Shift Daily Sale Automatic Tally Snapshots
create table if not exists public.shift_closings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  cashier_id uuid references auth.users (id) on delete set null,
  business_date date not null,
  shift_label text not null default 'Full Day',
  opening_cash numeric(10, 2) not null default 0 check (opening_cash >= 0),
  walkin_cash_sales numeric(10, 2) not null default 0,
  walkin_digital_sales numeric(10, 2) not null default 0,
  delivery_cash_sales numeric(10, 2) not null default 0,
  delivery_digital_sales numeric(10, 2) not null default 0,
  delivery_unpaid_total numeric(10, 2) not null default 0,
  vendo_daily_income numeric(10, 2) not null default 0,
  expected_cash numeric(10, 2) not null default 0,
  actual_cash numeric(10, 2) not null default 0,
  variance numeric(10, 2) not null default 0,
  total_gross_sales numeric(10, 2) not null default 0,
  walkin_count integer not null default 0,
  delivery_count integer not null default 0,
  notes text,
  closed_at timestamptz not null default now()
);

create index if not exists idx_shift_closings_owner_date
  on public.shift_closings (owner_id, business_date desc, closed_at desc);

alter table public.shift_closings enable row level security;

drop policy if exists "Tenant cashier/owner manages shift_closings" on public.shift_closings;
create policy "Tenant cashier/owner manages shift_closings"
  on public.shift_closings
  for all
  to authenticated
  using (owner_id = public.current_tenant_owner_id())
  with check (owner_id = public.current_tenant_owner_id());

-- ============================================================
-- 11. Regular Delivery Customers & Gallon In/Out Deliveries
-- ============================================================
create table if not exists public.delivery_customers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  customer_name text not null,
  phone text,
  area text not null,
  default_unit_price numeric(10, 2) not null default 20 check (default_unit_price >= 0),
  gallons_held integer not null default 0 check (gallons_held >= 0),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_delivery_customers_owner
  on public.delivery_customers (owner_id, is_active, customer_name);

alter table public.delivery_customers enable row level security;

drop policy if exists "Tenant cashier/owner manages delivery_customers" on public.delivery_customers;
create policy "Tenant cashier/owner manages delivery_customers"
  on public.delivery_customers
  for all
  to authenticated
  using (owner_id = public.current_tenant_owner_id())
  with check (owner_id = public.current_tenant_owner_id());

drop trigger if exists on_delivery_customers_updated on public.delivery_customers;
create trigger on_delivery_customers_updated
  before update on public.delivery_customers
  for each row
  execute function public.handle_updated_at();

-- Upgrade deliveries: remove mandatory rider requirement, add regular customer + gallon In/Out columns
alter table public.deliveries
  alter column rider_id drop not null,
  alter column delivery_status set default 'delivered',
  add column if not exists customer_id uuid references public.delivery_customers (id) on delete set null,
  add column if not exists empty_gallons_returned integer not null default 0 check (empty_gallons_returned >= 0),
  add column if not exists delivered_by text;

create index if not exists idx_deliveries_owner_customer
  on public.deliveries (owner_id, customer_id, business_date desc);

-- ============================================================
-- 12a. Allow 'utang' payment method on Walk-in POS sales
-- ============================================================
alter table public.pos_sales
  drop constraint if exists pos_sales_payment_method_check;

alter table public.pos_sales
  add constraint pos_sales_payment_method_check
    check (payment_method in ('cash', 'gcash', 'bank', 'utang'));

-- ============================================================
-- 12b. Owner Station Expenses (Plan 2: /owner Dashboard)
-- ============================================================
create table if not exists public.station_expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  recorded_by uuid references auth.users (id) on delete set null,
  category text not null check (
    category in (
      'utilities',
      'supplies',
      'maintenance',
      'salary',
      'delivery_fuel',
      'rent',
      'other'
    )
  ),
  description text not null,
  amount numeric(10, 2) not null check (amount >= 0),
  expense_date date not null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_station_expenses_owner_date
  on public.station_expenses (owner_id, expense_date desc, created_at desc);

alter table public.station_expenses enable row level security;

drop policy if exists "Owners manage own station_expenses" on public.station_expenses;
create policy "Owners manage own station_expenses"
  on public.station_expenses
  for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ============================================================
-- 12c. Owner Self-Cashier "My Account" Flag on Profiles
-- ============================================================
alter table public.profiles
  add column if not exists is_owner_cashier boolean not null default false;

create index if not exists idx_profiles_owner_cashier
  on public.profiles (owner_id, is_owner_cashier)
  where is_owner_cashier = true;

-- ============================================================
-- 12d. Cashier Correction Requests & Owner Supervision Queue
-- ============================================================
create table if not exists public.correction_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  requested_by uuid references auth.users (id) on delete set null,
  requester_name text not null,
  entity_type text not null check (
    entity_type in ('pos_sale', 'delivery', 'vendo', 'shift_closing')
  ),
  entity_id uuid not null,
  entity_label text not null,
  correction_type text not null check (
    correction_type in (
      'change_payment_method',
      'update_amount',
      'cancel_delivery',
      'adjust_shift_cash',
      'void_sale'
    )
  ),
  reason text not null,
  before_snapshot jsonb not null default '{}'::jsonb,
  proposed_changes jsonb not null default '{}'::jsonb,
  after_snapshot jsonb,
  status text not null default 'pending' check (
    status in ('pending', 'approved', 'rejected')
  ),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewer_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_correction_requests_owner_status
  on public.correction_requests (owner_id, status, created_at desc);

alter table public.correction_requests enable row level security;

drop policy if exists "Tenant cashier/owner manages correction_requests" on public.correction_requests;
create policy "Tenant cashier/owner manages correction_requests"
  on public.correction_requests
  for all
  to authenticated
  using (owner_id = public.current_tenant_owner_id())
  with check (owner_id = public.current_tenant_owner_id());

-- ============================================================
-- 12e. Owner Deep Financial Audit Trail (Append-Only · Every Cent)
-- ============================================================
create table if not exists public.financial_audit_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  seq_no bigint not null check (seq_no > 0),
  business_date date not null,
  actor_id uuid references auth.users (id) on delete set null,
  actor_name text not null,
  actor_role text not null check (actor_role in ('cashier', 'owner', 'superadmin', 'system')),
  module text not null check (
    module in ('pos', 'delivery', 'vendo', 'expense', 'shift', 'supervision', 'inventory', 'security')
  ),
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  reference_label text not null,
  cash_delta_centavos bigint not null default 0,
  digital_delta_centavos bigint not null default 0,
  utang_delta_centavos bigint not null default 0,
  expense_delta_centavos bigint not null default 0,
  gross_sales_delta_centavos bigint not null default 0,
  summary text not null,
  before_snapshot jsonb,
  after_snapshot jsonb,
  metadata jsonb not null default '{}'::jsonb,
  prev_hash text not null,
  entry_hash text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, seq_no)
);

create index if not exists idx_financial_audit_owner_seq
  on public.financial_audit_logs (owner_id, seq_no desc);

create index if not exists idx_financial_audit_owner_date
  on public.financial_audit_logs (owner_id, business_date desc, created_at desc);

create index if not exists idx_financial_audit_owner_module
  on public.financial_audit_logs (owner_id, module, created_at desc);

create index if not exists idx_financial_audit_entity
  on public.financial_audit_logs (owner_id, entity_type, entity_id);

alter table public.financial_audit_logs enable row level security;

-- Strictly read-only for the Station Owner (writes happen exclusively via server-side service_role)
drop policy if exists "Owners read own financial_audit_logs" on public.financial_audit_logs;
create policy "Owners read own financial_audit_logs"
  on public.financial_audit_logs
  for select
  to authenticated
  using (owner_id = auth.uid());

-- Database-level append-only immutability guard (blocks UPDATE and DELETE permanently)
create or replace function public.prevent_financial_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'financial_audit_logs is append-only and cannot be modified or deleted';
end;
$$;

drop trigger if exists trg_prevent_financial_audit_mutation on public.financial_audit_logs;
create trigger trg_prevent_financial_audit_mutation
  before update or delete on public.financial_audit_logs
  for each row
  execute function public.prevent_financial_audit_mutation();

-- ============================================================
-- 12f. Deduplicate pos_products, Enforce Unique Name, Drop gallon_type
-- ============================================================
-- 1. Keep only the earliest row per (owner_id, name)
delete from public.pos_products p
using (
  select id,
         row_number() over (partition by owner_id, name order by created_at asc, id asc) as rn
  from public.pos_products
) dup
where p.id = dup.id
  and dup.rn > 1;

-- 2. Prevent future duplicate POS products per station
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'uq_pos_products_owner_name'
  ) then
    alter table public.pos_products
      add constraint uq_pos_products_owner_name unique (owner_id, name);
  end if;
end $$;

-- 3. Remove unused gallon_type column from pos_products
alter table public.pos_products
  drop column if exists gallon_type;


-- ============================================================
-- 12g. Superadmin System-Wide Activity Audit Logs ("Who Did What")
-- ============================================================
create table if not exists public.system_activity_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_id uuid references auth.users (id) on delete set null,
  actor_name text not null,
  actor_email text not null,
  actor_role text not null check (actor_role in ('superadmin', 'owner', 'cashier', 'staff', 'anonymous')),
  station_owner_id uuid references auth.users (id) on delete set null,
  module text not null,
  action text not null,
  control_label text,
  target_type text,
  target_id text,
  target_label text,
  route text,
  status text not null default 'success' check (status in ('success', 'failed', 'denied')),
  details jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text
);

create index if not exists idx_system_activity_created
  on public.system_activity_logs (created_at desc);

create index if not exists idx_system_activity_actor
  on public.system_activity_logs (actor_id, created_at desc);

create index if not exists idx_system_activity_role_module
  on public.system_activity_logs (actor_role, module, created_at desc);

alter table public.system_activity_logs enable row level security;

drop policy if exists "Superadmin reads system_activity_logs" on public.system_activity_logs;
create policy "Superadmin reads system_activity_logs"
  on public.system_activity_logs
  for select
  to authenticated
  using (public.is_superadmin());

create or replace function public.prevent_system_activity_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'system_activity_logs cannot be modified or deleted';
end;
$$;

drop trigger if exists trg_prevent_system_activity_mutation on public.system_activity_logs;
create trigger trg_prevent_system_activity_mutation
  before update or delete on public.system_activity_logs
  for each row
  execute function public.prevent_system_activity_mutation();

-- ============================================================
-- 12h. Remove gallon_type Across All Tables & Consolidate gallon_stock
-- ============================================================
do $$
begin
  -- 1. Consolidate multi-row (slim/round) gallon_stock per owner into 1 row
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'gallon_stock'
      and column_name = 'gallon_type'
  ) then
    with totals as (
      select
        owner_id,
        (array_agg(id order by updated_at desc, id asc))[1] as keep_id,
        coalesce(sum(on_hand_qty), 0)::integer as total_on_hand,
        coalesce(sum(damaged_qty), 0)::integer as total_damaged
      from public.gallon_stock
      group by owner_id
    )
    update public.gallon_stock gs
    set on_hand_qty = t.total_on_hand,
        damaged_qty = t.total_damaged
    from totals t
    where gs.id = t.keep_id;

    delete from public.gallon_stock gs
    using (
      select id,
             row_number() over (partition by owner_id order by updated_at desc, id asc) as rn
      from public.gallon_stock
    ) dup
    where gs.id = dup.id
      and dup.rn > 1;

    alter table public.gallon_stock
      drop constraint if exists gallon_stock_owner_id_gallon_type_key;

    alter table public.gallon_stock
      drop column if exists gallon_type;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'uq_gallon_stock_owner'
  ) then
    alter table public.gallon_stock
      add constraint uq_gallon_stock_owner unique (owner_id);
  end if;
end $$;

alter table public.pos_products drop column if exists gallon_type;
alter table public.pos_sale_items drop column if exists gallon_type;
alter table public.deliveries drop column if exists gallon_type;
alter table public.gallon_inventory_logs drop column if exists gallon_type;
alter table public.borrowed_gallons drop column if exists gallon_type;

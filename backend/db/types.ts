/**
 * Supabase Database schema types.
 * Keeps TypeScript in sync with backend/db/schema.sql.
 * You can also regenerate automatically after adding tables:
 *   npx supabase gen types typescript --project-id <your-project-id> > backend/db/types.ts
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "superadmin" | "owner" | "cashier" | "staff";
export type StaffRole = "cashier" | "staff";
export type ErrorLogLevel = "critical" | "error" | "warning";
export type ErrorLogLayer = "backend" | "database_auth" | "frontend";
export type ErrorLogSource = "api" | "database" | "auth" | "client" | "system";

export type GallonType = "slim" | "round";
export type PosProductCategory = "refill" | "container" | "accessory";
export type PosPaymentMethod = "cash" | "gcash" | "bank" | "utang";
export type PosSaleStatus = "completed" | "voided";
export type DeliveryOrderType = "refill" | "gallon_with_water";
export type DeliveryPaymentMethod = "cash" | "gcash" | "credit";
export type DeliveryPaymentStatus = "paid" | "unpaid";
export type DeliveryStatus =
  | "pending"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";
export type VendoPeriodType = "daily" | "weekly";
export type GallonMovementType =
  | "restock"
  | "walkin_out"
  | "delivery_out"
  | "borrow_out"
  | "borrow_return"
  | "damaged"
  | "adjustment";
export type BorrowedGallonStatus = "borrowed" | "partial" | "returned";
export type ExpenseCategory =
  | "utilities"
  | "supplies"
  | "maintenance"
  | "salary"
  | "delivery_fuel"
  | "rent"
  | "other";
export type CorrectionEntityType =
  | "pos_sale"
  | "delivery"
  | "vendo"
  | "shift_closing";
export type CorrectionType =
  | "change_payment_method"
  | "update_amount"
  | "cancel_delivery"
  | "adjust_shift_cash"
  | "void_sale";
export type CorrectionStatus = "pending" | "approved" | "rejected";
export type AuditActorRole = "cashier" | "owner" | "superadmin" | "system";
export type AuditModule =
  | "pos"
  | "delivery"
  | "vendo"
  | "expense"
  | "shift"
  | "supervision"
  | "inventory"
  | "security";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          role: UserRole;
          is_active: boolean;
          is_owner_cashier: boolean;
          owner_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          role?: UserRole;
          is_active?: boolean;
          is_owner_cashier?: boolean;
          owner_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          role?: UserRole;
          is_active?: boolean;
          is_owner_cashier?: boolean;
          owner_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      system_error_logs: {
        Row: {
          id: string;
          level: ErrorLogLevel;
          layer: ErrorLogLayer;
          source: ErrorLogSource;
          message: string;
          code: string | null;
          route: string | null;
          stack: string | null;
          metadata: Json;
          user_id: string | null;
          resolved: boolean;
          resolved_at: string | null;
          resolved_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          level: ErrorLogLevel;
          layer?: ErrorLogLayer;
          source?: ErrorLogSource;
          message: string;
          code?: string | null;
          route?: string | null;
          stack?: string | null;
          metadata?: Json;
          user_id?: string | null;
          resolved?: boolean;
          resolved_at?: string | null;
          resolved_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          level?: ErrorLogLevel;
          layer?: ErrorLogLayer;
          source?: ErrorLogSource;
          message?: string;
          code?: string | null;
          route?: string | null;
          stack?: string | null;
          metadata?: Json;
          user_id?: string | null;
          resolved?: boolean;
          resolved_at?: string | null;
          resolved_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      superadmin_access_audit_logs: {
        Row: {
          id: string;
          superadmin_id: string;
          target_owner_id: string;
          scope: "cashier";
          reason: string;
          verified_via: string;
          expires_at: string;
          revoked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          superadmin_id: string;
          target_owner_id: string;
          scope?: "cashier";
          reason: string;
          verified_via?: string;
          expires_at: string;
          revoked_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          revoked_at?: string | null;
        };
        Relationships: [];
      };
      pos_products: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          category: PosProductCategory;
          gallon_type: GallonType | null;
          unit_price: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          category: PosProductCategory;
          gallon_type?: GallonType | null;
          unit_price: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          name?: string;
          category?: PosProductCategory;
          gallon_type?: GallonType | null;
          unit_price?: number;
          is_active?: boolean;
        };
        Relationships: [];
      };
      pos_sales: {
        Row: {
          id: string;
          owner_id: string;
          cashier_id: string | null;
          receipt_no: string;
          customer_name: string | null;
          payment_method: PosPaymentMethod;
          subtotal: number;
          discount: number;
          total_amount: number;
          amount_tendered: number;
          change_amount: number;
          status: PosSaleStatus;
          notes: string | null;
          business_date: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          cashier_id?: string | null;
          receipt_no: string;
          customer_name?: string | null;
          payment_method?: PosPaymentMethod;
          subtotal: number;
          discount?: number;
          total_amount: number;
          amount_tendered?: number;
          change_amount?: number;
          status?: PosSaleStatus;
          notes?: string | null;
          business_date: string;
          created_at?: string;
        };
        Update: {
          payment_method?: PosPaymentMethod;
          amount_tendered?: number;
          change_amount?: number;
          status?: PosSaleStatus;
          notes?: string | null;
        };
        Relationships: [];
      };
      pos_sale_items: {
        Row: {
          id: string;
          sale_id: string;
          product_id: string | null;
          product_name: string;
          category: PosProductCategory;
          gallon_type: GallonType | null;
          quantity: number;
          unit_price: number;
          line_total: number;
        };
        Insert: {
          id?: string;
          sale_id: string;
          product_id?: string | null;
          product_name: string;
          category?: PosProductCategory;
          gallon_type?: GallonType | null;
          quantity: number;
          unit_price: number;
          line_total: number;
        };
        Update: {
          quantity?: number;
          unit_price?: number;
          line_total?: number;
        };
        Relationships: [];
      };
      riders: {
        Row: {
          id: string;
          owner_id: string;
          full_name: string;
          phone: string | null;
          vehicle_info: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          full_name: string;
          phone?: string | null;
          vehicle_info?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          full_name?: string;
          phone?: string | null;
          vehicle_info?: string | null;
          is_active?: boolean;
        };
        Relationships: [];
      };
      delivery_customers: {
        Row: {
          id: string;
          owner_id: string;
          customer_name: string;
          phone: string | null;
          area: string;
          default_unit_price: number;
          gallons_held: number;
          is_active: boolean;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          customer_name: string;
          phone?: string | null;
          area: string;
          default_unit_price?: number;
          gallons_held?: number;
          is_active?: boolean;
          notes?: string | null;
        };
        Update: {
          customer_name?: string;
          phone?: string | null;
          area?: string;
          default_unit_price?: number;
          gallons_held?: number;
          is_active?: boolean;
          notes?: string | null;
        };
        Relationships: [];
      };
      deliveries: {
        Row: {
          id: string;
          owner_id: string;
          cashier_id: string | null;
          rider_id: string | null;
          customer_id: string | null;
          customer_name: string;
          customer_phone: string | null;
          destination: string;
          gallon_type: GallonType;
          order_type: DeliveryOrderType;
          quantity: number;
          empty_gallons_returned: number;
          unit_price: number;
          delivery_fee: number;
          total_amount: number;
          payment_method: DeliveryPaymentMethod;
          payment_status: DeliveryPaymentStatus;
          delivery_status: DeliveryStatus;
          borrowed_gallons_count: number;
          delivered_by: string | null;
          notes: string | null;
          business_date: string;
          delivered_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          cashier_id?: string | null;
          rider_id?: string | null;
          customer_id?: string | null;
          customer_name: string;
          customer_phone?: string | null;
          destination: string;
          gallon_type?: GallonType;
          order_type?: DeliveryOrderType;
          quantity: number;
          empty_gallons_returned?: number;
          unit_price: number;
          delivery_fee?: number;
          total_amount: number;
          payment_method?: DeliveryPaymentMethod;
          payment_status?: DeliveryPaymentStatus;
          delivery_status?: DeliveryStatus;
          borrowed_gallons_count?: number;
          delivered_by?: string | null;
          notes?: string | null;
          business_date: string;
          delivered_at?: string | null;
        };
        Update: {
          rider_id?: string | null;
          unit_price?: number;
          delivery_fee?: number;
          total_amount?: number;
          payment_method?: DeliveryPaymentMethod;
          payment_status?: DeliveryPaymentStatus;
          delivery_status?: DeliveryStatus;
          delivered_at?: string | null;
          notes?: string | null;
        };
        Relationships: [];
      };
      vendo_collections: {
        Row: {
          id: string;
          owner_id: string;
          cashier_id: string | null;
          machine_name: string;
          period_type: VendoPeriodType;
          period_start: string;
          period_end: string;
          amount: number;
          meter_start: number | null;
          meter_end: number | null;
          notes: string | null;
          business_date: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          cashier_id?: string | null;
          machine_name?: string;
          period_type: VendoPeriodType;
          period_start: string;
          period_end: string;
          amount: number;
          meter_start?: number | null;
          meter_end?: number | null;
          notes?: string | null;
          business_date: string;
        };
        Update: {
          amount?: number;
          notes?: string | null;
        };
        Relationships: [];
      };
      gallon_stock: {
        Row: {
          id: string;
          owner_id: string;
          gallon_type: GallonType;
          on_hand_qty: number;
          damaged_qty: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          gallon_type: GallonType;
          on_hand_qty?: number;
          damaged_qty?: number;
        };
        Update: {
          on_hand_qty?: number;
          damaged_qty?: number;
        };
        Relationships: [];
      };
      gallon_inventory_logs: {
        Row: {
          id: string;
          owner_id: string;
          cashier_id: string | null;
          gallon_type: GallonType;
          movement_type: GallonMovementType;
          quantity_delta: number;
          balance_after: number;
          reference_id: string | null;
          notes: string | null;
          business_date: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          cashier_id?: string | null;
          gallon_type: GallonType;
          movement_type: GallonMovementType;
          quantity_delta: number;
          balance_after: number;
          reference_id?: string | null;
          notes?: string | null;
          business_date: string;
        };
        Update: {
          notes?: string | null;
        };
        Relationships: [];
      };
      borrowed_gallons: {
        Row: {
          id: string;
          owner_id: string;
          cashier_id: string | null;
          delivery_id: string | null;
          customer_name: string;
          customer_phone: string | null;
          customer_address: string | null;
          gallon_type: GallonType;
          qty_borrowed: number;
          qty_returned: number;
          deposit_amount: number;
          status: BorrowedGallonStatus;
          borrowed_date: string;
          returned_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          cashier_id?: string | null;
          delivery_id?: string | null;
          customer_name: string;
          customer_phone?: string | null;
          customer_address?: string | null;
          gallon_type?: GallonType;
          qty_borrowed: number;
          qty_returned?: number;
          deposit_amount?: number;
          status?: BorrowedGallonStatus;
          borrowed_date: string;
          returned_at?: string | null;
          notes?: string | null;
        };
        Update: {
          qty_returned?: number;
          status?: BorrowedGallonStatus;
          returned_at?: string | null;
          notes?: string | null;
        };
        Relationships: [];
      };
      shift_closings: {
        Row: {
          id: string;
          owner_id: string;
          cashier_id: string | null;
          business_date: string;
          shift_label: string;
          opening_cash: number;
          walkin_cash_sales: number;
          walkin_digital_sales: number;
          delivery_cash_sales: number;
          delivery_digital_sales: number;
          delivery_unpaid_total: number;
          vendo_daily_income: number;
          expected_cash: number;
          actual_cash: number;
          variance: number;
          total_gross_sales: number;
          walkin_count: number;
          delivery_count: number;
          notes: string | null;
          closed_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          cashier_id?: string | null;
          business_date: string;
          shift_label?: string;
          opening_cash?: number;
          walkin_cash_sales?: number;
          walkin_digital_sales?: number;
          delivery_cash_sales?: number;
          delivery_digital_sales?: number;
          delivery_unpaid_total?: number;
          vendo_daily_income?: number;
          expected_cash?: number;
          actual_cash?: number;
          variance?: number;
          total_gross_sales?: number;
          walkin_count?: number;
          delivery_count?: number;
          notes?: string | null;
          closed_at?: string;
        };
        Update: {
          actual_cash?: number;
          variance?: number;
          notes?: string | null;
        };
        Relationships: [];
      };
      station_expenses: {
        Row: {
          id: string;
          owner_id: string;
          recorded_by: string | null;
          category: ExpenseCategory;
          description: string;
          amount: number;
          expense_date: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          recorded_by?: string | null;
          category: ExpenseCategory;
          description: string;
          amount: number;
          expense_date: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          category?: ExpenseCategory;
          description?: string;
          amount?: number;
          expense_date?: string;
          notes?: string | null;
        };
        Relationships: [];
      };
      correction_requests: {
        Row: {
          id: string;
          owner_id: string;
          requested_by: string | null;
          requester_name: string;
          entity_type: CorrectionEntityType;
          entity_id: string;
          entity_label: string;
          correction_type: CorrectionType;
          reason: string;
          before_snapshot: Json;
          proposed_changes: Json;
          after_snapshot: Json | null;
          status: CorrectionStatus;
          reviewed_by: string | null;
          reviewer_note: string | null;
          reviewed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          requested_by?: string | null;
          requester_name: string;
          entity_type: CorrectionEntityType;
          entity_id: string;
          entity_label: string;
          correction_type: CorrectionType;
          reason: string;
          before_snapshot?: Json;
          proposed_changes?: Json;
          after_snapshot?: Json | null;
          status?: CorrectionStatus;
          reviewed_by?: string | null;
          reviewer_note?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
        };
        Update: {
          after_snapshot?: Json | null;
          status?: CorrectionStatus;
          reviewed_by?: string | null;
          reviewer_note?: string | null;
          reviewed_at?: string | null;
        };
        Relationships: [];
      };
      financial_audit_logs: {
        Row: {
          id: string;
          owner_id: string;
          seq_no: number;
          business_date: string;
          actor_id: string | null;
          actor_name: string;
          actor_role: AuditActorRole;
          module: AuditModule;
          event_type: string;
          entity_type: string;
          entity_id: string | null;
          reference_label: string;
          cash_delta_centavos: number;
          digital_delta_centavos: number;
          utang_delta_centavos: number;
          expense_delta_centavos: number;
          gross_sales_delta_centavos: number;
          summary: string;
          before_snapshot: Json | null;
          after_snapshot: Json | null;
          metadata: Json;
          prev_hash: string;
          entry_hash: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          seq_no: number;
          business_date: string;
          actor_id?: string | null;
          actor_name: string;
          actor_role: AuditActorRole;
          module: AuditModule;
          event_type: string;
          entity_type: string;
          entity_id?: string | null;
          reference_label: string;
          cash_delta_centavos?: number;
          digital_delta_centavos?: number;
          utang_delta_centavos?: number;
          expense_delta_centavos?: number;
          gross_sales_delta_centavos?: number;
          summary: string;
          before_snapshot?: Json | null;
          after_snapshot?: Json | null;
          metadata?: Json;
          prev_hash: string;
          entry_hash: string;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_superadmin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_owner: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      get_current_user_role: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      get_current_user_active: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      get_current_user_owner_id: {
        Args: Record<PropertyKey, never>;
        Returns: string | null;
      };
      current_tenant_owner_id: {
        Args: Record<PropertyKey, never>;
        Returns: string | null;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

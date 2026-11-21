# G-A-Aquavitae

Minimal monochrome daily operations platform for water refilling stations built with **Next.js 16 (App Router, Turbopack, Cache Components)**, **React 19**, **Tailwind CSS v4**, and **server-only Supabase**.

## Modules & Strict Role Separation
- **Cashier (`/cashier`)**: Tablet-first Walk-in POS (`Refill ₱20`, `Gallon Filled with Water ₱160`, Cash / GCash / Utang), Deliveries with Regular Customers & Gallon In/Out tracking, Vendo Income (Daily / Weekly), Gallon Inventory & Borrowed Gallons, Closing Shift automatic peso tally, and Owner Supervision correction requests.
- **Owner (`/owner`)**: Calm, data-dense executive dashboard with Quick Stats, two-series Monochrome Bar Charts, Pending Attention feed, Option A Owner Supervision approval queue, append-only SHA-256 hash-chained **Financial Audit Ledger** (`Every Cent`), Station Expenses & Net Profit tracking, Staff Account management (with `"My Account"` self-cashier flag), and 10s Live Smart Pulse updates.
- **Superadmin (`/superadmin/health`)**: Live parallel service probes, V8 heap monitoring, 3-section Error Logs with `.json`/`.txt`/`.log` exports, Account & Role administration, and 2-Step Password + TOTP Integrity Gate.

## Security Architecture
- **100% Server-Only Supabase**: Zero `NEXT_PUBLIC_*` environment variables, zero Supabase credentials in `.next/static`, and `av_session` `HttpOnly; Secure; SameSite=lax` session cookies.
- **Append-Only Audit Immutability**: `public.financial_audit_logs` uses integer centavo accounting (`bigint`), SHA-256 hash chaining, strict Owner-only read RLS, and a PostgreSQL `BEFORE UPDATE OR DELETE` trigger preventing tampering.

## Setup & Deployment
1. Copy `.env.example` to `.env` and fill in your server-only Supabase values.
2. Apply [backend/db/schema.sql](backend/db/schema.sql) in **Supabase Dashboard → SQL Editor**.
3. Run locally:
   ```bash
   npm install
   npm run dev
   ```
4. Verify before deploying:
   ```bash
   npm run lint
   npm run build
   npx tsc --noEmit
   ```
5. Run separate E2E suites against a running instance (with test credentials provided via environment variables):
   ```bash
   npm run test:cashier
   npm run test:owner
   ```

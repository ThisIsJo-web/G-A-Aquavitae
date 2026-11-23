import "server-only";

import { createSupabaseAdminClient } from "@/backend/db/supabase";
import type { Database, ExpenseCategory } from "@/backend/db/types";
import { AuthServiceError } from "@/backend/services/auth";
import {
  formatCentavosPHP,
  recordFinancialAuditEvent,
  toCentavos,
} from "@/backend/services/audit-ledger";
import {
  listCorrectionRequests,
  type CorrectionRequestsOverview,
} from "@/backend/services/corrections";
import {
  assertOperationalDateAllowed,
  getTodayBusinessDate,
  isMissingCashierSchemaError,
  roundMoney,
  toNumber,
} from "@/backend/services/cashier/shared";

export type OwnerRangeDays = 7 | 30 | 365;
export type StationExpenseRow =
  Database["public"]["Tables"]["station_expenses"]["Row"];

export const EXPENSE_CATEGORIES: {
  value: ExpenseCategory;
  label: string;
}[] = [
    { value: "utilities", label: "Utilities (Water / Electric)" },
    { value: "supplies", label: "Supplies (Seals / Caps / Soap)" },
    { value: "maintenance", label: "Machine Maintenance / Filters" },
    { value: "salary", label: "Staff Wages / Allowance" },
    { value: "delivery_fuel", label: "Fuel & Transport" },
    { value: "rent", label: "Station Rent" },
    { value: "other", label: "Other Expense" },
  ];

const VALID_EXPENSE_CATEGORIES = new Set<ExpenseCategory>(
  EXPENSE_CATEGORIES.map((c) => c.value)
);

export function isValidExpenseCategory(
  value: unknown
): value is ExpenseCategory {
  return (
    typeof value === "string" &&
    VALID_EXPENSE_CATEGORIES.has(value as ExpenseCategory)
  );
}

export function sanitizeRangeDays(value?: string | null): OwnerRangeDays {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "365" || normalized === "annual" || normalized === "annually" || normalized === "yearly" || normalized === "year") {
    return 365;
  }
  if (normalized === "30" || normalized === "monthly" || normalized === "month") {
    return 30;
  }
  return 7;
}

export function getOwnerRangeMeta(rangeDays: OwnerRangeDays): {
  label: string;
  shortLabel: string;
  description: string;
} {
  if (rangeDays === 365) {
    return {
      label: "Annually",
      shortLabel: "12 Months",
      description: "the last 12 months",
    };
  }
  if (rangeDays === 30) {
    return {
      label: "Monthly",
      shortLabel: "30 Days",
      description: "the last 30 days",
    };
  }
  return {
    label: "Weekly",
    shortLabel: "7 Days",
    description: "the last 7 days",
  };
}

function isMissingExpensesTableError(
  error: { code?: string; message?: string } | null | undefined
): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    Boolean(error.message?.match(/station_expenses/i))
  );
}

function addDays(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function formatShortDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(dt);
}

function formatFullDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(dt);
}

function buildLast12Months(endDate: string): {
  key: string;
  shortLabel: string;
  fullLabel: string;
  startIso: string;
}[] {
  const [endYear, endMonth] = endDate.split("-").map(Number);
  const months: {
    key: string;
    shortLabel: string;
    fullLabel: string;
    startIso: string;
  }[] = [];

  for (let offset = 11; offset >= 0; offset -= 1) {
    const dt = new Date(Date.UTC(endYear, endMonth - 1 - offset, 1));
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const shortMonth = new Intl.DateTimeFormat("en-US", {
      month: "short",
      timeZone: "UTC",
    }).format(dt);
    const fullMonth = new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(dt);
    months.push({
      key: `${yy}-${mm}`,
      shortLabel: shortMonth,
      fullLabel: fullMonth,
      startIso: `${yy}-${mm}-01`,
    });
  }
  return months;
}

export interface OwnerChartPoint {
  label: string;
  tooltipLabel?: string;
  primary: number;
  secondary: number;
}

export interface OwnerPendingItem {
  id: string;
  kind: "corrections" | "unpaid" | "low_stock" | "borrowed" | "shortage";
  title: string;
  detail: string;
  metric: string;
  targetTab: "supervision" | "customers" | "inventory" | "sales" | "overview";
  targetSubView?: string;
}

export interface OwnerStockLogRow {
  id: string;
  businessDate: string;
  movementType: string;
  quantityDelta: number;
  balanceAfter: number;
  notes: string | null;
  createdAt: string;
}

export interface OwnerUnifiedSaleRow {
  id: string;
  businessDate: string;
  createdAt: string;
  channel: "walkin" | "delivery" | "vendo";
  reference: string;
  customerLabel: string;
  gallons: number;
  paymentMethod: string;
  status: "paid" | "unpaid" | "utang" | "voided";
  amount: number;
}

export interface OwnerShiftRow {
  id: string;
  businessDate: string;
  shiftLabel: string;
  totalGrossSales: number;
  expectedCash: number;
  actualCash: number;
  variance: number;
  walkinCount: number;
  deliveryCount: number;
  notes: string | null;
  closedAt: string;
}

export interface OwnerExpenseCategorySummary {
  category: ExpenseCategory;
  label: string;
  total: number;
  count: number;
}

export interface OwnerCustomerSummary {
  id: string;
  customerName: string;
  phone: string | null;
  area: string;
  defaultUnitPrice: number;
  gallonsHeld: number;
  unpaidTotal: number;
  unpaidCount: number;
  totalDeliveriesInRange: number;
}

export interface OwnerUnpaidBill {
  id: string;
  source: "delivery" | "walkin_utang";
  customerName: string;
  detail: string;
  businessDate: string;
  amount: number;
}

export interface OwnerBorrowedItem {
  id: string;
  customerName: string;
  customerPhone: string | null;
  customerAddress: string | null;
  qtyBorrowed: number;
  qtyReturned: number;
  remaining: number;
  depositAmount: number;
  status: "borrowed" | "partial" | "returned";
  borrowedDate: string;
}

export interface OwnerDashboardSnapshot {
  rangeDays: OwnerRangeDays;
  startDate: string;
  endDate: string;
  generatedAt: string;
  schemaMissing: boolean;
  expensesSchemaMissing: boolean;
  quickStats: {
    totalSales: number;
    walkinSales: number;
    deliverySales: number;
    vendoSales: number;
    gallonsSold: number;
    walkinGallons: number;
    deliveryGallons: number;
    unpaidBalances: number;
    unpaidCount: number;
    totalExpenses: number;
    netProfit: number;
    onHandGallons: number;
    damagedGallons: number;
    borrowedOutGallons: number;
  };
  salesVsExpensesChart: OwnerChartPoint[];
  gallonsChart: OwnerChartPoint[];
  pendingItems: OwnerPendingItem[];
  salesRows: OwnerUnifiedSaleRow[];
  shiftClosings: OwnerShiftRow[];
  expenses: StationExpenseRow[];
  expensesByCategory: OwnerExpenseCategorySummary[];
  customers: OwnerCustomerSummary[];
  unpaidBills: OwnerUnpaidBill[];
  borrowedItems: OwnerBorrowedItem[];
  stockLogs: OwnerStockLogRow[];
  corrections: CorrectionRequestsOverview;
}

const LOW_STOCK_THRESHOLD = 20;

export async function getOwnerDashboardSnapshot(
  ownerId: string,
  rangeDays: OwnerRangeDays = 7
): Promise<OwnerDashboardSnapshot> {
  const endDate = getTodayBusinessDate();
  const annualMonths = rangeDays === 365 ? buildLast12Months(endDate) : [];
  const startDate =
    rangeDays === 365
      ? annualMonths[0].startIso
      : addDays(endDate, -(rangeDays - 1));
  const admin = createSupabaseAdminClient();

  // Paginated fetch helper so Annual (12-month) analytics stay 100% accurate
  // even when a busy station exceeds PostgREST's 1,000-row default page cap.
  async function fetchAllRows<T>(
    buildPage: (from: number, to: number) => PromiseLike<{
      data: T[] | null;
      error: { code?: string; message?: string } | null;
    }>
  ): Promise<{
    data: T[];
    error: { code?: string; message?: string } | null;
  }> {
    const pageSize = 1000;
    const maxPages = rangeDays === 365 ? 10 : 3;
    const collected: T[] = [];

    for (let page = 0; page < maxPages; page += 1) {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const res = await buildPage(from, to);
      if (res.error) {
        return { data: [], error: res.error };
      }
      const batch = res.data ?? [];
      collected.push(...batch);
      if (batch.length < pageSize) break;
    }

    return { data: collected, error: null };
  }

  const [
    posSalesRes,
    allUnpaidUtangRes,
    deliveriesInRangeRes,
    allUnpaidDeliveriesRes,
    vendoRes,
    expensesRes,
    shiftsRes,
    customersRes,
    borrowedRes,
    stockRes,
    stockLogsRes,
    correctionsOverview,
  ] = await Promise.all([
    fetchAllRows((from, to) =>
      admin
        .from("pos_sales")
        .select(
          "id, receipt_no, customer_name, payment_method, total_amount, status, business_date, created_at, pos_sale_items(quantity)"
        )
        .eq("owner_id", ownerId)
        .gte("business_date", startDate)
        .lte("business_date", endDate)
        .order("created_at", { ascending: false })
        .range(from, to)
    ),
    admin
      .from("pos_sales")
      .select("id, receipt_no, customer_name, total_amount, business_date, created_at")
      .eq("owner_id", ownerId)
      .eq("status", "completed")
      .eq("payment_method", "utang")
      .order("created_at", { ascending: false })
      .limit(100),
    fetchAllRows((from, to) =>
      admin
        .from("deliveries")
        .select("*")
        .eq("owner_id", ownerId)
        .gte("business_date", startDate)
        .lte("business_date", endDate)
        .order("created_at", { ascending: false })
        .range(from, to)
    ),
    admin
      .from("deliveries")
      .select(
        "id, customer_id, customer_name, destination, quantity, total_amount, business_date, delivery_status, payment_status"
      )
      .eq("owner_id", ownerId)
      .eq("payment_status", "unpaid")
      .neq("delivery_status", "cancelled")
      .order("business_date", { ascending: false })
      .limit(150),
    fetchAllRows((from, to) =>
      admin
        .from("vendo_collections")
        .select("*")
        .eq("owner_id", ownerId)
        .gte("business_date", startDate)
        .lte("business_date", endDate)
        .order("created_at", { ascending: false })
        .range(from, to)
    ),
    fetchAllRows((from, to) =>
      admin
        .from("station_expenses")
        .select("*")
        .eq("owner_id", ownerId)
        .gte("expense_date", startDate)
        .lte("expense_date", endDate)
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(from, to)
    ),
    admin
      .from("shift_closings")
      .select("*")
      .eq("owner_id", ownerId)
      .gte("business_date", startDate)
      .lte("business_date", endDate)
      .order("business_date", { ascending: false })
      .order("closed_at", { ascending: false })
      .limit(60),
    admin
      .from("delivery_customers")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("is_active", true)
      .order("customer_name", { ascending: true }),
    admin
      .from("borrowed_gallons")
      .select("*")
      .eq("owner_id", ownerId)
      .in("status", ["borrowed", "partial"])
      .order("borrowed_date", { ascending: false }),
    admin
      .from("gallon_stock")
      .select("on_hand_qty, damaged_qty")
      .eq("owner_id", ownerId),
    admin
      .from("gallon_inventory_logs")
      .select("*")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false })
      .limit(30),
    listCorrectionRequests(ownerId, 60),
  ]);

  const schemaMissing =
    isMissingCashierSchemaError(posSalesRes.error) ||
    isMissingCashierSchemaError(deliveriesInRangeRes.error) ||
    isMissingCashierSchemaError(vendoRes.error);

  const expensesSchemaMissing = isMissingExpensesTableError(expensesRes.error);

  const posSales = posSalesRes.error ? [] : (posSalesRes.data ?? []);
  const allUnpaidUtang = allUnpaidUtangRes.error
    ? []
    : (allUnpaidUtangRes.data ?? []);
  const deliveries = deliveriesInRangeRes.error
    ? []
    : (deliveriesInRangeRes.data ?? []);
  const allUnpaidDeliveries = allUnpaidDeliveriesRes.error
    ? []
    : (allUnpaidDeliveriesRes.data ?? []);
  const vendoRows = vendoRes.error ? [] : (vendoRes.data ?? []);
  const expenses = expensesRes.error ? [] : (expensesRes.data ?? []);
  const shiftRows = shiftsRes.error ? [] : (shiftsRes.data ?? []);
  const customerRows = customersRes.error ? [] : (customersRes.data ?? []);
  const borrowedRows = borrowedRes.error ? [] : (borrowedRes.data ?? []);
  const stockRows = stockRes.error ? [] : (stockRes.data ?? []);
  const stockLogRows = stockLogsRes.error ? [] : (stockLogsRes.data ?? []);

  // Read walk-in item quantities directly from the nested relational join (0 extra queries)
  const saleQtyBySaleId = new Map<string, number>();
  for (const sale of posSales) {
    const joinedItems = (
      sale as unknown as { pos_sale_items?: { quantity: number }[] }
    ).pos_sale_items;
    if (Array.isArray(joinedItems)) {
      let sum = 0;
      for (const item of joinedItems) {
        sum += Number(item.quantity) || 0;
      }
      saleQtyBySaleId.set(sale.id, sum);
    }
  }

  // Daily accumulators for Weekly & Monthly charts (and monthly keys for Annual)
  const dailySales = new Map<string, number>();
  const dailyExpenses = new Map<string, number>();
  const dailyWalkinGallons = new Map<string, number>();
  const dailyDeliveryGallons = new Map<string, number>();

  const allDates: string[] = [];
  if (rangeDays !== 365) {
    for (let i = 0; i < rangeDays; i += 1) {
      const d = addDays(startDate, i);
      allDates.push(d);
      dailySales.set(d, 0);
      dailyExpenses.set(d, 0);
      dailyWalkinGallons.set(d, 0);
      dailyDeliveryGallons.set(d, 0);
    }
  }

  let walkinSales = 0;
  let walkinGallons = 0;
  let deliverySales = 0;
  let deliveryGallons = 0;
  let vendoSales = 0;
  let totalExpenses = 0;

  const salesRows: OwnerUnifiedSaleRow[] = [];

  for (const sale of posSales) {
    const amount = toNumber(sale.total_amount);
    const qty = saleQtyBySaleId.get(sale.id) ?? 0;

    if (sale.status === "completed") {
      walkinSales += amount;
      walkinGallons += qty;
      dailySales.set(
        sale.business_date,
        (dailySales.get(sale.business_date) ?? 0) + amount
      );
      dailyWalkinGallons.set(
        sale.business_date,
        (dailyWalkinGallons.get(sale.business_date) ?? 0) + qty
      );
    }

    salesRows.push({
      id: `pos-${sale.id}`,
      businessDate: sale.business_date,
      createdAt: sale.created_at,
      channel: "walkin",
      reference: sale.receipt_no,
      customerLabel: sale.customer_name || "Walk-in Customer",
      gallons: qty,
      paymentMethod:
        sale.payment_method === "utang"
          ? "Utang"
          : sale.payment_method === "gcash"
            ? "GCash"
            : sale.payment_method === "bank"
              ? "Bank"
              : "Cash",
      status:
        sale.status === "voided"
          ? "voided"
          : sale.payment_method === "utang"
            ? "utang"
            : "paid",
      amount: roundMoney(amount),
    });
  }

  const deliveriesInRangeByCustomer = new Map<string, number>();

  for (const del of deliveries) {
    const amount = toNumber(del.total_amount);
    const isActive = del.delivery_status !== "cancelled";

    if (isActive) {
      deliverySales += amount;
      deliveryGallons += del.quantity;
      dailySales.set(
        del.business_date,
        (dailySales.get(del.business_date) ?? 0) + amount
      );
      dailyDeliveryGallons.set(
        del.business_date,
        (dailyDeliveryGallons.get(del.business_date) ?? 0) + del.quantity
      );
      if (del.customer_id) {
        deliveriesInRangeByCustomer.set(
          del.customer_id,
          (deliveriesInRangeByCustomer.get(del.customer_id) ?? 0) + 1
        );
      }
    }

    salesRows.push({
      id: `del-${del.id}`,
      businessDate: del.business_date,
      createdAt: del.created_at,
      channel: "delivery",
      reference: del.destination,
      customerLabel: del.customer_name,
      gallons: del.quantity,
      paymentMethod:
        del.payment_method === "credit"
          ? "Utang"
          : del.payment_method === "gcash"
            ? "GCash"
            : "Cash",
      status:
        del.delivery_status === "cancelled"
          ? "voided"
          : del.payment_status === "paid"
            ? "paid"
            : "unpaid",
      amount: roundMoney(amount),
    });
  }

  for (const ven of vendoRows) {
    const amount = toNumber(ven.amount);
    vendoSales += amount;
    dailySales.set(
      ven.business_date,
      (dailySales.get(ven.business_date) ?? 0) + amount
    );

    salesRows.push({
      id: `ven-${ven.id}`,
      businessDate: ven.business_date,
      createdAt: ven.created_at,
      channel: "vendo",
      reference: ven.machine_name,
      customerLabel: "Monthly Collection",
      gallons: 0,
      paymentMethod: "Coins",
      status: "paid",
      amount: roundMoney(amount),
    });
  }

  salesRows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // Expenses aggregation
  const catTotals = new Map<ExpenseCategory, { total: number; count: number }>();
  for (const cat of EXPENSE_CATEGORIES) {
    catTotals.set(cat.value, { total: 0, count: 0 });
  }

  for (const exp of expenses) {
    const amt = toNumber(exp.amount);
    totalExpenses += amt;
    dailyExpenses.set(
      exp.expense_date,
      (dailyExpenses.get(exp.expense_date) ?? 0) + amt
    );
    const existing = catTotals.get(exp.category) ?? { total: 0, count: 0 };
    catTotals.set(exp.category, {
      total: roundMoney(existing.total + amt),
      count: existing.count + 1,
    });
  }

  const expensesByCategory: OwnerExpenseCategorySummary[] = EXPENSE_CATEGORIES.map(
    (c) => {
      const entry = catTotals.get(c.value) ?? { total: 0, count: 0 };
      return {
        category: c.value,
        label: c.label,
        total: roundMoney(entry.total),
        count: entry.count,
      };
    }
  ).sort((a, b) => b.total - a.total);

  // Build chart series:
  // - Weekly (7d): 7 daily bars (Nov 17 .. Nov 23)
  // - Monthly (30d): 6 five-day buckets with unambiguous cross-month labels (Oct 30–Nov 3)
  // - Annually (365d): 12 calendar-month bars (Dec .. Nov)
  const salesVsExpensesChart: OwnerChartPoint[] = [];
  const gallonsChart: OwnerChartPoint[] = [];

  if (rangeDays === 7) {
    for (const d of allDates) {
      const label = formatShortDate(d);
      const tooltipLabel = formatFullDate(d);
      salesVsExpensesChart.push({
        label,
        tooltipLabel,
        primary: roundMoney(dailySales.get(d) ?? 0),
        secondary: roundMoney(dailyExpenses.get(d) ?? 0),
      });
      gallonsChart.push({
        label,
        tooltipLabel,
        primary: dailyWalkinGallons.get(d) ?? 0,
        secondary: dailyDeliveryGallons.get(d) ?? 0,
      });
    }
  } else if (rangeDays === 30) {
    const bucketSize = 5;
    for (let i = 0; i < allDates.length; i += bucketSize) {
      const slice = allDates.slice(i, i + bucketSize);
      const first = slice[0];
      const last = slice[slice.length - 1];
      const sameMonth = first.slice(0, 7) === last.slice(0, 7);
      const label = sameMonth
        ? `${formatShortDate(first)}–${Number(last.slice(8))}`
        : `${formatShortDate(first)}–${formatShortDate(last)}`;
      const tooltipLabel = `${formatFullDate(first)} – ${formatFullDate(last)}`;

      let bucketSales = 0;
      let bucketExp = 0;
      let bucketWalkin = 0;
      let bucketDel = 0;

      for (const d of slice) {
        bucketSales += dailySales.get(d) ?? 0;
        bucketExp += dailyExpenses.get(d) ?? 0;
        bucketWalkin += dailyWalkinGallons.get(d) ?? 0;
        bucketDel += dailyDeliveryGallons.get(d) ?? 0;
      }

      salesVsExpensesChart.push({
        label,
        tooltipLabel,
        primary: roundMoney(bucketSales),
        secondary: roundMoney(bucketExp),
      });
      gallonsChart.push({
        label,
        tooltipLabel,
        primary: bucketWalkin,
        secondary: bucketDel,
      });
    }
  } else {
    // Annual: aggregate all daily maps into exact YYYY-MM calendar months
    const monthSales = new Map<string, number>();
    const monthExpenses = new Map<string, number>();
    const monthWalkin = new Map<string, number>();
    const monthDelivery = new Map<string, number>();

    for (const [d, val] of dailySales) {
      const mk = d.slice(0, 7);
      monthSales.set(mk, (monthSales.get(mk) ?? 0) + val);
    }
    for (const [d, val] of dailyExpenses) {
      const mk = d.slice(0, 7);
      monthExpenses.set(mk, (monthExpenses.get(mk) ?? 0) + val);
    }
    for (const [d, val] of dailyWalkinGallons) {
      const mk = d.slice(0, 7);
      monthWalkin.set(mk, (monthWalkin.get(mk) ?? 0) + val);
    }
    for (const [d, val] of dailyDeliveryGallons) {
      const mk = d.slice(0, 7);
      monthDelivery.set(mk, (monthDelivery.get(mk) ?? 0) + val);
    }

    for (const m of annualMonths) {
      salesVsExpensesChart.push({
        label: m.shortLabel,
        tooltipLabel: m.fullLabel,
        primary: roundMoney(monthSales.get(m.key) ?? 0),
        secondary: roundMoney(monthExpenses.get(m.key) ?? 0),
      });
      gallonsChart.push({
        label: m.shortLabel,
        tooltipLabel: m.fullLabel,
        primary: monthWalkin.get(m.key) ?? 0,
        secondary: monthDelivery.get(m.key) ?? 0,
      });
    }
  }

  // Unpaid balances (Deliveries + Walk-in Utang)
  const unpaidByCustomerId = new Map<string, { total: number; count: number }>();
  const unpaidBills: OwnerUnpaidBill[] = [];
  let unpaidBalances = 0;

  for (const d of allUnpaidDeliveries) {
    const amt = toNumber(d.total_amount);
    unpaidBalances += amt;
    unpaidBills.push({
      id: d.id,
      source: "delivery",
      customerName: d.customer_name,
      detail: `${d.quantity} gal · ${d.destination}`,
      businessDate: d.business_date,
      amount: roundMoney(amt),
    });

    if (d.customer_id) {
      const cur = unpaidByCustomerId.get(d.customer_id) ?? {
        total: 0,
        count: 0,
      };
      unpaidByCustomerId.set(d.customer_id, {
        total: roundMoney(cur.total + amt),
        count: cur.count + 1,
      });
    }
  }

  for (const u of allUnpaidUtang) {
    const amt = toNumber(u.total_amount);
    unpaidBalances += amt;
    unpaidBills.push({
      id: u.id,
      source: "walkin_utang",
      customerName: u.customer_name || "Walk-in Customer",
      detail: `Walk-in Utang · ${u.receipt_no}`,
      businessDate: u.business_date,
      amount: roundMoney(amt),
    });
  }

  unpaidBills.sort((a, b) => b.businessDate.localeCompare(a.businessDate));

  // Stock & Borrowed containers
  const onHandGallons = stockRows.reduce((sum, r) => sum + r.on_hand_qty, 0);
  const damagedGallons = stockRows.reduce((sum, r) => sum + r.damaged_qty, 0);
  const stockLogs: OwnerStockLogRow[] = stockLogRows.map((log) => ({
    id: log.id,
    businessDate: log.business_date,
    movementType: log.movement_type,
    quantityDelta: log.quantity_delta,
    balanceAfter: log.balance_after,
    notes: log.notes,
    createdAt: log.created_at,
  }));
  const borrowedItems: OwnerBorrowedItem[] = borrowedRows.map((b) => ({
    id: b.id,
    customerName: b.customer_name,
    customerPhone: b.customer_phone,
    customerAddress: b.customer_address,
    qtyBorrowed: b.qty_borrowed,
    qtyReturned: b.qty_returned,
    remaining: Math.max(0, b.qty_borrowed - b.qty_returned),
    depositAmount: roundMoney(toNumber(b.deposit_amount)),
    status: b.status,
    borrowedDate: b.borrowed_date,
  }));

  const borrowedOutGallons = borrowedItems.reduce(
    (sum, b) => sum + b.remaining,
    0
  );

  // Regular customers enriched with unpaid & held balances
  const customers: OwnerCustomerSummary[] = customerRows.map((c) => {
    const unpaid = unpaidByCustomerId.get(c.id) ?? { total: 0, count: 0 };
    return {
      id: c.id,
      customerName: c.customer_name,
      phone: c.phone,
      area: c.area,
      defaultUnitPrice: roundMoney(toNumber(c.default_unit_price)),
      gallonsHeld: c.gallons_held,
      unpaidTotal: unpaid.total,
      unpaidCount: unpaid.count,
      totalDeliveriesInRange: deliveriesInRangeByCustomer.get(c.id) ?? 0,
    };
  });

  // Shift closings
  const shiftClosings: OwnerShiftRow[] = shiftRows.map((s) => ({
    id: s.id,
    businessDate: s.business_date,
    shiftLabel: s.shift_label,
    totalGrossSales: roundMoney(toNumber(s.total_gross_sales)),
    expectedCash: roundMoney(toNumber(s.expected_cash)),
    actualCash: roundMoney(toNumber(s.actual_cash)),
    variance: roundMoney(toNumber(s.variance)),
    walkinCount: s.walkin_count,
    deliveryCount: s.delivery_count,
    notes: s.notes,
    closedAt: s.closed_at,
  }));

  // Pending Attention Feed
  const pendingItems: OwnerPendingItem[] = [];

  if (correctionsOverview.pendingCount > 0) {
    pendingItems.push({
      id: "pending-corrections",
      kind: "corrections",
      title: "Cashier Correction Requests",
      detail: `${correctionsOverview.pendingCount} cashier ${correctionsOverview.pendingCount === 1 ? "error awaits" : "errors await"} your approval`,
      metric: `${correctionsOverview.pendingCount} pending`,
      targetTab: "supervision",
    });
  }

  if (unpaidBills.length > 0) {
    pendingItems.push({
      id: "pending-unpaid",
      kind: "unpaid",
      title: "Unpaid Bills & Utang",
      detail: `${unpaidBills.length} open ${unpaidBills.length === 1 ? "balance" : "balances"} waiting for collection`,
      metric: `₱${roundMoney(unpaidBalances).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      targetTab: "customers",
      targetSubView: "unpaid",
    });
  }

  if (onHandGallons < LOW_STOCK_THRESHOLD) {
    pendingItems.push({
      id: "pending-low-stock",
      kind: "low_stock",
      title: "Low Gallon Stock",
      detail: `Station on-hand inventory is below ${LOW_STOCK_THRESHOLD} gallons`,
      metric: `${onHandGallons} on hand`,
      targetTab: "inventory",
    });
  }

  if (borrowedOutGallons > 0) {
    pendingItems.push({
      id: "pending-borrowed",
      kind: "borrowed",
      title: "Unreturned Borrowed Gallons",
      detail: `${borrowedItems.length} ${borrowedItems.length === 1 ? "customer" : "customers"} currently holding station containers`,
      metric: `${borrowedOutGallons} gal out`,
      targetTab: "inventory",
    });
  }

  const shortageShifts = shiftClosings.filter(
    (s) => s.businessDate >= startDate && s.variance < 0
  );
  if (shortageShifts.length > 0) {
    const totalShortage = shortageShifts.reduce(
      (sum, s) => sum + Math.abs(s.variance),
      0
    );
    pendingItems.push({
      id: "pending-shortages",
      kind: "shortage",
      title: "Shift Closing Shortages",
      detail: `${shortageShifts.length} closed ${shortageShifts.length === 1 ? "shift" : "shifts"} recorded cash short in the last ${rangeDays} days`,
      metric: `-₱${roundMoney(totalShortage).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      targetTab: "sales",
      targetSubView: "shifts",
    });
  }

  const totalSales = roundMoney(walkinSales + deliverySales + vendoSales);
  const roundedExpenses = roundMoney(totalExpenses);

  return {
    rangeDays,
    startDate,
    endDate,
    generatedAt: new Date().toISOString(),
    schemaMissing,
    expensesSchemaMissing,
    quickStats: {
      totalSales,
      walkinSales: roundMoney(walkinSales),
      deliverySales: roundMoney(deliverySales),
      vendoSales: roundMoney(vendoSales),
      gallonsSold: walkinGallons + deliveryGallons,
      walkinGallons,
      deliveryGallons,
      unpaidBalances: roundMoney(unpaidBalances),
      unpaidCount: unpaidBills.length,
      totalExpenses: roundedExpenses,
      netProfit: roundMoney(totalSales - roundedExpenses),
      onHandGallons,
      damagedGallons,
      borrowedOutGallons,
    },
    salesVsExpensesChart,
    gallonsChart,
    pendingItems,
    salesRows,
    shiftClosings,
    expenses,
    expensesByCategory,
    customers,
    unpaidBills,
    borrowedItems,
    stockLogs,
    corrections: correctionsOverview,
  };
}

export interface OwnerPulseSnapshot {
  version: string;
  pendingCorrections: number;
  checkedAt: string;
}

/**
 * Ultra-lightweight change-detection pulse for /api/owner/pulse.
 * Because every money/supervision action appends a monotonic seq_no to
 * financial_audit_logs, checking just 4 tiny indexed queries covers all
 * sales, deliveries, vendo, expenses, shifts, corrections, stock, and customers.
 */
export async function getOwnerPulse(
  ownerId: string
): Promise<OwnerPulseSnapshot> {
  const admin = createSupabaseAdminClient();

  const [auditLatestRes, corrPendingRes, stockLogRes, customerRes] =
    await Promise.all([
      admin
        .from("financial_audit_logs")
        .select("seq_no, created_at")
        .eq("owner_id", ownerId)
        .order("seq_no", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("correction_requests")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", ownerId)
        .eq("status", "pending"),
      admin
        .from("gallon_inventory_logs")
        .select("created_at")
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("delivery_customers")
        .select("updated_at")
        .eq("owner_id", ownerId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const pendingCorrections = corrPendingRes.error
    ? 0
    : (corrPendingRes.count ?? 0);

  // Fallback to direct table checks only if financial_audit_logs isn't created yet
  if (auditLatestRes.error) {
    const [posRes, delRes, venRes, shiftRes, expRes] = await Promise.all([
      admin
        .from("pos_sales")
        .select("created_at, status, payment_method")
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("deliveries")
        .select("updated_at")
        .eq("owner_id", ownerId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("vendo_collections")
        .select("created_at, amount")
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("shift_closings")
        .select("closed_at, actual_cash")
        .eq("owner_id", ownerId)
        .order("closed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("station_expenses")
        .select("created_at")
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const fallbackVersion = [
      posRes.data
        ? `${posRes.data.created_at}:${posRes.data.status}:${posRes.data.payment_method}`
        : "0",
      delRes.data?.updated_at ?? "0",
      venRes.data ? `${venRes.data.created_at}:${venRes.data.amount}` : "0",
      shiftRes.data
        ? `${shiftRes.data.closed_at}:${shiftRes.data.actual_cash}`
        : "0",
      expRes.data?.created_at ?? "0",
      String(pendingCorrections),
      stockLogRes.data?.created_at ?? "0",
      customerRes.data?.updated_at ?? "0",
    ].join("|");

    return {
      version: fallbackVersion,
      pendingCorrections,
      checkedAt: new Date().toISOString(),
    };
  }

  const version = [
    auditLatestRes.data
      ? `${auditLatestRes.data.seq_no}:${auditLatestRes.data.created_at}`
      : "0",
    String(pendingCorrections),
    stockLogRes.data?.created_at ?? "0",
    customerRes.data?.updated_at ?? "0",
  ].join("|");

  return {
    version,
    pendingCorrections,
    checkedAt: new Date().toISOString(),
  };
}

export async function createStationExpense(
  ownerId: string,
  recordedBy: string,
  input: {
    category: ExpenseCategory;
    description: string;
    amount: number;
    expenseDate?: string;
    notes?: string;
  }
): Promise<StationExpenseRow> {
  const description = input.description.trim();
  if (!description) {
    throw new AuthServiceError("Expense description is required.", 400);
  }
  if (!isValidExpenseCategory(input.category)) {
    throw new AuthServiceError("Please choose a valid expense category.", 400);
  }
  const amount = roundMoney(toNumber(input.amount, -1));
  if (amount < 0) {
    throw new AuthServiceError("Expense amount must be zero or greater.", 400);
  }

  const expenseDate = assertOperationalDateAllowed(
    input.expenseDate,
    30,
    "Expense date"
  );
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("station_expenses")
    .insert({
      owner_id: ownerId,
      recorded_by: recordedBy,
      category: input.category,
      description,
      amount,
      expense_date: expenseDate,
      notes: input.notes?.trim() || null,
    })
    .select("*")
    .single();

  if (error || !data) {
    if (isMissingExpensesTableError(error)) {
      throw new AuthServiceError(
        "The station_expenses table is not created yet. Run Section 12b of backend/db/schema.sql in Supabase SQL Editor.",
        503
      );
    }
    throw new AuthServiceError(
      error?.message ?? "Failed to save station expense.",
      500
    );
  }

  const amtCents = toCentavos(amount);
  await recordFinancialAuditEvent({
    ownerId,
    businessDate: expenseDate,
    actorId: recordedBy,
    module: "expense",
    eventType: "expense.created",
    entityType: "expense",
    entityId: data.id,
    referenceLabel: `${input.category.toUpperCase()} · ${description}`,
    expenseDeltaCentavos: amtCents,
    summary: `Recorded station expense (${input.category}): ${description} (${formatCentavosPHP(amtCents)})`,
    afterSnapshot: {
      category: data.category,
      description: data.description,
      amount: toNumber(data.amount),
      expense_date: data.expense_date,
      notes: data.notes,
    },
  });

  return data;
}

export async function deleteStationExpense(
  ownerId: string,
  expenseId: string,
  actorId: string = ownerId
): Promise<void> {
  if (!expenseId.trim()) {
    throw new AuthServiceError("Expense ID is required.", 400);
  }

  const admin = createSupabaseAdminClient();
  const { data: before } = await admin
    .from("station_expenses")
    .select("*")
    .eq("id", expenseId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  const { error } = await admin
    .from("station_expenses")
    .delete()
    .eq("id", expenseId)
    .eq("owner_id", ownerId);

  if (error) {
    throw new AuthServiceError(
      error.message || "Failed to delete station expense.",
      500
    );
  }

  if (before) {
    const amtCents = toCentavos(before.amount);
    await recordFinancialAuditEvent({
      ownerId,
      businessDate: before.expense_date,
      actorId,
      module: "expense",
      eventType: "expense.deleted",
      entityType: "expense",
      entityId: before.id,
      referenceLabel: `${before.category.toUpperCase()} · ${before.description}`,
      expenseDeltaCentavos: -amtCents,
      summary: `Deleted station expense (${before.category}): ${before.description} (-${formatCentavosPHP(amtCents)})`,
      beforeSnapshot: {
        category: before.category,
        description: before.description,
        amount: toNumber(before.amount),
        expense_date: before.expense_date,
        notes: before.notes,
      },
      afterSnapshot: null,
    });
  }
}

export async function deleteStationExpensesBulk(
  ownerId: string,
  actorId: string,
  ids: string[]
): Promise<{ deletedCount: number }> {
  const uniqueIds = Array.from(
    new Set(ids.map((id) => id.trim()).filter(Boolean))
  ).slice(0, 100);

  if (uniqueIds.length === 0) {
    throw new AuthServiceError("Select at least one expense to delete.", 400);
  }

  const admin = createSupabaseAdminClient();
  const { data: beforeRows } = await admin
    .from("station_expenses")
    .select("*")
    .eq("owner_id", ownerId)
    .in("id", uniqueIds);

  const rows = beforeRows ?? [];
  if (rows.length === 0) {
    return { deletedCount: 0 };
  }

  const { error } = await admin
    .from("station_expenses")
    .delete()
    .eq("owner_id", ownerId)
    .in(
      "id",
      rows.map((r) => r.id)
    );

  if (error) {
    throw new AuthServiceError(
      error.message || "Failed to delete selected expenses.",
      500
    );
  }

  for (const before of rows) {
    const amtCents = toCentavos(before.amount);
    await recordFinancialAuditEvent({
      ownerId,
      businessDate: before.expense_date,
      actorId,
      module: "expense",
      eventType: "expense.deleted",
      entityType: "expense",
      entityId: before.id,
      referenceLabel: `${before.category.toUpperCase()} · ${before.description}`,
      expenseDeltaCentavos: -amtCents,
      summary: `Deleted station expense (${before.category}): ${before.description} (-${formatCentavosPHP(amtCents)})`,
      beforeSnapshot: {
        category: before.category,
        description: before.description,
        amount: toNumber(before.amount),
        expense_date: before.expense_date,
        notes: before.notes,
      },
      afterSnapshot: null,
    });
  }

  return { deletedCount: rows.length };
}

export interface BulkDeleteSaleItem {
  id: string;
  channel: "walkin" | "delivery" | "vendo";
}

function stripSalePrefix(id: string): string {
  return id.replace(/^(pos-|del-|ven-)/, "").trim();
}

export async function deleteOwnerSalesBulk(
  ownerId: string,
  actorId: string,
  items: BulkDeleteSaleItem[]
): Promise<{ deletedCount: number }> {
  const safeItems = items.slice(0, 100);
  if (safeItems.length === 0) {
    throw new AuthServiceError("Select at least one sale record to delete.", 400);
  }

  const posIds: string[] = [];
  const delIds: string[] = [];
  const venIds: string[] = [];

  for (const item of safeItems) {
    const rawId = stripSalePrefix(item.id);
    if (!rawId) continue;
    if (item.channel === "walkin") posIds.push(rawId);
    else if (item.channel === "delivery") delIds.push(rawId);
    else if (item.channel === "vendo") venIds.push(rawId);
  }

  const admin = createSupabaseAdminClient();
  let deletedCount = 0;

  // 1. Walk-in POS Sales
  if (posIds.length > 0) {
    const { data: beforePos } = await admin
      .from("pos_sales")
      .select("*")
      .eq("owner_id", ownerId)
      .in("id", posIds);

    const rows = beforePos ?? [];
    if (rows.length > 0) {
      const { error } = await admin
        .from("pos_sales")
        .delete()
        .eq("owner_id", ownerId)
        .in(
          "id",
          rows.map((r) => r.id)
        );
      if (error) {
        throw new AuthServiceError(
          error.message || "Failed to delete selected Walk-in sales.",
          500
        );
      }
      deletedCount += rows.length;

      for (const sale of rows) {
        if (sale.status === "completed") {
          const amtCents = toCentavos(sale.total_amount);
          await recordFinancialAuditEvent({
            ownerId,
            businessDate: sale.business_date,
            actorId,
            module: "pos",
            eventType: "pos.sale.deleted",
            entityType: "pos_sale",
            entityId: sale.id,
            referenceLabel: sale.receipt_no,
            cashDeltaCentavos: sale.payment_method === "cash" ? -amtCents : 0,
            digitalDeltaCentavos:
              sale.payment_method === "gcash" || sale.payment_method === "bank"
                ? -amtCents
                : 0,
            utangDeltaCentavos: sale.payment_method === "utang" ? -amtCents : 0,
            grossSalesDeltaCentavos: -amtCents,
            summary: `Deleted Walk-in sale ${sale.receipt_no} (-${formatCentavosPHP(amtCents)})`,
            beforeSnapshot: {
              receipt_no: sale.receipt_no,
              payment_method: sale.payment_method,
              total_amount: toNumber(sale.total_amount),
              status: sale.status,
            },
            afterSnapshot: null,
          });
        }
      }
    }
  }

  // 2. Delivery Sales
  if (delIds.length > 0) {
    const { data: beforeDel } = await admin
      .from("deliveries")
      .select("*")
      .eq("owner_id", ownerId)
      .in("id", delIds);

    const rows = beforeDel ?? [];
    if (rows.length > 0) {
      const { error } = await admin
        .from("deliveries")
        .delete()
        .eq("owner_id", ownerId)
        .in(
          "id",
          rows.map((r) => r.id)
        );
      if (error) {
        throw new AuthServiceError(
          error.message || "Failed to delete selected Delivery records.",
          500
        );
      }
      deletedCount += rows.length;

      for (const del of rows) {
        if (del.delivery_status !== "cancelled") {
          const amtCents = toCentavos(del.total_amount);
          const isPaid = del.payment_status === "paid";
          const isCash = del.payment_method === "cash";
          const isDigital = del.payment_method === "gcash";
          await recordFinancialAuditEvent({
            ownerId,
            businessDate: del.business_date,
            actorId,
            module: "delivery",
            eventType: "delivery.deleted",
            entityType: "delivery",
            entityId: del.id,
            referenceLabel: `${del.customer_name} · ${del.destination}`,
            cashDeltaCentavos: isPaid && isCash ? -amtCents : 0,
            digitalDeltaCentavos: isPaid && isDigital ? -amtCents : 0,
            utangDeltaCentavos: !isPaid ? -amtCents : 0,
            grossSalesDeltaCentavos: -amtCents,
            summary: `Deleted Delivery for ${del.customer_name} (-${formatCentavosPHP(amtCents)})`,
            beforeSnapshot: {
              customer_name: del.customer_name,
              destination: del.destination,
              total_amount: toNumber(del.total_amount),
              payment_status: del.payment_status,
              payment_method: del.payment_method,
            },
            afterSnapshot: null,
          });
        }
      }
    }
  }

  // 3. Vendo Collections
  if (venIds.length > 0) {
    const { data: beforeVen } = await admin
      .from("vendo_collections")
      .select("*")
      .eq("owner_id", ownerId)
      .in("id", venIds);

    const rows = beforeVen ?? [];
    if (rows.length > 0) {
      const { error } = await admin
        .from("vendo_collections")
        .delete()
        .eq("owner_id", ownerId)
        .in(
          "id",
          rows.map((r) => r.id)
        );
      if (error) {
        throw new AuthServiceError(
          error.message || "Failed to delete selected Vendo collections.",
          500
        );
      }
      deletedCount += rows.length;

      for (const ven of rows) {
        const amtCents = toCentavos(ven.amount);
        await recordFinancialAuditEvent({
          ownerId,
          businessDate: ven.business_date,
          actorId,
          module: "vendo",
          eventType: "vendo.deleted",
          entityType: "vendo",
          entityId: ven.id,
          referenceLabel: ven.machine_name,
          cashDeltaCentavos: -amtCents,
          grossSalesDeltaCentavos: -amtCents,
          summary: `Deleted Vendo income for ${ven.machine_name} (-${formatCentavosPHP(amtCents)})`,
          beforeSnapshot: {
            machine_name: ven.machine_name,
            period_type: ven.period_type,
            amount: toNumber(ven.amount),
          },
          afterSnapshot: null,
        });
      }
    }
  }

  return { deletedCount };
}

function escapeCsvCell(value: string | number | null | undefined): string {
  const str = String(value ?? "");
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function formatOwnerReportExport(
  snapshot: OwnerDashboardSnapshot,
  format: "json" | "csv" | "txt"
): { contentType: string; extension: string; body: string } {
  if (format === "json") {
    return {
      contentType: "application/json; charset=utf-8",
      extension: "json",
      body: JSON.stringify(snapshot, null, 2),
    };
  }

  if (format === "csv") {
    const lines: string[] = [];
    lines.push("Section,Date,Channel/Category,Reference,Customer/Description,Gallons,Payment/Status,Amount");

    for (const row of snapshot.salesRows) {
      lines.push(
        [
          "SALE",
          row.businessDate,
          row.channel,
          row.reference,
          row.customerLabel,
          row.gallons,
          `${row.paymentMethod} (${row.status})`,
          row.amount.toFixed(2),
        ]
          .map(escapeCsvCell)
          .join(",")
      );
    }

    for (const exp of snapshot.expenses) {
      lines.push(
        [
          "EXPENSE",
          exp.expense_date,
          exp.category,
          "",
          exp.description,
          0,
          exp.notes || "",
          (-toNumber(exp.amount)).toFixed(2),
        ]
          .map(escapeCsvCell)
          .join(",")
      );
    }

    return {
      contentType: "text/csv; charset=utf-8",
      extension: "csv",
      body: lines.join("\n"),
    };
  }

  const lines: string[] = [
    `G & A AQUA VITAE OWNER REPORT (${snapshot.startDate} to ${snapshot.endDate})`,
    `Generated: ${snapshot.generatedAt}`,
    "================================================================",
    `Total Sales:      PHP ${snapshot.quickStats.totalSales.toFixed(2)}`,
    `  - Walk-in POS:  PHP ${snapshot.quickStats.walkinSales.toFixed(2)} (${snapshot.quickStats.walkinGallons} gal)`,
    `  - Deliveries:   PHP ${snapshot.quickStats.deliverySales.toFixed(2)} (${snapshot.quickStats.deliveryGallons} gal)`,
    `  - Vendo Income: PHP ${snapshot.quickStats.vendoSales.toFixed(2)}`,
    `Total Expenses:   PHP ${snapshot.quickStats.totalExpenses.toFixed(2)}`,
    `Net Profit:       PHP ${snapshot.quickStats.netProfit.toFixed(2)}`,
    `Unpaid Balances:  PHP ${snapshot.quickStats.unpaidBalances.toFixed(2)} (${snapshot.quickStats.unpaidCount} open)`,
    `Gallon Stock:     ${snapshot.quickStats.onHandGallons} on hand | ${snapshot.quickStats.borrowedOutGallons} borrowed out`,
    "",
    `SALES LEDGER (${snapshot.salesRows.length} records)`,
    "----------------------------------------------------------------",
    ...snapshot.salesRows.map(
      (r) =>
        `${r.businessDate} | ${r.channel.toUpperCase().padEnd(8)} | ${r.customerLabel} (${r.reference}) | ${r.gallons} gal | ${r.paymentMethod}/${r.status} | PHP ${r.amount.toFixed(2)}`
    ),
    "",
    `EXPENSES (${snapshot.expenses.length} records)`,
    "----------------------------------------------------------------",
    ...snapshot.expenses.map(
      (e) =>
        `${e.expense_date} | ${e.category.toUpperCase().padEnd(13)} | ${e.description} | PHP ${toNumber(e.amount).toFixed(2)}`
    ),
  ];

  return {
    contentType: "text/plain; charset=utf-8",
    extension: "txt",
    body: lines.join("\n"),
  };
}

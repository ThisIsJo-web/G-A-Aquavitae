import "server-only";

import { createSupabaseAdminClient } from "@/backend/db/supabase";
import type { Database } from "@/backend/db/types";
import { AuthServiceError } from "@/backend/services/auth";
import {
  formatCentavosPHP,
  recordFinancialAuditEvent,
  toCentavos,
} from "@/backend/services/audit-ledger";
import {
  getDeliveriesOverview,
  type PeriodDeliveryTally,
} from "@/backend/services/cashier/deliveries";
import { listPosOverview } from "@/backend/services/cashier/pos";
import {
  isMissingCashierSchemaError,
  roundMoney,
  sanitizeBusinessDate,
  toNumber,
} from "@/backend/services/cashier/shared";
import { getVendoOverview } from "@/backend/services/cashier/vendo";

export type ShiftClosingRow =
  Database["public"]["Tables"]["shift_closings"]["Row"];

export interface DailyShiftTallyResult {
  businessDate: string;
  schemaMissing: boolean;
  liveTally: {
    walkinCashSales: number;
    walkinDigitalSales: number;
    walkinUtangSales: number;
    walkinCount: number;
    deliveryCashSales: number;
    deliveryWaterCashSales: number;
    deliveryFeeCashSales: number;
    deliveryDigitalSales: number;
    deliveryUnpaidTotal: number;
    deliveryCount: number;
    vendoDailyIncome: number;
    totalCashCollected: number;
    totalDigitalCollected: number;
    totalGrossSales: number;
    deliveryStats: {
      today: PeriodDeliveryTally;
      week: PeriodDeliveryTally;
      month: PeriodDeliveryTally;
    };
  };
  history: ShiftClosingRow[];
}

export async function getDailyShiftTally(
  ownerId: string,
  businessDateInput?: string
): Promise<DailyShiftTallyResult> {
  const businessDate = sanitizeBusinessDate(businessDateInput);
  const admin = createSupabaseAdminClient();

  const [pos, deliveries, vendo, historyRes] = await Promise.all([
    listPosOverview(ownerId, businessDate),
    getDeliveriesOverview(ownerId, businessDate),
    getVendoOverview(ownerId, businessDate),
    admin
      .from("shift_closings")
      .select("*")
      .eq("owner_id", ownerId)
      .order("business_date", { ascending: false })
      .order("closed_at", { ascending: false })
      .limit(30),
  ]);

  const schemaMissing =
    pos.schemaMissing ||
    deliveries.schemaMissing ||
    vendo.schemaMissing ||
    isMissingCashierSchemaError(historyRes.error);

  const walkinCashSales = pos.summary.cashTotal;
  const walkinDigitalSales = pos.summary.digitalTotal;
  const walkinUtangSales = pos.summary.utangTotal;
  const deliveryCashSales = deliveries.summary.paidCashTotal;
  const deliveryWaterCashSales = deliveries.summary.paidCashWaterTotal;
  const deliveryFeeCashSales = deliveries.summary.paidCashDeliveryFees;
  const deliveryDigitalSales = deliveries.summary.paidDigitalTotal;
  const deliveryUnpaidTotal = deliveries.summary.unpaidTotal;
  const vendoDailyIncome = vendo.summary.todayDailyTotal;

  const totalCashCollected = roundMoney(
    walkinCashSales + deliveryCashSales + vendoDailyIncome
  );
  const totalDigitalCollected = roundMoney(
    walkinDigitalSales + deliveryDigitalSales
  );
  const totalGrossSales = roundMoney(
    totalCashCollected + totalDigitalCollected
  );

  const history: ShiftClosingRow[] = (historyRes.data ?? []).map((row) => ({
    ...row,
    opening_cash: toNumber(row.opening_cash),
    walkin_cash_sales: toNumber(row.walkin_cash_sales),
    walkin_digital_sales: toNumber(row.walkin_digital_sales),
    delivery_cash_sales: toNumber(row.delivery_cash_sales),
    delivery_digital_sales: toNumber(row.delivery_digital_sales),
    delivery_unpaid_total: toNumber(row.delivery_unpaid_total),
    vendo_daily_income: toNumber(row.vendo_daily_income),
    expected_cash: toNumber(row.expected_cash),
    actual_cash: toNumber(row.actual_cash),
    variance: toNumber(row.variance),
    total_gross_sales: toNumber(row.total_gross_sales),
  }));

  return {
    businessDate,
    schemaMissing,
    liveTally: {
      walkinCashSales,
      walkinDigitalSales,
      walkinUtangSales,
      walkinCount: pos.summary.completedCount,
      deliveryCashSales,
      deliveryWaterCashSales,
      deliveryFeeCashSales,
      deliveryDigitalSales,
      deliveryUnpaidTotal,
      deliveryCount: deliveries.summary.totalDeliveries,
      vendoDailyIncome,
      totalCashCollected,
      totalDigitalCollected,
      totalGrossSales,
      deliveryStats: deliveries.tallies,
    },
    history,
  };
}

export async function closeDailyShift(
  cashierId: string,
  ownerId: string,
  input: {
    businessDate?: string;
    shiftLabel?: string;
    openingCash: number;
    actualCash: number;
    notes?: string;
  }
): Promise<ShiftClosingRow> {
  const businessDate = sanitizeBusinessDate(input.businessDate);
  const openingCash = roundMoney(Math.max(0, Number(input.openingCash)));
  const actualCash = roundMoney(Math.max(0, Number(input.actualCash)));

  if (!Number.isFinite(openingCash) || !Number.isFinite(actualCash)) {
    throw new AuthServiceError(
      "Opening cash and actual counted cash must be valid amounts",
      400
    );
  }

  const { liveTally } = await getDailyShiftTally(ownerId, businessDate);
  const expectedCash = roundMoney(openingCash + liveTally.totalCashCollected);
  const variance = roundMoney(actualCash - expectedCash);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("shift_closings")
    .insert({
      owner_id: ownerId,
      cashier_id: cashierId,
      business_date: businessDate,
      shift_label: input.shiftLabel?.trim() || "Full Day",
      opening_cash: openingCash,
      walkin_cash_sales: liveTally.walkinCashSales,
      walkin_digital_sales: liveTally.walkinDigitalSales,
      delivery_cash_sales: liveTally.deliveryCashSales,
      delivery_digital_sales: liveTally.deliveryDigitalSales,
      delivery_unpaid_total: liveTally.deliveryUnpaidTotal,
      vendo_daily_income: liveTally.vendoDailyIncome,
      expected_cash: expectedCash,
      actual_cash: actualCash,
      variance,
      total_gross_sales: liveTally.totalGrossSales,
      walkin_count: liveTally.walkinCount,
      delivery_count: liveTally.deliveryCount,
      notes: input.notes?.trim() || null,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new AuthServiceError(
      error?.message ?? "Failed to close daily shift",
      500
    );
  }

  const varCents = toCentavos(variance);
  await recordFinancialAuditEvent({
    ownerId,
    businessDate,
    actorId: cashierId,
    module: "shift",
    eventType: "shift.closed",
    entityType: "shift_closing",
    entityId: data.id,
    referenceLabel: `${businessDate} · ${data.shift_label}`,
    summary: `Closed shift "${data.shift_label}": Expected ${formatCentavosPHP(toCentavos(expectedCash))}, Counted ${formatCentavosPHP(toCentavos(actualCash))}, ${varCents === 0 ? "Exact (₱0.00)" : varCents > 0 ? `Over +${formatCentavosPHP(varCents)}` : `Short ${formatCentavosPHP(varCents)}`}`,
    afterSnapshot: {
      shift_label: data.shift_label,
      opening_cash: openingCash,
      expected_cash: expectedCash,
      actual_cash: actualCash,
      variance,
      total_gross_sales: liveTally.totalGrossSales,
    },
    metadata: {
      opening_cash_centavos: toCentavos(openingCash),
      expected_cash_centavos: toCentavos(expectedCash),
      actual_cash_centavos: toCentavos(actualCash),
      variance_centavos: varCents,
      notes: input.notes?.trim() || null,
    },
  });

  return {
    ...data,
    opening_cash: toNumber(data.opening_cash),
    walkin_cash_sales: toNumber(data.walkin_cash_sales),
    walkin_digital_sales: toNumber(data.walkin_digital_sales),
    delivery_cash_sales: toNumber(data.delivery_cash_sales),
    delivery_digital_sales: toNumber(data.delivery_digital_sales),
    delivery_unpaid_total: toNumber(data.delivery_unpaid_total),
    vendo_daily_income: toNumber(data.vendo_daily_income),
    expected_cash: toNumber(data.expected_cash),
    actual_cash: toNumber(data.actual_cash),
    variance: toNumber(data.variance),
    total_gross_sales: toNumber(data.total_gross_sales),
  };
}

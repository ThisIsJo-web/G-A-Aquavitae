import "server-only";

import { createSupabaseAdminClient } from "@/backend/db/supabase";
import type { Database, VendoPeriodType } from "@/backend/db/types";
import { AuthServiceError } from "@/backend/services/auth";
import {
  formatCentavosPHP,
  recordFinancialAuditEvent,
  toCentavos,
} from "@/backend/services/audit-ledger";
import {
  isMissingCashierSchemaError,
  roundMoney,
  sanitizeBusinessDate,
  toNumber,
} from "@/backend/services/cashier/shared";

export type VendoCollectionRow =
  Database["public"]["Tables"]["vendo_collections"]["Row"];

export interface VendoOverviewResult {
  businessDate: string;
  schemaMissing: boolean;
  collections: VendoCollectionRow[];
  summary: {
    todayDailyTotal: number;
    todayAllTotal: number;
    weekTotal: number;
    monthTotal: number;
    dailyCount: number;
    weeklyCount: number;
  };
}

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export async function getVendoOverview(
  ownerId: string,
  businessDateInput?: string
): Promise<VendoOverviewResult> {
  const businessDate = sanitizeBusinessDate(businessDateInput);
  const weekStart = addDays(businessDate, -6);
  const monthStart = `${businessDate.slice(0, 7)}-01`;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("vendo_collections")
    .select("*")
    .eq("owner_id", ownerId)
    .order("business_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) {
    if (isMissingCashierSchemaError(error)) {
      return {
        businessDate,
        schemaMissing: true,
        collections: [],
        summary: {
          todayDailyTotal: 0,
          todayAllTotal: 0,
          weekTotal: 0,
          monthTotal: 0,
          dailyCount: 0,
          weeklyCount: 0,
        },
      };
    }
    throw new AuthServiceError(error.message, 500);
  }

  const collections: VendoCollectionRow[] = (data ?? []).map((row) => ({
    ...row,
    amount: toNumber(row.amount),
    meter_start: row.meter_start !== null ? toNumber(row.meter_start) : null,
    meter_end: row.meter_end !== null ? toNumber(row.meter_end) : null,
  }));

  let todayDailyTotal = 0;
  let todayAllTotal = 0;
  let weekTotal = 0;
  let monthTotal = 0;
  let dailyCount = 0;
  let weeklyCount = 0;

  for (const c of collections) {
    if (c.period_type === "daily") dailyCount += 1;
    else weeklyCount += 1;

    if (c.business_date === businessDate) {
      todayAllTotal += c.amount;
      if (c.period_type === "daily") {
        todayDailyTotal += c.amount;
      }
    }
    if (c.business_date >= weekStart && c.business_date <= businessDate) {
      weekTotal += c.amount;
    }
    if (c.business_date >= monthStart && c.business_date <= businessDate) {
      monthTotal += c.amount;
    }
  }

  return {
    businessDate,
    schemaMissing: false,
    collections,
    summary: {
      todayDailyTotal: roundMoney(todayDailyTotal),
      todayAllTotal: roundMoney(todayAllTotal),
      weekTotal: roundMoney(weekTotal),
      monthTotal: roundMoney(monthTotal),
      dailyCount,
      weeklyCount,
    },
  };
}

export interface CreateVendoCollectionInput {
  machineName?: string;
  periodType: VendoPeriodType;
  periodStart?: string;
  periodEnd?: string;
  amount: number;
  meterStart?: number | null;
  meterEnd?: number | null;
  notes?: string;
  businessDate?: string;
}

export async function createVendoCollection(
  cashierId: string,
  ownerId: string,
  input: CreateVendoCollectionInput
): Promise<VendoCollectionRow> {
  const businessDate = sanitizeBusinessDate(input.businessDate);
  const amount = roundMoney(Number(input.amount));

  if (!Number.isFinite(amount) || amount < 0) {
    throw new AuthServiceError("Collection amount must be 0 or greater", 400);
  }

  const periodEnd = sanitizeBusinessDate(input.periodEnd ?? businessDate);
  const periodStart = sanitizeBusinessDate(
    input.periodStart ??
      (input.periodType === "weekly" ? addDays(periodEnd, -6) : periodEnd)
  );

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("vendo_collections")
    .insert({
      owner_id: ownerId,
      cashier_id: cashierId,
      machine_name: input.machineName?.trim() || "Main Vendo #1",
      period_type: input.periodType,
      period_start: periodStart,
      period_end: periodEnd,
      amount,
      meter_start:
        input.meterStart !== undefined &&
        input.meterStart !== null &&
        Number.isFinite(Number(input.meterStart))
          ? Number(input.meterStart)
          : null,
      meter_end:
        input.meterEnd !== undefined &&
        input.meterEnd !== null &&
        Number.isFinite(Number(input.meterEnd))
          ? Number(input.meterEnd)
          : null,
      notes: input.notes?.trim() || null,
      business_date: businessDate,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new AuthServiceError(
      error?.message ?? "Failed to save vendo collection",
      500
    );
  }

  const amountCents = toCentavos(amount);
  await recordFinancialAuditEvent({
    ownerId,
    businessDate,
    actorId: cashierId,
    module: "vendo",
    eventType: "vendo.collected",
    entityType: "vendo",
    entityId: data.id,
    referenceLabel: `${data.machine_name} (${data.period_type})`,
    cashDeltaCentavos: amountCents,
    grossSalesDeltaCentavos: amountCents,
    summary: `Vendo ${data.period_type} coin collection (${data.machine_name}): ${formatCentavosPHP(amountCents)}`,
    afterSnapshot: {
      machine_name: data.machine_name,
      period_type: data.period_type,
      period_start: data.period_start,
      period_end: data.period_end,
      amount: toNumber(data.amount),
      meter_start: data.meter_start !== null ? toNumber(data.meter_start) : null,
      meter_end: data.meter_end !== null ? toNumber(data.meter_end) : null,
    },
  });

  return {
    ...data,
    amount: toNumber(data.amount),
    meter_start: data.meter_start !== null ? toNumber(data.meter_start) : null,
    meter_end: data.meter_end !== null ? toNumber(data.meter_end) : null,
  };
}

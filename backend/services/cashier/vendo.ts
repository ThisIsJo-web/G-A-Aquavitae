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
  assertOperationalDateAllowed,
  getTodayBusinessDate,
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
    thisMonthTotal: number;
    todayTotal: number;
    yearTotal: number;
    totalEntries: number;
  };
}

function getMonthBounds(yearMonth: string): { start: string; end: string } {
  const [yStr, mStr] = yearMonth.split("-");
  const year = Number(yStr);
  const month = Number(mStr);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  const dd = String(lastDay).padStart(2, "0");
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${dd}`,
  };
}

function addMonths(yearMonth: string, deltaMonths: number): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + deltaMonths, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatMonthDisplay(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return yearMonth;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

export async function getVendoOverview(
  ownerId: string,
  businessDateInput?: string
): Promise<VendoOverviewResult> {
  const businessDate = sanitizeBusinessDate(businessDateInput);
  const currentMonth = businessDate.slice(0, 7);
  const currentYear = businessDate.slice(0, 4);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("vendo_collections")
    .select("*")
    .eq("owner_id", ownerId)
    .order("period_start", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) {
    if (isMissingCashierSchemaError(error)) {
      return {
        businessDate,
        schemaMissing: true,
        collections: [],
        summary: {
          thisMonthTotal: 0,
          todayTotal: 0,
          yearTotal: 0,
          totalEntries: 0,
        },
      };
    }
    throw new AuthServiceError(error.message, 500);
  }

  const collections: VendoCollectionRow[] = (data ?? []).map((row) => ({
    ...row,
    period_type: "monthly",
    amount: toNumber(row.amount),
    meter_start: row.meter_start !== null ? toNumber(row.meter_start) : null,
    meter_end: row.meter_end !== null ? toNumber(row.meter_end) : null,
  }));

  let thisMonthTotal = 0;
  let todayTotal = 0;
  let yearTotal = 0;

  for (const c of collections) {
    const entryMonth = (c.period_start || c.business_date).slice(0, 7);
    const entryYear = entryMonth.slice(0, 4);

    if (entryMonth === currentMonth) {
      thisMonthTotal += c.amount;
    }
    if (c.business_date === businessDate) {
      todayTotal += c.amount;
    }
    if (entryYear === currentYear) {
      yearTotal += c.amount;
    }
  }

  return {
    businessDate,
    schemaMissing: false,
    collections,
    summary: {
      thisMonthTotal: roundMoney(thisMonthTotal),
      todayTotal: roundMoney(todayTotal),
      yearTotal: roundMoney(yearTotal),
      totalEntries: collections.length,
    },
  };
}

export interface CreateVendoCollectionInput {
  machineName?: string;
  collectionMonth?: string;
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
  const businessDate = assertOperationalDateAllowed(
    input.businessDate,
    7,
    "Collection date"
  );
  const amount = roundMoney(Number(input.amount));

  if (!Number.isFinite(amount) || amount < 0) {
    throw new AuthServiceError("Collection amount must be 0 or greater.", 400);
  }

  const todayMonth = getTodayBusinessDate().slice(0, 7);
  const minAllowedMonth = addMonths(todayMonth, -11);
  const rawMonth = (input.collectionMonth ?? businessDate.slice(0, 7)).trim();

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(rawMonth)) {
    throw new AuthServiceError(
      "Please select a valid collection month.",
      400
    );
  }
  if (rawMonth > todayMonth) {
    throw new AuthServiceError(
      "Future months are not allowed for Vendo income.",
      400
    );
  }
  if (rawMonth < minAllowedMonth) {
    throw new AuthServiceError(
      `Collection month cannot be earlier than ${formatMonthDisplay(minAllowedMonth)}.`,
      400
    );
  }

  const { start: periodStart, end: periodEnd } = getMonthBounds(rawMonth);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("vendo_collections")
    .insert({
      owner_id: ownerId,
      cashier_id: cashierId,
      machine_name: input.machineName?.trim() || "Main Vendo #1",
      period_type: "monthly",
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
    if (error?.message?.includes("vendo_collections_period_type_check")) {
      throw new AuthServiceError(
        "Database update required for Monthly Vendo income. Run Section 12i of schema.sql in Supabase SQL Editor.",
        503
      );
    }
    throw new AuthServiceError(
      error?.message ?? "Failed to save monthly vendo collection.",
      500
    );
  }

  const monthLabel = formatMonthDisplay(rawMonth);
  const amountCents = toCentavos(amount);
  await recordFinancialAuditEvent({
    ownerId,
    businessDate,
    actorId: cashierId,
    module: "vendo",
    eventType: "vendo.collected",
    entityType: "vendo",
    entityId: data.id,
    referenceLabel: `${data.machine_name} (${monthLabel})`,
    cashDeltaCentavos: amountCents,
    grossSalesDeltaCentavos: amountCents,
    summary: `Monthly Vendo income (${data.machine_name} · ${monthLabel}): ${formatCentavosPHP(amountCents)}`,
    afterSnapshot: {
      machine_name: data.machine_name,
      period_type: "monthly",
      period_start: data.period_start,
      period_end: data.period_end,
      amount: toNumber(data.amount),
      meter_start:
        data.meter_start !== null ? toNumber(data.meter_start) : null,
      meter_end: data.meter_end !== null ? toNumber(data.meter_end) : null,
    },
  });

  return {
    ...data,
    period_type: "monthly",
    amount: toNumber(data.amount),
    meter_start: data.meter_start !== null ? toNumber(data.meter_start) : null,
    meter_end: data.meter_end !== null ? toNumber(data.meter_end) : null,
  };
}

import "server-only";

import { createHash } from "crypto";
import { createSupabaseAdminClient } from "@/backend/db/supabase";
import type {
  AuditActorRole,
  AuditModule,
  Database,
  Json,
} from "@/backend/db/types";
import { AuthServiceError } from "@/backend/services/auth";
import {
  getTodayBusinessDate,
  sanitizeBusinessDate,
  toNumber,
} from "@/backend/services/cashier/shared";

export type FinancialAuditLogRow =
  Database["public"]["Tables"]["financial_audit_logs"]["Row"];
export type { AuditActorRole, AuditModule };

export interface AuditActor {
  id: string | null;
  name: string;
  role: AuditActorRole;
}

export interface RecordAuditEventInput {
  ownerId: string;
  businessDate?: string;
  actor?: AuditActor;
  actorId?: string | null;
  module: AuditModule;
  eventType: string;
  entityType: string;
  entityId?: string | null;
  referenceLabel: string;
  cashDeltaCentavos?: number;
  digitalDeltaCentavos?: number;
  utangDeltaCentavos?: number;
  expenseDeltaCentavos?: number;
  grossSalesDeltaCentavos?: number;
  summary: string;
  beforeSnapshot?: Json | null;
  afterSnapshot?: Json | null;
  metadata?: Record<string, Json>;
  createdAt?: string;
}

export function toCentavos(pesos: number | string | null | undefined): number {
  const num = Number(pesos ?? 0);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100);
}

export function centavosToPesos(centavos: number): number {
  return Math.round(centavos) / 100;
}

export function formatCentavosPHP(centavos: number): string {
  const sign = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos) / 100;
  return `${sign}₱${abs.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function isMissingAuditTableError(
  error: { code?: string; message?: string } | null | undefined
): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    Boolean(error.message?.match(/financial_audit_logs/i))
  );
}

export function computeAuditEntryHash(params: {
  ownerId: string;
  seqNo: number;
  prevHash: string;
  eventType: string;
  entityId: string | null;
  cashDeltaCentavos: number;
  digitalDeltaCentavos: number;
  utangDeltaCentavos: number;
  expenseDeltaCentavos: number;
  grossSalesDeltaCentavos: number;
  createdAt: string;
}): string {
  const payload = [
    params.ownerId,
    String(params.seqNo),
    params.prevHash,
    params.eventType,
    params.entityId ?? "",
    String(Math.trunc(params.cashDeltaCentavos)),
    String(Math.trunc(params.digitalDeltaCentavos)),
    String(Math.trunc(params.utangDeltaCentavos)),
    String(Math.trunc(params.expenseDeltaCentavos)),
    String(Math.trunc(params.grossSalesDeltaCentavos)),
    new Date(params.createdAt).toISOString(),
  ].join("|");

  return createHash("sha256").update(payload, "utf8").digest("hex");
}

async function resolveActor(
  actor?: AuditActor,
  actorId?: string | null
): Promise<AuditActor> {
  if (actor) return actor;
  if (!actorId) {
    return { id: null, name: "System", role: "system" };
  }

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("id", actorId)
    .maybeSingle();

  if (!data) {
    return { id: actorId, name: "Station User", role: "cashier" };
  }

  const role: AuditActorRole =
    data.role === "owner" ||
    data.role === "superadmin" ||
    data.role === "cashier"
      ? data.role
      : "cashier";

  return {
    id: data.id,
    name: data.full_name || data.email,
    role,
  };
}

/**
 * Appends an immutable, SHA-256 hash-chained financial audit log entry.
 * Retries safely on seq_no unique contention (23505) and degrades cleanly
 * if Section 12e SQL has not been applied yet so live POS operations never fail.
 */
export async function recordFinancialAuditEvent(
  input: RecordAuditEventInput
): Promise<FinancialAuditLogRow | null> {
  const admin = createSupabaseAdminClient();
  const actor = await resolveActor(input.actor, input.actorId);
  const businessDate = sanitizeBusinessDate(input.businessDate);

  const cashDelta = Math.trunc(input.cashDeltaCentavos ?? 0);
  const digitalDelta = Math.trunc(input.digitalDeltaCentavos ?? 0);
  const utangDelta = Math.trunc(input.utangDeltaCentavos ?? 0);
  const expenseDelta = Math.trunc(input.expenseDeltaCentavos ?? 0);
  const grossDelta = Math.trunc(input.grossSalesDeltaCentavos ?? 0);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data: latest, error: latestErr } = await admin
      .from("financial_audit_logs")
      .select("seq_no, entry_hash")
      .eq("owner_id", input.ownerId)
      .order("seq_no", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestErr) {
      if (isMissingAuditTableError(latestErr)) {
        return null;
      }
      console.error("[audit-ledger] Failed to read latest seq_no:", latestErr.message);
      return null;
    }

    const seqNo = (latest ? Number(latest.seq_no) : 0) + 1;
    const prevHash = latest?.entry_hash ?? "GENESIS";
    const createdAt = input.createdAt
      ? new Date(input.createdAt).toISOString()
      : new Date().toISOString();

    const entryHash = computeAuditEntryHash({
      ownerId: input.ownerId,
      seqNo,
      prevHash,
      eventType: input.eventType,
      entityId: input.entityId ?? null,
      cashDeltaCentavos: cashDelta,
      digitalDeltaCentavos: digitalDelta,
      utangDeltaCentavos: utangDelta,
      expenseDeltaCentavos: expenseDelta,
      grossSalesDeltaCentavos: grossDelta,
      createdAt,
    });

    const { data: inserted, error: insertErr } = await admin
      .from("financial_audit_logs")
      .insert({
        owner_id: input.ownerId,
        seq_no: seqNo,
        business_date: businessDate,
        actor_id: actor.id,
        actor_name: actor.name,
        actor_role: actor.role,
        module: input.module,
        event_type: input.eventType,
        entity_type: input.entityType,
        entity_id: input.entityId ?? null,
        reference_label: input.referenceLabel,
        cash_delta_centavos: cashDelta,
        digital_delta_centavos: digitalDelta,
        utang_delta_centavos: utangDelta,
        expense_delta_centavos: expenseDelta,
        gross_sales_delta_centavos: grossDelta,
        summary: input.summary,
        before_snapshot: input.beforeSnapshot ?? null,
        after_snapshot: input.afterSnapshot ?? null,
        metadata: (input.metadata ?? {}) as Json,
        prev_hash: prevHash,
        entry_hash: entryHash,
        created_at: createdAt,
      })
      .select("*")
      .single();

    if (!insertErr && inserted) {
      return inserted;
    }

    // Retry on concurrent sequence collision
    if (insertErr?.code === "23505" && attempt < 3) {
      continue;
    }

    if (isMissingAuditTableError(insertErr)) {
      return null;
    }

    console.error("[audit-ledger] Insert failed:", insertErr?.message);
    return null;
  }

  return null;
}

export type AuditBucketFilter =
  | "all"
  | "cash"
  | "digital"
  | "utang"
  | "expense"
  | "exceptions";

export interface AuditChainVerification {
  checkedAt: string;
  totalEntries: number;
  verified: boolean;
  brokenSeqNos: number[];
  missingSeqNos: number[];
  latestSeqNo: number;
  latestHash: string | null;
  firstEntryAt: string | null;
  latestEntryAt: string | null;
}

export interface AuditReconciliationSummary {
  ledgerCashCentavos: number;
  ledgerDigitalCentavos: number;
  ledgerUtangCentavos: number;
  ledgerExpenseCentavos: number;
  ledgerGrossCentavos: number;
  operationalGrossCentavos: number;
  operationalExpenseCentavos: number;
  grossDiffCentavos: number;
  expenseDiffCentavos: number;
  isBalanced: boolean;
}

export interface EnrichedAuditLogRow extends FinancialAuditLogRow {
  runningCashCentavos: number;
  runningDigitalCentavos: number;
  runningUtangCentavos: number;
  runningNetCentavos: number;
}

export interface OwnerAuditLedgerResult {
  schemaMissing: boolean;
  fromDate: string;
  toDate: string;
  totalMatching: number;
  entries: EnrichedAuditLogRow[];
  periodTotals: {
    cashNetCentavos: number;
    digitalNetCentavos: number;
    utangNetCentavos: number;
    expenseNetCentavos: number;
    grossSalesNetCentavos: number;
    voidAndCorrectionCount: number;
  };
  chain: AuditChainVerification;
  reconciliation: AuditReconciliationSummary;
  hasPreLedgerRecords: boolean;
}

function addDays(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

export async function verifyOwnerAuditChain(
  ownerId: string
): Promise<{ schemaMissing: boolean; chain: AuditChainVerification }> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("financial_audit_logs")
    .select(
      "seq_no, owner_id, event_type, entity_id, cash_delta_centavos, digital_delta_centavos, utang_delta_centavos, expense_delta_centavos, gross_sales_delta_centavos, prev_hash, entry_hash, created_at"
    )
    .eq("owner_id", ownerId)
    .order("seq_no", { ascending: true })
    .limit(5000);

  if (error) {
    if (isMissingAuditTableError(error)) {
      return {
        schemaMissing: true,
        chain: {
          checkedAt: new Date().toISOString(),
          totalEntries: 0,
          verified: true,
          brokenSeqNos: [],
          missingSeqNos: [],
          latestSeqNo: 0,
          latestHash: null,
          firstEntryAt: null,
          latestEntryAt: null,
        },
      };
    }
    throw new AuthServiceError(error.message, 500);
  }

  const rows = data ?? [];
  const brokenSeqNos: number[] = [];
  const missingSeqNos: number[] = [];
  let expectedPrevHash = "GENESIS";
  let expectedSeq = 1;

  for (const row of rows) {
    const seqNo = Number(row.seq_no);
    while (expectedSeq < seqNo) {
      missingSeqNos.push(expectedSeq);
      expectedSeq += 1;
    }

    const recomputed = computeAuditEntryHash({
      ownerId: row.owner_id,
      seqNo,
      prevHash: row.prev_hash,
      eventType: row.event_type,
      entityId: row.entity_id,
      cashDeltaCentavos: Number(row.cash_delta_centavos),
      digitalDeltaCentavos: Number(row.digital_delta_centavos),
      utangDeltaCentavos: Number(row.utang_delta_centavos),
      expenseDeltaCentavos: Number(row.expense_delta_centavos),
      grossSalesDeltaCentavos: Number(row.gross_sales_delta_centavos),
      createdAt: row.created_at,
    });

    if (row.prev_hash !== expectedPrevHash || recomputed !== row.entry_hash) {
      brokenSeqNos.push(seqNo);
    }

    expectedPrevHash = row.entry_hash;
    expectedSeq = seqNo + 1;
  }

  const first = rows[0] ?? null;
  const last = rows[rows.length - 1] ?? null;

  return {
    schemaMissing: false,
    chain: {
      checkedAt: new Date().toISOString(),
      totalEntries: rows.length,
      verified: brokenSeqNos.length === 0 && missingSeqNos.length === 0,
      brokenSeqNos,
      missingSeqNos,
      latestSeqNo: last ? Number(last.seq_no) : 0,
      latestHash: last?.entry_hash ?? null,
      firstEntryAt: first?.created_at ?? null,
      latestEntryAt: last?.created_at ?? null,
    },
  };
}

export async function queryOwnerAuditLedger(
  ownerId: string,
  options: {
    from?: string | null;
    to?: string | null;
    module?: string | null;
    bucket?: AuditBucketFilter;
    q?: string | null;
    limit?: number;
  } = {}
): Promise<OwnerAuditLedgerResult> {
  const today = getTodayBusinessDate();
  const toDate = sanitizeBusinessDate(options.to ?? today);
  const fromDate = sanitizeBusinessDate(options.from ?? addDays(toDate, -29));
  const limit = Math.min(Math.max(10, options.limit ?? 200), 1000);
  const bucket: AuditBucketFilter = options.bucket ?? "all";
  const moduleFilter =
    options.module && options.module !== "all" ? options.module : null;
  const search = options.q?.trim().toLowerCase() ?? "";

  const admin = createSupabaseAdminClient();

  const [chainRes, windowLogsRes, posRes, delRes, venRes, expRes] =
    await Promise.all([
      verifyOwnerAuditChain(ownerId),
      admin
        .from("financial_audit_logs")
        .select("*")
        .eq("owner_id", ownerId)
        .gte("business_date", fromDate)
        .lte("business_date", toDate)
        .order("seq_no", { ascending: true })
        .limit(2000),
      admin
        .from("pos_sales")
        .select("total_amount, status")
        .eq("owner_id", ownerId)
        .gte("business_date", fromDate)
        .lte("business_date", toDate),
      admin
        .from("deliveries")
        .select("total_amount, delivery_status")
        .eq("owner_id", ownerId)
        .gte("business_date", fromDate)
        .lte("business_date", toDate),
      admin
        .from("vendo_collections")
        .select("amount")
        .eq("owner_id", ownerId)
        .gte("business_date", fromDate)
        .lte("business_date", toDate),
      admin
        .from("station_expenses")
        .select("amount")
        .eq("owner_id", ownerId)
        .gte("expense_date", fromDate)
        .lte("expense_date", toDate),
    ]);

  if (chainRes.schemaMissing || isMissingAuditTableError(windowLogsRes.error)) {
    return {
      schemaMissing: true,
      fromDate,
      toDate,
      totalMatching: 0,
      entries: [],
      periodTotals: {
        cashNetCentavos: 0,
        digitalNetCentavos: 0,
        utangNetCentavos: 0,
        expenseNetCentavos: 0,
        grossSalesNetCentavos: 0,
        voidAndCorrectionCount: 0,
      },
      chain: chainRes.chain,
      reconciliation: {
        ledgerCashCentavos: 0,
        ledgerDigitalCentavos: 0,
        ledgerUtangCentavos: 0,
        ledgerExpenseCentavos: 0,
        ledgerGrossCentavos: 0,
        operationalGrossCentavos: 0,
        operationalExpenseCentavos: 0,
        grossDiffCentavos: 0,
        expenseDiffCentavos: 0,
        isBalanced: true,
      },
      hasPreLedgerRecords: false,
    };
  }

  const allWindowLogs: FinancialAuditLogRow[] = (windowLogsRes.data ?? []).map(
    (r) => ({
      ...r,
      seq_no: Number(r.seq_no),
      cash_delta_centavos: Number(r.cash_delta_centavos),
      digital_delta_centavos: Number(r.digital_delta_centavos),
      utang_delta_centavos: Number(r.utang_delta_centavos),
      expense_delta_centavos: Number(r.expense_delta_centavos),
      gross_sales_delta_centavos: Number(r.gross_sales_delta_centavos),
    })
  );

  // Compute running cumulative balances across the chronological window
  let runCash = 0;
  let runDigital = 0;
  let runUtang = 0;
  let runExpense = 0;
  let runGross = 0;

  const enrichedChrono: EnrichedAuditLogRow[] = allWindowLogs.map((row) => {
    runCash += row.cash_delta_centavos;
    runDigital += row.digital_delta_centavos;
    runUtang += row.utang_delta_centavos;
    runExpense += row.expense_delta_centavos;
    runGross += row.gross_sales_delta_centavos;
    return {
      ...row,
      runningCashCentavos: runCash,
      runningDigitalCentavos: runDigital,
      runningUtangCentavos: runUtang,
      runningNetCentavos: runGross - runExpense,
    };
  });

  // Operational reconciliation totals in exact integer centavos
  let opGross = 0;
  for (const s of posRes.data ?? []) {
    if (s.status !== "voided") opGross += toCentavos(s.total_amount);
  }
  for (const d of delRes.data ?? []) {
    if (d.delivery_status !== "cancelled") opGross += toCentavos(d.total_amount);
  }
  for (const v of venRes.data ?? []) {
    opGross += toCentavos(v.amount);
  }
  let opExpense = 0;
  if (!expRes.error) {
    for (const e of expRes.data ?? []) {
      opExpense += toCentavos(e.amount);
    }
  }

  const grossDiff = runGross - opGross;
  const expenseDiff = runExpense - opExpense;
  const hasPreLedgerRecords =
    (opGross > 0 || opExpense > 0) &&
    (Math.abs(grossDiff) > 0 || Math.abs(expenseDiff) > 0);

  // Apply user-selected UI filters (newest first for display)
  const filtered = enrichedChrono.filter((row) => {
    if (moduleFilter && row.module !== moduleFilter) return false;
    if (bucket === "cash" && row.cash_delta_centavos === 0) return false;
    if (bucket === "digital" && row.digital_delta_centavos === 0) return false;
    if (bucket === "utang" && row.utang_delta_centavos === 0) return false;
    if (bucket === "expense" && row.expense_delta_centavos === 0) return false;
    if (
      bucket === "exceptions" &&
      !(
        row.event_type.includes("void") ||
        row.event_type.includes("correction") ||
        row.event_type.includes("deleted") ||
        row.module === "security" ||
        (row.event_type === "shift.closed" &&
          Number(
            ((row.metadata as Record<string, unknown>)?.variance_centavos ?? 0)
          ) !== 0)
      )
    ) {
      return false;
    }

    if (search) {
      const hay =
        `#${row.seq_no} ${row.reference_label} ${row.summary} ${row.actor_name} ${row.event_type} ${row.module} ${row.business_date} ${row.entry_hash}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }

    return true;
  });

  let cashNet = 0;
  let digitalNet = 0;
  let utangNet = 0;
  let expenseNet = 0;
  let grossNet = 0;
  let voidAndCorrectionCount = 0;

  for (const row of filtered) {
    cashNet += row.cash_delta_centavos;
    digitalNet += row.digital_delta_centavos;
    utangNet += row.utang_delta_centavos;
    expenseNet += row.expense_delta_centavos;
    grossNet += row.gross_sales_delta_centavos;
    if (
      row.event_type.includes("void") ||
      row.event_type.includes("correction") ||
      row.event_type.includes("deleted")
    ) {
      voidAndCorrectionCount += 1;
    }
  }

  const newestFirst = [...filtered].reverse().slice(0, limit);

  return {
    schemaMissing: false,
    fromDate,
    toDate,
    totalMatching: filtered.length,
    entries: newestFirst,
    periodTotals: {
      cashNetCentavos: cashNet,
      digitalNetCentavos: digitalNet,
      utangNetCentavos: utangNet,
      expenseNetCentavos: expenseNet,
      grossSalesNetCentavos: grossNet,
      voidAndCorrectionCount,
    },
    chain: chainRes.chain,
    reconciliation: {
      ledgerCashCentavos: runCash,
      ledgerDigitalCentavos: runDigital,
      ledgerUtangCentavos: runUtang,
      ledgerExpenseCentavos: runExpense,
      ledgerGrossCentavos: runGross,
      operationalGrossCentavos: opGross,
      operationalExpenseCentavos: opExpense,
      grossDiffCentavos: grossDiff,
      expenseDiffCentavos: expenseDiff,
      isBalanced: grossDiff === 0 && expenseDiff === 0,
    },
    hasPreLedgerRecords,
  };
}

/**
 * One-time idempotent backfill for operational rows recorded BEFORE Section 12e
 * was enabled. Skips any entity_id already represented in financial_audit_logs.
 */
export async function backfillOwnerAuditLedger(ownerId: string): Promise<{
  importedCount: number;
}> {
  const admin = createSupabaseAdminClient();

  const [existingLogsRes, posRes, delRes, venRes, expRes, shiftRes] =
    await Promise.all([
      admin
        .from("financial_audit_logs")
        .select("entity_type, entity_id")
        .eq("owner_id", ownerId),
      admin
        .from("pos_sales")
        .select("*")
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: true }),
      admin
        .from("deliveries")
        .select("*")
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: true }),
      admin
        .from("vendo_collections")
        .select("*")
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: true }),
      admin
        .from("station_expenses")
        .select("*")
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: true }),
      admin
        .from("shift_closings")
        .select("*")
        .eq("owner_id", ownerId)
        .order("closed_at", { ascending: true }),
    ]);

  if (isMissingAuditTableError(existingLogsRes.error)) {
    throw new AuthServiceError(
      "The financial_audit_logs table is not applied yet. Run Section 12e of backend/db/schema.sql first.",
      503
    );
  }

  const seen = new Set(
    (existingLogsRes.data ?? []).map((r) => `${r.entity_type}:${r.entity_id}`)
  );

  type BackfillEvent = { sortKey: string; input: RecordAuditEventInput };
  const queue: BackfillEvent[] = [];

  for (const s of posRes.data ?? []) {
    if (seen.has(`pos_sale:${s.id}`)) continue;
    const total = toCentavos(s.total_amount);
    const isVoided = s.status === "voided";
    const cash = !isVoided && s.payment_method === "cash" ? total : 0;
    const digital =
      !isVoided &&
      (s.payment_method === "gcash" || s.payment_method === "bank")
        ? total
        : 0;
    const utang = !isVoided && s.payment_method === "utang" ? total : 0;

    queue.push({
      sortKey: s.created_at,
      input: {
        ownerId,
        businessDate: s.business_date,
        actorId: s.cashier_id,
        module: "pos",
        eventType: isVoided ? "pos.sale.backfilled_voided" : "pos.sale.created",
        entityType: "pos_sale",
        entityId: s.id,
        referenceLabel: `${s.receipt_no} · ${s.customer_name || "Walk-in"}`,
        cashDeltaCentavos: cash,
        digitalDeltaCentavos: digital,
        utangDeltaCentavos: utang,
        grossSalesDeltaCentavos: isVoided ? 0 : total,
        summary: isVoided
          ? `Imported voided Walk-in receipt ${s.receipt_no} (${formatCentavosPHP(total)})`
          : `Imported Walk-in ${s.payment_method.toUpperCase()} sale ${s.receipt_no} for ${formatCentavosPHP(total)}`,
        afterSnapshot: {
          receipt_no: s.receipt_no,
          payment_method: s.payment_method,
          subtotal: toNumber(s.subtotal),
          discount: toNumber(s.discount),
          total_amount: toNumber(s.total_amount),
          status: s.status,
        },
        metadata: {
          backfilled: true,
          subtotal_centavos: toCentavos(s.subtotal),
          discount_centavos: toCentavos(s.discount),
          tendered_centavos: toCentavos(s.amount_tendered),
          change_centavos: toCentavos(s.change_amount),
        },
        createdAt: s.created_at,
      },
    });
  }

  for (const d of delRes.data ?? []) {
    if (seen.has(`delivery:${d.id}`)) continue;
    const total = toCentavos(d.total_amount);
    const cancelled = d.delivery_status === "cancelled";
    const cash =
      !cancelled && d.payment_status === "paid" && d.payment_method === "cash"
        ? total
        : 0;
    const digital =
      !cancelled && d.payment_status === "paid" && d.payment_method !== "cash"
        ? total
        : 0;
    const utang = !cancelled && d.payment_status === "unpaid" ? total : 0;

    queue.push({
      sortKey: d.created_at,
      input: {
        ownerId,
        businessDate: d.business_date,
        actorId: d.cashier_id,
        module: "delivery",
        eventType: cancelled
          ? "delivery.backfilled_cancelled"
          : "delivery.created",
        entityType: "delivery",
        entityId: d.id,
        referenceLabel: `${d.customer_name} · ${d.destination}`,
        cashDeltaCentavos: cash,
        digitalDeltaCentavos: digital,
        utangDeltaCentavos: utang,
        grossSalesDeltaCentavos: cancelled ? 0 : total,
        summary: cancelled
          ? `Imported cancelled delivery for ${d.customer_name} (${formatCentavosPHP(total)})`
          : `Imported delivery (${d.quantity} gal) for ${d.customer_name} · ${formatCentavosPHP(total)} (${d.payment_status.toUpperCase()})`,
        afterSnapshot: {
          customer_name: d.customer_name,
          destination: d.destination,
          quantity: d.quantity,
          unit_price: toNumber(d.unit_price),
          delivery_fee: toNumber(d.delivery_fee),
          total_amount: toNumber(d.total_amount),
          payment_method: d.payment_method,
          payment_status: d.payment_status,
          delivery_status: d.delivery_status,
        },
        metadata: {
          backfilled: true,
          delivery_fee_centavos: toCentavos(d.delivery_fee),
        },
        createdAt: d.created_at,
      },
    });
  }

  for (const v of venRes.data ?? []) {
    if (seen.has(`vendo:${v.id}`)) continue;
    const amt = toCentavos(v.amount);
    queue.push({
      sortKey: v.created_at,
      input: {
        ownerId,
        businessDate: v.business_date,
        actorId: v.cashier_id,
        module: "vendo",
        eventType: "vendo.collected",
        entityType: "vendo",
        entityId: v.id,
        referenceLabel: `${v.machine_name} (${v.period_type})`,
        cashDeltaCentavos: amt,
        grossSalesDeltaCentavos: amt,
        summary: `Imported ${v.period_type} vendo collection from ${v.machine_name}: ${formatCentavosPHP(amt)}`,
        afterSnapshot: {
          machine_name: v.machine_name,
          period_type: v.period_type,
          amount: toNumber(v.amount),
        },
        metadata: { backfilled: true },
        createdAt: v.created_at,
      },
    });
  }

  if (!expRes.error) {
    for (const e of expRes.data ?? []) {
      if (seen.has(`expense:${e.id}`)) continue;
      const amt = toCentavos(e.amount);
      queue.push({
        sortKey: e.created_at,
        input: {
          ownerId,
          businessDate: e.expense_date,
          actorId: e.recorded_by ?? ownerId,
          module: "expense",
          eventType: "expense.created",
          entityType: "expense",
          entityId: e.id,
          referenceLabel: `${e.category.toUpperCase()} · ${e.description}`,
          expenseDeltaCentavos: amt,
          summary: `Imported station expense (${e.category}): ${e.description} for ${formatCentavosPHP(amt)}`,
          afterSnapshot: {
            category: e.category,
            description: e.description,
            amount: toNumber(e.amount),
            expense_date: e.expense_date,
          },
          metadata: { backfilled: true },
          createdAt: e.created_at,
        },
      });
    }
  }

  for (const sc of shiftRes.data ?? []) {
    if (seen.has(`shift_closing:${sc.id}`)) continue;
    const varCents = toCentavos(sc.variance);
    queue.push({
      sortKey: sc.closed_at,
      input: {
        ownerId,
        businessDate: sc.business_date,
        actorId: sc.cashier_id,
        module: "shift",
        eventType: "shift.closed",
        entityType: "shift_closing",
        entityId: sc.id,
        referenceLabel: `${sc.business_date} · ${sc.shift_label}`,
        summary: `Imported closed shift (${sc.shift_label}): Expected ${formatCentavosPHP(toCentavos(sc.expected_cash))}, Actual ${formatCentavosPHP(toCentavos(sc.actual_cash))}, Variance ${formatCentavosPHP(varCents)}`,
        afterSnapshot: {
          opening_cash: toNumber(sc.opening_cash),
          expected_cash: toNumber(sc.expected_cash),
          actual_cash: toNumber(sc.actual_cash),
          variance: toNumber(sc.variance),
        },
        metadata: {
          backfilled: true,
          variance_centavos: varCents,
        },
        createdAt: sc.closed_at,
      },
    });
  }

  queue.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  let importedCount = 0;
  for (const item of queue) {
    const saved = await recordFinancialAuditEvent(item.input);
    if (saved) importedCount += 1;
  }

  return { importedCount };
}

function csvCell(value: string | number | null | undefined): string {
  const s = String(value ?? "");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function formatAuditLedgerExport(
  result: OwnerAuditLedgerResult,
  format: "csv" | "json" | "txt"
): { contentType: string; extension: string; body: string } {
  if (format === "json") {
    return {
      contentType: "application/json; charset=utf-8",
      extension: "json",
      body: JSON.stringify(result, null, 2),
    };
  }

  if (format === "csv") {
    const lines = [
      "Seq,Timestamp,BusinessDate,Actor,Role,Module,Event,Reference,CashDeltaPHP,DigitalDeltaPHP,UtangDeltaPHP,ExpenseDeltaPHP,GrossDeltaPHP,CashDeltaCentavos,Summary,EntryHash,PrevHash",
    ];
    for (const r of result.entries) {
      lines.push(
        [
          r.seq_no,
          r.created_at,
          r.business_date,
          r.actor_name,
          r.actor_role,
          r.module,
          r.event_type,
          r.reference_label,
          centavosToPesos(r.cash_delta_centavos).toFixed(2),
          centavosToPesos(r.digital_delta_centavos).toFixed(2),
          centavosToPesos(r.utang_delta_centavos).toFixed(2),
          centavosToPesos(r.expense_delta_centavos).toFixed(2),
          centavosToPesos(r.gross_sales_delta_centavos).toFixed(2),
          r.cash_delta_centavos,
          r.summary,
          r.entry_hash,
          r.prev_hash,
        ]
          .map(csvCell)
          .join(",")
      );
    }
    return {
      contentType: "text/csv; charset=utf-8",
      extension: "csv",
      body: lines.join("\n"),
    };
  }

  const lines = [
    `G & A AQUA VITAE FORENSIC FINANCIAL AUDIT LEDGER (${result.fromDate} to ${result.toDate})`,
    `Chain Integrity: ${result.chain.verified ? "VERIFIED INTACT" : "WARNING - BROKEN CHAIN"} (${result.chain.totalEntries} total entries)`,
    `Latest Hash:     ${result.chain.latestHash ?? "NONE"}`,
    `Reconciliation:  ${result.reconciliation.isBalanced ? "BALANCED (PHP 0.00 DIFF)" : `DIFF Gross ${formatCentavosPHP(result.reconciliation.grossDiffCentavos)} / Expense ${formatCentavosPHP(result.reconciliation.expenseDiffCentavos)}`}`,
    "==============================================================================",
    `Period Cash Net:    ${formatCentavosPHP(result.periodTotals.cashNetCentavos)}`,
    `Period Digital Net: ${formatCentavosPHP(result.periodTotals.digitalNetCentavos)}`,
    `Period Utang Net:   ${formatCentavosPHP(result.periodTotals.utangNetCentavos)}`,
    `Period Expense Net: ${formatCentavosPHP(result.periodTotals.expenseNetCentavos)}`,
    `Period Gross Sales: ${formatCentavosPHP(result.periodTotals.grossSalesNetCentavos)}`,
    "------------------------------------------------------------------------------",
    ...result.entries.map(
      (r) =>
        `#${r.seq_no} | ${r.created_at} | ${r.actor_name} (${r.actor_role}) | ${r.event_type} | ${r.reference_label} | Cash ${formatCentavosPHP(r.cash_delta_centavos)} | Digital ${formatCentavosPHP(r.digital_delta_centavos)} | Utang ${formatCentavosPHP(r.utang_delta_centavos)} | Exp ${formatCentavosPHP(r.expense_delta_centavos)} | Hash ${r.entry_hash.slice(0, 12)}...`
    ),
  ];

  return {
    contentType: "text/plain; charset=utf-8",
    extension: "txt",
    body: lines.join("\n"),
  };
}

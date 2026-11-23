import "server-only";

import { createSupabaseAdminClient } from "@/backend/db/supabase";
import type {
  CorrectionEntityType,
  CorrectionStatus,
  CorrectionType,
  Database,
  DeliveryPaymentMethod,
  Json,
  PosPaymentMethod,
} from "@/backend/db/types";
import { AuthServiceError } from "@/backend/services/auth";
import {
  formatCentavosPHP,
  recordFinancialAuditEvent,
  toCentavos,
} from "@/backend/services/audit-ledger";
import { roundMoney, toNumber } from "@/backend/services/cashier/shared";

export type CorrectionRequestRow =
  Database["public"]["Tables"]["correction_requests"]["Row"];
export type { CorrectionEntityType, CorrectionStatus, CorrectionType };

export interface CorrectionRequestsOverview {
  requests: CorrectionRequestRow[];
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  schemaMissing: boolean;
}

const VALID_ENTITY_TYPES = new Set<CorrectionEntityType>([
  "pos_sale",
  "delivery",
  "vendo",
  "shift_closing",
]);

const VALID_CORRECTION_TYPES = new Set<CorrectionType>([
  "change_payment_method",
  "update_amount",
  "cancel_delivery",
  "adjust_shift_cash",
  "void_sale",
]);

const VALID_POS_METHODS = new Set<PosPaymentMethod>([
  "cash",
  "gcash",
  "bank",
  "utang",
]);

const VALID_DELIVERY_METHODS = new Set<DeliveryPaymentMethod>([
  "cash",
  "gcash",
  "credit",
]);

export function isValidCorrectionEntityType(
  val: unknown
): val is CorrectionEntityType {
  return (
    typeof val === "string" &&
    VALID_ENTITY_TYPES.has(val as CorrectionEntityType)
  );
}

export function isValidCorrectionType(val: unknown): val is CorrectionType {
  return (
    typeof val === "string" &&
    VALID_CORRECTION_TYPES.has(val as CorrectionType)
  );
}

function isMissingCorrectionsTableError(
  error: { code?: string; message?: string } | null | undefined
): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    Boolean(error.message?.match(/correction_requests/i))
  );
}

export async function listCorrectionRequests(
  ownerId: string,
  limit = 60
): Promise<CorrectionRequestsOverview> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("correction_requests")
    .select("*")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingCorrectionsTableError(error)) {
      return {
        requests: [],
        pendingCount: 0,
        approvedCount: 0,
        rejectedCount: 0,
        schemaMissing: true,
      };
    }
    throw new AuthServiceError(
      error.message || "Failed to load correction requests.",
      500
    );
  }

  const requests = data ?? [];
  let pendingCount = 0;
  let approvedCount = 0;
  let rejectedCount = 0;

  for (const r of requests) {
    if (r.status === "pending") pendingCount += 1;
    else if (r.status === "approved") approvedCount += 1;
    else if (r.status === "rejected") rejectedCount += 1;
  }

  return {
    requests,
    pendingCount,
    approvedCount,
    rejectedCount,
    schemaMissing: false,
  };
}

export interface CreateCorrectionInput {
  ownerId: string;
  requestedBy: string;
  requesterName: string;
  actorRole?: "cashier" | "owner" | "superadmin";
  autoApprove?: boolean;
  entityType: CorrectionEntityType;
  entityId: string;
  correctionType: CorrectionType;
  reason: string;
  proposedChanges: Record<string, unknown>;
}

export async function createCorrectionRequest(
  input: CreateCorrectionInput
): Promise<CorrectionRequestRow> {
  const reason = input.reason.trim();
  if (reason.length < 3) {
    throw new AuthServiceError(
      "Please enter a short reason explaining the mistake (min 3 characters).",
      400
    );
  }

  const admin = createSupabaseAdminClient();

  // Prevent duplicate pending requests for the same record
  const { data: existingPending, error: dupErr } = await admin
    .from("correction_requests")
    .select("id")
    .eq("owner_id", input.ownerId)
    .eq("entity_type", input.entityType)
    .eq("entity_id", input.entityId)
    .eq("status", "pending")
    .maybeSingle();

  if (dupErr && isMissingCorrectionsTableError(dupErr)) {
    throw new AuthServiceError(
      "The correction_requests table is not applied yet. Run Section 12d of backend/db/schema.sql in Supabase SQL Editor.",
      503
    );
  }

  if (existingPending) {
    throw new AuthServiceError(
      "There is already a pending Owner Review request for this record.",
      409
    );
  }

  let entityLabel = "";
  let beforeSnapshot: Record<string, Json> = {};
  let sanitizedProposed: Record<string, Json> = {};

  if (input.entityType === "pos_sale") {
    const { data: sale, error } = await admin
      .from("pos_sales")
      .select("*")
      .eq("id", input.entityId)
      .eq("owner_id", input.ownerId)
      .maybeSingle();

    if (error || !sale) {
      throw new AuthServiceError("Walk-in receipt not found.", 404);
    }
    if (sale.status === "voided") {
      throw new AuthServiceError(
        "Voided receipts cannot be corrected.",
        400
      );
    }

    entityLabel = `${sale.receipt_no} · ${sale.customer_name || "Walk-in"}`;
    beforeSnapshot = {
      receipt_no: sale.receipt_no,
      payment_method: sale.payment_method,
      total_amount: roundMoney(toNumber(sale.total_amount)),
      business_date: sale.business_date,
    };

    if (input.correctionType === "change_payment_method") {
      const nextMethod = input.proposedChanges.paymentMethod;
      if (
        typeof nextMethod !== "string" ||
        !VALID_POS_METHODS.has(nextMethod as PosPaymentMethod)
      ) {
        throw new AuthServiceError(
          "Choose a valid payment method (Cash, GCash, or Utang).",
          400
        );
      }
      if (nextMethod === sale.payment_method) {
        throw new AuthServiceError(
          "The selected payment method is already the current payment method.",
          400
        );
      }
      sanitizedProposed = { payment_method: nextMethod };
    } else if (input.correctionType === "void_sale") {
      sanitizedProposed = { status: "voided" };
    } else {
      throw new AuthServiceError(
        "Unsupported correction type for a Walk-in receipt.",
        400
      );
    }
  } else if (input.entityType === "delivery") {
    const { data: del, error } = await admin
      .from("deliveries")
      .select("*")
      .eq("id", input.entityId)
      .eq("owner_id", input.ownerId)
      .maybeSingle();

    if (error || !del) {
      throw new AuthServiceError("Delivery record not found.", 404);
    }
    if (del.delivery_status === "cancelled") {
      throw new AuthServiceError("This delivery is already cancelled.", 400);
    }

    entityLabel = `${del.customer_name} · ${del.destination} (${del.business_date})`;
    beforeSnapshot = {
      customer_name: del.customer_name,
      destination: del.destination,
      quantity: del.quantity,
      total_amount: roundMoney(toNumber(del.total_amount)),
      payment_method: del.payment_method,
      payment_status: del.payment_status,
      delivery_status: del.delivery_status,
    };

    if (input.correctionType === "cancel_delivery") {
      sanitizedProposed = { delivery_status: "cancelled" };
    } else if (input.correctionType === "change_payment_method") {
      const nextMethod = input.proposedChanges.paymentMethod;
      if (
        typeof nextMethod !== "string" ||
        !VALID_DELIVERY_METHODS.has(nextMethod as DeliveryPaymentMethod)
      ) {
        throw new AuthServiceError(
          "Choose a valid delivery payment method (Cash, GCash, or Credit/Utang).",
          400
        );
      }
      const nextStatus = nextMethod === "credit" ? "unpaid" : "paid";
      if (
        nextMethod === del.payment_method &&
        nextStatus === del.payment_status
      ) {
        throw new AuthServiceError(
          "The selected payment method is already the current payment method.",
          400
        );
      }
      sanitizedProposed = {
        payment_method: nextMethod,
        payment_status: nextStatus,
      };
    } else if (input.correctionType === "update_amount") {
      const nextAmount = roundMoney(toNumber(input.proposedChanges.amount, -1));
      if (nextAmount < 0) {
        throw new AuthServiceError(
          "Enter a valid corrected total amount.",
          400
        );
      }
      sanitizedProposed = { total_amount: nextAmount };
    } else {
      throw new AuthServiceError(
        "Unsupported correction type for a Delivery.",
        400
      );
    }
  } else if (input.entityType === "vendo") {
    const { data: vendo, error } = await admin
      .from("vendo_collections")
      .select("*")
      .eq("id", input.entityId)
      .eq("owner_id", input.ownerId)
      .maybeSingle();

    if (error || !vendo) {
      throw new AuthServiceError("Vendo entry not found.", 404);
    }

    entityLabel = `${vendo.machine_name} (${vendo.business_date})`;
    beforeSnapshot = {
      machine_name: vendo.machine_name,
      period_type: vendo.period_type,
      amount: roundMoney(toNumber(vendo.amount)),
      business_date: vendo.business_date,
    };

    if (input.correctionType !== "update_amount") {
      throw new AuthServiceError(
        "Vendo corrections only support updating the collected amount.",
        400
      );
    }

    const nextAmount = roundMoney(toNumber(input.proposedChanges.amount, -1));
    if (nextAmount < 0) {
      throw new AuthServiceError(
        "Enter a valid corrected peso amount (0 or higher).",
        400
      );
    }
    sanitizedProposed = { amount: nextAmount };
  } else if (input.entityType === "shift_closing") {
    const { data: shift, error } = await admin
      .from("shift_closings")
      .select("*")
      .eq("id", input.entityId)
      .eq("owner_id", input.ownerId)
      .maybeSingle();

    if (error || !shift) {
      throw new AuthServiceError("Closed shift record not found.", 404);
    }

    entityLabel = `${shift.business_date} · ${shift.shift_label}`;
    beforeSnapshot = {
      business_date: shift.business_date,
      shift_label: shift.shift_label,
      expected_cash: roundMoney(toNumber(shift.expected_cash)),
      actual_cash: roundMoney(toNumber(shift.actual_cash)),
      variance: roundMoney(toNumber(shift.variance)),
    };

    if (input.correctionType !== "adjust_shift_cash") {
      throw new AuthServiceError(
        "Closed shifts only support adjusting the counted actual cash.",
        400
      );
    }

    const nextActual = roundMoney(
      toNumber(input.proposedChanges.actualCash, -1)
    );
    if (nextActual < 0) {
      throw new AuthServiceError(
        "Enter a valid corrected cash count (0 or higher).",
        400
      );
    }
    const nextVariance = roundMoney(
      nextActual - toNumber(shift.expected_cash)
    );
    sanitizedProposed = {
      actual_cash: nextActual,
      variance: nextVariance,
    };
  }

  const { data: inserted, error: insertErr } = await admin
    .from("correction_requests")
    .insert({
      owner_id: input.ownerId,
      requested_by: input.requestedBy,
      requester_name: input.requesterName,
      entity_type: input.entityType,
      entity_id: input.entityId,
      entity_label: entityLabel,
      correction_type: input.correctionType,
      reason,
      before_snapshot: beforeSnapshot,
      proposed_changes: sanitizedProposed,
      status: "pending",
    })
    .select("*")
    .single();

  if (insertErr || !inserted) {
    throw new AuthServiceError(
      insertErr?.message || "Could not submit correction request.",
      500
    );
  }

  if (input.autoApprove) {
    return reviewCorrectionRequest({
      ownerId: input.ownerId,
      reviewerId: input.requestedBy,
      requestId: inserted.id,
      decision: "approved",
      reviewerNote: `Applied directly by ${input.actorRole === "superadmin" ? "Superadmin" : "Owner"}`,
    });
  }

  await recordFinancialAuditEvent({
    ownerId: input.ownerId,
    actor: {
      id: input.requestedBy,
      name: input.requesterName,
      role: input.actorRole ?? "cashier",
    },
    module: "supervision",
    eventType: "correction.requested",
    entityType: input.entityType,
    entityId: input.entityId,
    referenceLabel: entityLabel,
    summary: `Cashier requested ${input.correctionType.replace(/_/g, " ")} on ${entityLabel}: "${reason}"`,
    beforeSnapshot,
    afterSnapshot: sanitizedProposed,
    metadata: {
      correction_request_id: inserted.id,
      correction_type: input.correctionType,
      reason,
      direct_apply: false,
    },
  });

  return inserted;
}

export async function reviewCorrectionRequest(params: {
  ownerId: string;
  reviewerId: string;
  requestId: string;
  decision: Extract<CorrectionStatus, "approved" | "rejected">;
  reviewerNote?: string;
}): Promise<CorrectionRequestRow> {
  const admin = createSupabaseAdminClient();

  const { data: req, error: fetchErr } = await admin
    .from("correction_requests")
    .select("*")
    .eq("id", params.requestId)
    .eq("owner_id", params.ownerId)
    .maybeSingle();

  if (fetchErr || !req) {
    throw new AuthServiceError("Correction request not found.", 404);
  }

  if (req.status !== "pending") {
    throw new AuthServiceError(
      `This request was already ${req.status}.`,
      409
    );
  }

  const cleanNote = params.reviewerNote?.trim() || null;
  const nowIso = new Date().toISOString();

  if (params.decision === "rejected") {
    const { data: updated, error: updErr } = await admin
      .from("correction_requests")
      .update({
        status: "rejected",
        reviewed_by: params.reviewerId,
        reviewer_note: cleanNote,
        reviewed_at: nowIso,
      })
      .eq("id", req.id)
      .select("*")
      .single();

    if (updErr || !updated) {
      throw new AuthServiceError(
        updErr?.message || "Failed to reject request.",
        500
      );
    }

    await recordFinancialAuditEvent({
      ownerId: params.ownerId,
      actorId: params.reviewerId,
      module: "supervision",
      eventType: "correction.rejected",
      entityType: req.entity_type,
      entityId: req.entity_id,
      referenceLabel: req.entity_label,
      summary: `Owner rejected ${req.correction_type.replace(/_/g, " ")} request on ${req.entity_label}${cleanNote ? ` · Note: "${cleanNote}"` : ""}`,
      beforeSnapshot: req.before_snapshot,
      afterSnapshot: req.before_snapshot,
      metadata: {
        correction_request_id: req.id,
        reason: req.reason,
        reviewer_note: cleanNote,
      },
    });

    return updated;
  }

  // APPROVED: apply the audited mutation server-side
  const proposed = (req.proposed_changes ?? {}) as Record<string, unknown>;
  let afterSnapshot: Record<string, Json> = {};
  let auditCashDelta = 0;
  let auditDigitalDelta = 0;
  let auditUtangDelta = 0;
  let auditGrossDelta = 0;
  let auditBusinessDate: string | undefined;
  let auditSummary = `Owner approved ${req.correction_type.replace(/_/g, " ")} on ${req.entity_label}`;

  if (req.entity_type === "pos_sale") {
    const { data: sale } = await admin
      .from("pos_sales")
      .select("*")
      .eq("id", req.entity_id)
      .eq("owner_id", params.ownerId)
      .maybeSingle();

    if (!sale) {
      throw new AuthServiceError("Target Walk-in receipt no longer exists.", 404);
    }
    auditBusinessDate = sale.business_date;

    if (req.correction_type === "change_payment_method") {
      const nextMethod = String(proposed.payment_method) as PosPaymentMethod;
      const total = roundMoney(toNumber(sale.total_amount));
      const totalCents = toCentavos(total);
      const nextTendered = nextMethod === "utang" ? 0 : total;
      const nextNote = [
        sale.notes,
        `[Owner approved payment fix: ${sale.payment_method} → ${nextMethod}]`,
      ]
        .filter(Boolean)
        .join(" ");

      const { error: applyErr } = await admin
        .from("pos_sales")
        .update({
          payment_method: nextMethod,
          amount_tendered: nextTendered,
          change_amount: 0,
          notes: nextNote,
        })
        .eq("id", sale.id);

      if (applyErr) {
        throw new AuthServiceError(applyErr.message, 500);
      }

      if (sale.payment_method === "cash") auditCashDelta -= totalCents;
      else if (sale.payment_method === "utang") auditUtangDelta -= totalCents;
      else auditDigitalDelta -= totalCents;

      if (nextMethod === "cash") auditCashDelta += totalCents;
      else if (nextMethod === "utang") auditUtangDelta += totalCents;
      else auditDigitalDelta += totalCents;

      auditSummary = `Owner approved Walk-in payment fix on ${sale.receipt_no}: ${sale.payment_method.toUpperCase()} → ${nextMethod.toUpperCase()} (${formatCentavosPHP(totalCents)})`;

      afterSnapshot = {
        receipt_no: sale.receipt_no,
        payment_method: nextMethod,
        total_amount: total,
      };
    } else if (req.correction_type === "void_sale") {
      const totalCents = toCentavos(sale.total_amount);
      const nextNote = [
        sale.notes,
        `[Owner approved void: ${req.reason}]`,
      ]
        .filter(Boolean)
        .join(" ");

      const { error: applyErr } = await admin
        .from("pos_sales")
        .update({ status: "voided", notes: nextNote })
        .eq("id", sale.id);

      if (applyErr) {
        throw new AuthServiceError(applyErr.message, 500);
      }

      if (sale.payment_method === "cash") auditCashDelta -= totalCents;
      else if (sale.payment_method === "utang") auditUtangDelta -= totalCents;
      else auditDigitalDelta -= totalCents;
      auditGrossDelta -= totalCents;
      auditSummary = `Owner approved void of ${sale.receipt_no} (-${formatCentavosPHP(totalCents)})`;

      afterSnapshot = { receipt_no: sale.receipt_no, status: "voided" };
    }
  } else if (req.entity_type === "delivery") {
    const { data: del } = await admin
      .from("deliveries")
      .select("*")
      .eq("id", req.entity_id)
      .eq("owner_id", params.ownerId)
      .maybeSingle();

    if (!del) {
      throw new AuthServiceError("Target delivery no longer exists.", 404);
    }
    auditBusinessDate = del.business_date;
    const oldTotalCents = toCentavos(del.total_amount);

    if (req.correction_type === "cancel_delivery") {
      const nextNote = [
        del.notes,
        `[Owner approved cancellation: ${req.reason}]`,
      ]
        .filter(Boolean)
        .join(" ");

      const { error: applyErr } = await admin
        .from("deliveries")
        .update({
          delivery_status: "cancelled",
          notes: nextNote,
        })
        .eq("id", del.id);

      if (applyErr) {
        throw new AuthServiceError(applyErr.message, 500);
      }

      if (del.payment_status === "unpaid") auditUtangDelta -= oldTotalCents;
      else if (del.payment_method === "cash") auditCashDelta -= oldTotalCents;
      else auditDigitalDelta -= oldTotalCents;
      auditGrossDelta -= oldTotalCents;
      auditSummary = `Owner approved cancellation of delivery for ${del.customer_name} (-${formatCentavosPHP(oldTotalCents)})`;

      afterSnapshot = {
        customer_name: del.customer_name,
        delivery_status: "cancelled",
      };
    } else if (req.correction_type === "change_payment_method") {
      const nextMethod = String(
        proposed.payment_method
      ) as DeliveryPaymentMethod;
      const nextStatus = nextMethod === "credit" ? "unpaid" : "paid";
      const nextNote = [
        del.notes,
        `[Owner approved payment fix: ${del.payment_method} → ${nextMethod}]`,
      ]
        .filter(Boolean)
        .join(" ");

      const { error: applyErr } = await admin
        .from("deliveries")
        .update({
          payment_method: nextMethod,
          payment_status: nextStatus,
          notes: nextNote,
        })
        .eq("id", del.id);

      if (applyErr) {
        throw new AuthServiceError(applyErr.message, 500);
      }

      if (del.payment_status === "unpaid") auditUtangDelta -= oldTotalCents;
      else if (del.payment_method === "cash") auditCashDelta -= oldTotalCents;
      else auditDigitalDelta -= oldTotalCents;

      if (nextStatus === "unpaid") auditUtangDelta += oldTotalCents;
      else if (nextMethod === "cash") auditCashDelta += oldTotalCents;
      else auditDigitalDelta += oldTotalCents;

      auditSummary = `Owner approved delivery payment fix for ${del.customer_name}: ${del.payment_method.toUpperCase()} → ${nextMethod.toUpperCase()} (${formatCentavosPHP(oldTotalCents)})`;

      afterSnapshot = {
        payment_method: nextMethod,
        payment_status: nextStatus,
      };
    } else if (req.correction_type === "update_amount") {
      const nextTotal = roundMoney(toNumber(proposed.total_amount, 0));
      const diffCents = toCentavos(nextTotal) - oldTotalCents;
      const nextNote = [
        del.notes,
        `[Owner approved amount fix: ₱${toNumber(del.total_amount).toFixed(2)} → ₱${nextTotal.toFixed(2)}]`,
      ]
        .filter(Boolean)
        .join(" ");

      const { error: applyErr } = await admin
        .from("deliveries")
        .update({
          total_amount: nextTotal,
          notes: nextNote,
        })
        .eq("id", del.id);

      if (applyErr) {
        throw new AuthServiceError(applyErr.message, 500);
      }

      if (del.payment_status === "unpaid") auditUtangDelta += diffCents;
      else if (del.payment_method === "cash") auditCashDelta += diffCents;
      else auditDigitalDelta += diffCents;
      auditGrossDelta += diffCents;
      auditSummary = `Owner approved delivery amount fix for ${del.customer_name}: ${formatCentavosPHP(oldTotalCents)} → ${formatCentavosPHP(toCentavos(nextTotal))}`;

      afterSnapshot = { total_amount: nextTotal };
    }
  } else if (req.entity_type === "vendo") {
    const { data: vendo } = await admin
      .from("vendo_collections")
      .select("*")
      .eq("id", req.entity_id)
      .eq("owner_id", params.ownerId)
      .maybeSingle();

    if (!vendo) {
      throw new AuthServiceError("Target vendo entry no longer exists.", 404);
    }
    auditBusinessDate = vendo.business_date;

    const oldAmtCents = toCentavos(vendo.amount);
    const nextAmount = roundMoney(toNumber(proposed.amount, 0));
    const diffCents = toCentavos(nextAmount) - oldAmtCents;
    const nextNote = [
      vendo.notes,
      `[Owner approved amount fix: ₱${toNumber(vendo.amount).toFixed(2)} → ₱${nextAmount.toFixed(2)}]`,
    ]
      .filter(Boolean)
      .join(" ");

    const { error: applyErr } = await admin
      .from("vendo_collections")
      .update({
        amount: nextAmount,
        notes: nextNote,
      })
      .eq("id", vendo.id);

    if (applyErr) {
      throw new AuthServiceError(applyErr.message, 500);
    }

    auditCashDelta += diffCents;
    auditGrossDelta += diffCents;
    auditSummary = `Owner approved vendo amount fix (${vendo.machine_name}): ${formatCentavosPHP(oldAmtCents)} → ${formatCentavosPHP(toCentavos(nextAmount))}`;

    afterSnapshot = { amount: nextAmount };
  } else if (req.entity_type === "shift_closing") {
    const { data: shift } = await admin
      .from("shift_closings")
      .select("*")
      .eq("id", req.entity_id)
      .eq("owner_id", params.ownerId)
      .maybeSingle();

    if (!shift) {
      throw new AuthServiceError("Target shift closing no longer exists.", 404);
    }
    auditBusinessDate = shift.business_date;

    const nextActual = roundMoney(toNumber(proposed.actual_cash, 0));
    const nextVariance = roundMoney(
      nextActual - toNumber(shift.expected_cash)
    );
    const nextNote = [
      shift.notes,
      `[Owner approved cash count fix: ₱${toNumber(shift.actual_cash).toFixed(2)} → ₱${nextActual.toFixed(2)}]`,
    ]
      .filter(Boolean)
      .join(" ");

    const { error: applyErr } = await admin
      .from("shift_closings")
      .update({
        actual_cash: nextActual,
        variance: nextVariance,
        notes: nextNote,
      })
      .eq("id", shift.id);

    if (applyErr) {
      throw new AuthServiceError(applyErr.message, 500);
    }

    auditSummary = `Owner approved shift cash fix (${shift.business_date} · ${shift.shift_label}): ${formatCentavosPHP(toCentavos(shift.actual_cash))} → ${formatCentavosPHP(toCentavos(nextActual))}`;

    afterSnapshot = {
      actual_cash: nextActual,
      variance: nextVariance,
    };
  }

  const { data: updated, error: updErr } = await admin
    .from("correction_requests")
    .update({
      status: "approved",
      after_snapshot: afterSnapshot,
      reviewed_by: params.reviewerId,
      reviewer_note: cleanNote,
      reviewed_at: nowIso,
    })
    .eq("id", req.id)
    .select("*")
    .single();

  if (updErr || !updated) {
    throw new AuthServiceError(
      updErr?.message || "Failed to finalize approval.",
      500
    );
  }

  await recordFinancialAuditEvent({
    ownerId: params.ownerId,
    businessDate: auditBusinessDate,
    actorId: params.reviewerId,
    module: "supervision",
    eventType: "correction.approved",
    entityType: req.entity_type,
    entityId: req.entity_id,
    referenceLabel: req.entity_label,
    cashDeltaCentavos: auditCashDelta,
    digitalDeltaCentavos: auditDigitalDelta,
    utangDeltaCentavos: auditUtangDelta,
    grossSalesDeltaCentavos: auditGrossDelta,
    summary: auditSummary,
    beforeSnapshot: req.before_snapshot,
    afterSnapshot,
    metadata: {
      correction_request_id: req.id,
      correction_type: req.correction_type,
      requester_name: req.requester_name,
      reason: req.reason,
      reviewer_note: cleanNote,
    },
  });

  return updated;
}

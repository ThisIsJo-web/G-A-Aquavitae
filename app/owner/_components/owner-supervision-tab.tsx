"use client";

import {
  Check,
  CheckCircle2,
  Clock,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import {
  EmptyState,
  NoticeBanner,
  StatusChip,
} from "@/app/_components/ui/monochrome-controls";
import { QuickStatCard } from "@/app/_components/ui/quick-stat-card";
import type {
  CorrectionEntityType,
  CorrectionRequestRow,
  CorrectionType,
} from "@/backend/services/corrections";
import { formatPHP, type OwnerDashboardSnapshot } from "./types";

interface OwnerSupervisionTabProps {
  snapshot: OwnerDashboardSnapshot;
  onDataChanged: () => Promise<void>;
}

type StatusFilter = "pending" | "approved" | "rejected" | "all";

function formatEntityLabel(type: CorrectionEntityType): string {
  if (type === "pos_sale") return "Walk-in POS";
  if (type === "delivery") return "Delivery";
  if (type === "vendo") return "Vendo Income";
  return "Closed Shift";
}

function formatCorrectionTitle(type: CorrectionType): string {
  if (type === "change_payment_method") return "Fix Payment Method";
  if (type === "update_amount") return "Fix Peso Amount";
  if (type === "cancel_delivery") return "Cancel Delivery";
  if (type === "adjust_shift_cash") return "Adjust Counted Shift Cash";
  return "Void Walk-in Sale";
}

function summarizeSnapshot(
  req: CorrectionRequestRow,
  which: "before" | "proposed"
): string {
  const data = (
    which === "before" ? req.before_snapshot : req.proposed_changes
  ) as Record<string, unknown> | null;
  if (!data) return "—";

  if (req.correction_type === "change_payment_method") {
    const method = String(data.payment_method ?? "—").toUpperCase();
    const total =
      typeof data.total_amount === "number"
        ? ` (${formatPHP(data.total_amount)})`
        : "";
    return `Payment: ${method}${total}`;
  }

  if (req.correction_type === "update_amount") {
    const val =
      typeof data.total_amount === "number"
        ? data.total_amount
        : typeof data.amount === "number"
          ? data.amount
          : 0;
    return `Amount: ${formatPHP(val)}`;
  }

  if (req.correction_type === "cancel_delivery") {
    if (which === "before") {
      return `${String(data.delivery_status ?? "delivered").toUpperCase()} · ${formatPHP(Number(data.total_amount ?? 0))}`;
    }
    return "Status: CANCELLED";
  }

  if (req.correction_type === "adjust_shift_cash") {
    const actual = Number(data.actual_cash ?? 0);
    const variance = Number(data.variance ?? 0);
    const varStr =
      variance === 0
        ? "Exact"
        : variance > 0
          ? `Over +${formatPHP(variance)}`
          : `Short -${formatPHP(Math.abs(variance))}`;
    return `Counted: ${formatPHP(actual)} (${varStr})`;
  }

  return JSON.stringify(data);
}

export function OwnerSupervisionTab({
  snapshot,
  onDataChanged,
}: OwnerSupervisionTabProps) {
  const { corrections } = snapshot;
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "error" | "success";
    message: string;
  } | null>(null);

  const visibleRequests = corrections.requests.filter((r) =>
    filter === "all" ? true : r.status === filter
  );

  async function handleDecision(
    requestId: string,
    decision: "approved" | "rejected"
  ) {
    setFeedback(null);
    setBusyId(requestId);
    try {
      const res = await fetch(`/api/owner/corrections/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          reviewerNote: notesById[requestId]?.trim() || undefined,
        }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFeedback({
          tone: "error",
          message: payload.error ?? "Could not process decision.",
        });
        return;
      }

      setFeedback({
        tone: "success",
        message:
          decision === "approved"
            ? "Correction approved and applied to station records."
            : "Correction request rejected. Original record was kept unchanged.",
      });
      await onDataChanged();
    } catch {
      setFeedback({ tone: "error", message: "Network error." });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {corrections.schemaMissing && (
        <NoticeBanner
          tone="info"
          message="The correction_requests table is not applied yet. Run Section 12d of backend/db/schema.sql in Supabase SQL Editor to enable Owner Supervision approvals."
        />
      )}

      {feedback && (
        <NoticeBanner
          tone={feedback.tone}
          message={feedback.message}
          onDismiss={() => setFeedback(null)}
        />
      )}

      {/* Quick Stats Row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <QuickStatCard
          highlighted
          label="Pending Approvals"
          value={corrections.pendingCount}
          sublabel="Cashier error reports waiting for review"
          icon={<Clock className="h-5 w-5" />}
        />
        <QuickStatCard
          label="Approved Fixes"
          value={corrections.approvedCount}
          sublabel="Audited corrections applied"
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
        <QuickStatCard
          label="Rejected Requests"
          value={corrections.rejectedCount}
          sublabel="Kept original cashier record"
          icon={<XCircle className="h-5 w-5" />}
        />
      </div>

      {/* Queue Card */}
      <section className="av-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold tracking-tight text-[#111111]">
              Cashier Correction Queue
            </h2>
            <p className="mt-0.5 text-xs text-[#71717A]">
              Review payment fixes, delivery cancellations, vendo edits, and
              closed shift adjustments with before/after audit trails
            </p>
          </div>

          <div className="inline-flex rounded-full bg-[#F2F2F4] p-1">
            {(["pending", "approved", "rejected", "all"] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setFilter(st)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold capitalize transition ${
                  filter === st
                    ? "bg-[#111111] text-white"
                    : "text-[#52525B] hover:text-[#111111]"
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {visibleRequests.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck className="h-5 w-5" />}
              title={
                filter === "pending"
                  ? "No pending correction requests"
                  : "No correction requests in this view"
              }
              description={
                filter === "pending"
                  ? "When a cashier flags an error that needs Owner Supervision, it appears here for your approval."
                  : "Try switching filter tabs above."
              }
            />
          ) : (
            visibleRequests.map((req) => {
              const isPending = req.status === "pending";
              const isBusy = busyId === req.id;

              return (
                <div
                  key={req.id}
                  className="rounded-[22px] border border-[#E8E8EC] bg-[#F8F8FA] p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusChip
                          label={formatEntityLabel(req.entity_type)}
                          tone="outline"
                        />
                        <StatusChip
                          label={formatCorrectionTitle(req.correction_type)}
                          tone={isPending ? "solid" : "soft"}
                        />
                        {!isPending && (
                          <StatusChip
                            label={
                              req.status === "approved"
                                ? "Approved & Applied"
                                : "Rejected"
                            }
                            tone={req.status === "approved" ? "soft" : "outline"}
                            dot
                          />
                        )}
                      </div>
                      <h3 className="text-sm font-bold text-[#111111]">
                        {req.entity_label}
                      </h3>
                      <p className="text-[11px] text-[#71717A]">
                        Requested by{" "}
                        <span className="font-semibold text-[#111111]">
                          {req.requester_name}
                        </span>{" "}
                        · {new Date(req.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Before vs Proposed Comparison */}
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-white p-3.5 ring-1 ring-[#ECECEF]">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-[#71717A]">
                        Current Record (Before)
                      </div>
                      <div className="mt-1 text-xs font-bold text-[#111111] tabular-nums">
                        {summarizeSnapshot(req, "before")}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-[#111111] p-3.5 text-white">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-white/70">
                        Requested Correction (Proposed)
                      </div>
                      <div className="mt-1 text-xs font-bold tabular-nums">
                        {summarizeSnapshot(req, "proposed")}
                      </div>
                    </div>
                  </div>

                  {/* Cashier Reason */}
                  <div className="mt-3 rounded-2xl bg-white px-4 py-3 text-xs ring-1 ring-[#ECECEF]">
                    <span className="font-semibold text-[#71717A]">
                      Cashier Reason:{" "}
                    </span>
                    <span className="font-medium text-[#111111]">
                      {req.reason}
                    </span>
                  </div>

                  {/* Owner Action Controls or Final Audit Note */}
                  {isPending ? (
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <input
                        type="text"
                        value={notesById[req.id] ?? ""}
                        onChange={(e) =>
                          setNotesById((prev) => ({
                            ...prev,
                            [req.id]: e.target.value,
                          }))
                        }
                        placeholder="Owner note for cashier (optional)"
                        className="min-w-[220px] flex-1 rounded-full border border-[#E4E4E7] bg-white px-4 py-2 text-xs text-[#111111] placeholder:text-[#A1A1AA] focus:border-[#111111] focus:outline-none"
                      />

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleDecision(req.id, "rejected")}
                          className="inline-flex items-center gap-1.5 rounded-full border border-[#D4D4D8] bg-white px-4 py-2 text-xs font-semibold text-[#111111] transition hover:bg-[#EFEFF2] disabled:opacity-50"
                        >
                          <X className="h-3.5 w-3.5" />
                          Reject
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleDecision(req.id, "approved")}
                          className="inline-flex items-center gap-1.5 rounded-full bg-[#111111] px-4 py-2 text-xs font-semibold text-white transition hover:bg-black/85 disabled:opacity-50"
                        >
                          <Check className="h-3.5 w-3.5" />
                          {isBusy ? "Applying..." : "Approve & Apply"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#71717A]">
                      <span>
                        {req.reviewer_note ? (
                          <>
                            <strong className="text-[#111111]">
                              Owner Note:
                            </strong>{" "}
                            {req.reviewer_note}
                          </>
                        ) : (
                          "No additional owner note"
                        )}
                      </span>
                      {req.reviewed_at && (
                        <span className="tabular-nums">
                          Reviewed {new Date(req.reviewed_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

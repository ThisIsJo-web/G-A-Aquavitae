"use client";

import { CheckCircle2, Clock, ShieldCheck, XCircle } from "lucide-react";
import {
  EmptyState,
  NoticeBanner,
  StatusChip,
} from "@/app/_components/ui/monochrome-controls";
import { QuickStatCard } from "@/app/_components/ui/quick-stat-card";
import type {
  CorrectionRequestsOverview,
  CorrectionType,
} from "@/backend/services/corrections";

interface CashierCorrectionsTabProps {
  data: CorrectionRequestsOverview;
}

function labelCorrection(type: CorrectionType): string {
  if (type === "change_payment_method") return "Fix Payment Method";
  if (type === "update_amount") return "Fix Peso Amount";
  if (type === "cancel_delivery") return "Cancel Delivery";
  if (type === "adjust_shift_cash") return "Adjust Counted Cash";
  return "Void Sale";
}

export function CashierCorrectionsTab({ data }: CashierCorrectionsTabProps) {
  return (
    <div className="space-y-6">
      {data.schemaMissing && (
        <NoticeBanner
          tone="info"
          message="The correction_requests table is not created yet. Ask your admin to run Section 12d of backend/db/schema.sql in Supabase SQL Editor."
        />
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <QuickStatCard
          highlighted
          label="Waiting for Owner"
          value={data.pendingCount}
          sublabel="Pending owner supervision"
          icon={<Clock className="h-5 w-5" />}
        />
        <QuickStatCard
          label="Approved Fixes"
          value={data.approvedCount}
          sublabel="Applied by station owner"
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
        <QuickStatCard
          label="Rejected"
          value={data.rejectedCount}
          sublabel="Kept original record"
          icon={<XCircle className="h-5 w-5" />}
        />
      </div>

      <section className="av-card p-6">
        <div className="mb-4">
          <h2 className="text-base font-bold text-[#111111]">
            Owner Review History ({data.requests.length})
          </h2>
          <p className="text-xs text-[#71717A]">
            Track error corrections you flagged from Walk-in POS, Deliveries,
            Vendo, or Closed Shifts.
          </p>
        </div>

        {data.requests.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck className="h-5 w-5" />}
            title="No correction requests submitted"
            description='Use the "⋯" menu on any Walk-in receipt, Delivery, Vendo entry, or Closed Shift to request Owner approval for a fix.'
          />
        ) : (
          <div className="space-y-2.5">
            {data.requests.map((req) => (
              <div
                key={req.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#F7F7F9] px-4 py-3.5 text-xs"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-[#111111]">
                      {req.entity_label}
                    </span>
                    <StatusChip
                      label={labelCorrection(req.correction_type)}
                      tone="outline"
                    />
                  </div>
                  <div className="text-[#52525B]">Reason: {req.reason}</div>
                  {req.reviewer_note && (
                    <div className="text-[11px] font-semibold text-[#111111]">
                      Owner note: {req.reviewer_note}
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  <StatusChip
                    label={
                      req.status === "pending"
                        ? "Pending Owner"
                        : req.status === "approved"
                          ? "Approved"
                          : "Rejected"
                    }
                    tone={
                      req.status === "pending"
                        ? "solid"
                        : req.status === "approved"
                          ? "soft"
                          : "outline"
                    }
                    dot
                  />
                  <span className="text-[11px] text-[#71717A] tabular-nums">
                    {new Date(req.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

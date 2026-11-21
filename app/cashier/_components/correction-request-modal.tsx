"use client";

import { ShieldAlert, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { NoticeBanner } from "@/app/_components/ui/monochrome-controls";
import type {
  CorrectionEntityType,
  CorrectionType,
  DeliveryPaymentMethod,
  PosPaymentMethod,
} from "@/backend/db/types";
import { formatPHP } from "./types";

export interface CorrectionModalTarget {
  entityType: CorrectionEntityType;
  entityId: string;
  entityLabel: string;
  currentSummary: string;
  defaultPaymentMethod?: PosPaymentMethod | DeliveryPaymentMethod;
  defaultAmount?: number;
}

interface CorrectionRequestModalProps {
  target: CorrectionModalTarget;
  onClose: () => void;
  onSubmitted: () => Promise<void> | void;
}

export function CorrectionRequestModal({
  target,
  onClose,
  onSubmitted,
}: CorrectionRequestModalProps) {
  const defaultType: CorrectionType =
    target.entityType === "pos_sale"
      ? "change_payment_method"
      : target.entityType === "vendo"
        ? "update_amount"
        : target.entityType === "shift_closing"
          ? "adjust_shift_cash"
          : "cancel_delivery";

  const [correctionType, setCorrectionType] =
    useState<CorrectionType>(defaultType);
  const [posMethod, setPosMethod] = useState<PosPaymentMethod>(
    target.defaultPaymentMethod === "gcash"
      ? "cash"
      : target.defaultPaymentMethod === "utang"
        ? "cash"
        : "gcash"
  );
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryPaymentMethod>(
    target.defaultPaymentMethod === "gcash" ? "cash" : "gcash"
  );
  const [amountInput, setAmountInput] = useState(
    target.defaultAmount !== undefined ? String(target.defaultAmount) : ""
  );
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (reason.trim().length < 3) {
      setError("Please explain briefly what mistake happened (min 3 chars).");
      return;
    }

    let proposedChanges: Record<string, unknown> = {};
    if (correctionType === "change_payment_method") {
      proposedChanges = {
        paymentMethod:
          target.entityType === "pos_sale" ? posMethod : deliveryMethod,
      };
    } else if (correctionType === "update_amount") {
      const amt = Number(amountInput);
      if (!Number.isFinite(amt) || amt < 0) {
        setError("Enter a valid corrected peso amount.");
        return;
      }
      proposedChanges = { amount: amt };
    } else if (correctionType === "adjust_shift_cash") {
      const amt = Number(amountInput);
      if (!Number.isFinite(amt) || amt < 0) {
        setError("Enter a valid corrected cash count.");
        return;
      }
      proposedChanges = { actualCash: amt };
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/cashier/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: target.entityType,
          entityId: target.entityId,
          correctionType,
          reason: reason.trim(),
          proposedChanges,
        }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error ?? "Could not send request to Owner.");
        return;
      }

      await Promise.resolve(onSubmitted());
      onClose();
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-[1px]">
      <div className="w-full max-w-md rounded-[28px] border border-[#E5E5EA] bg-white p-6 shadow-[0_24px_60px_rgba(0,0,0,0.18)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#111111] text-white">
              <ShieldAlert className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-[#111111]">
                Request Owner Correction
              </h2>
              <p className="text-xs text-[#71717A]">{target.entityLabel}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F2F2F4] text-[#111111] hover:bg-[#E4E4E7]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 rounded-2xl bg-[#F7F7F9] px-4 py-3 text-xs">
          <span className="font-semibold text-[#71717A]">Current Record: </span>
          <span className="font-bold text-[#111111]">
            {target.currentSummary}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {target.entityType === "delivery" && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#111111]">
                What needs to be fixed?
              </label>
              <select
                value={correctionType}
                onChange={(e) =>
                  setCorrectionType(e.target.value as CorrectionType)
                }
                className="w-full rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-3.5 py-2.5 text-xs font-semibold text-[#111111]"
              >
                <option value="cancel_delivery">Cancel this Delivery</option>
                <option value="change_payment_method">
                  Fix Payment Method (Cash / GCash / Utang)
                </option>
                <option value="update_amount">Fix Total Amount (₱)</option>
              </select>
            </div>
          )}

          {correctionType === "change_payment_method" &&
            target.entityType === "pos_sale" && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#111111]">
                  Correct Payment Method
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["cash", "gcash", "utang"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPosMethod(m)}
                      className={`rounded-full border px-3 py-2 text-xs font-semibold uppercase transition ${
                        posMethod === m
                          ? "border-[#111111] bg-[#111111] text-white"
                          : "border-[#D4D4D8] bg-white text-[#111111]"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}

          {correctionType === "change_payment_method" &&
            target.entityType === "delivery" && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#111111]">
                  Correct Payment Method
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: "cash", label: "Cash" },
                      { id: "gcash", label: "GCash" },
                      { id: "credit", label: "Utang" },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setDeliveryMethod(m.id)}
                      className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                        deliveryMethod === m.id
                          ? "border-[#111111] bg-[#111111] text-white"
                          : "border-[#D4D4D8] bg-white text-[#111111]"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

          {(correctionType === "update_amount" ||
            correctionType === "adjust_shift_cash") && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#111111]">
                {correctionType === "adjust_shift_cash"
                  ? "Correct Actual Cash Counted (₱)"
                  : "Correct Amount (₱)"}
                {target.defaultAmount !== undefined && (
                  <span className="ml-1 font-normal text-[#71717A]">
                    (was {formatPHP(target.defaultAmount)})
                  </span>
                )}
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                required
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-4 py-2.5 text-sm font-bold tabular-nums text-[#111111] focus:border-[#111111] focus:bg-white focus:outline-none"
              />
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[#111111]">
              Reason for Owner Review
            </label>
            <textarea
              rows={3}
              required
              minLength={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Customer paid via GCash instead of Cash, or mistyped coin total."
              className="w-full rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-3.5 py-2.5 text-xs text-[#111111] placeholder:text-[#A1A1AA] focus:border-[#111111] focus:bg-white focus:outline-none"
            />
          </div>

          {error && (
            <NoticeBanner
              tone="error"
              message={error}
              onDismiss={() => setError(null)}
            />
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[#D4D4D8] bg-white px-4 py-2.5 text-xs font-semibold text-[#111111] hover:bg-[#F4F4F6]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-[#111111] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-black/85 disabled:opacity-50"
            >
              {submitting ? "Sending..." : "Send to Owner"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

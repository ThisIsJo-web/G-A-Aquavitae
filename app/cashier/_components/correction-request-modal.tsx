"use client";

import { ShieldAlert, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  handleDecimalKeyDown,
  sanitizeDecimalInput,
} from "@/app/_components/ui/input-validation";
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
  stationQuery: string;
  isElevatedActor: boolean;
  onClose: () => void;
  onSubmitted: (appliedDirectly: boolean) => Promise<void> | void;
}

export function CorrectionRequestModal({
  target,
  stationQuery,
  isElevatedActor,
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
          : "change_payment_method";

  const [correctionType, setCorrectionType] =
    useState<CorrectionType>(defaultType);
  const [posMethod, setPosMethod] = useState<PosPaymentMethod>(
    target.defaultPaymentMethod === "gcash" ||
      target.defaultPaymentMethod === "utang"
      ? "cash"
      : "gcash"
  );
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryPaymentMethod>(
    target.defaultPaymentMethod === "gcash" ? "cash" : "gcash"
  );
  const [amountInput, setAmountInput] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (reason.trim().length < 3) {
      setError("Please explain briefly what needs to be changed.");
      return;
    }

    let proposedChanges: Record<string, unknown> = {};
    if (correctionType === "change_payment_method") {
      proposedChanges = {
        paymentMethod:
          target.entityType === "pos_sale" ? posMethod : deliveryMethod,
      };
    } else if (correctionType === "update_amount") {
      if (!amountInput.trim() || !Number.isFinite(Number(amountInput))) {
        setError("Enter a valid corrected peso amount.");
        return;
      }
      proposedChanges = { amount: Number(amountInput) };
    } else if (correctionType === "adjust_shift_cash") {
      if (!amountInput.trim() || !Number.isFinite(Number(amountInput))) {
        setError("Enter a valid corrected cash count.");
        return;
      }
      proposedChanges = { actualCash: Number(amountInput) };
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/cashier/corrections${stationQuery}`, {
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
      const payload = (await res.json()) as {
        error?: string;
        appliedDirectly?: boolean;
      };
      if (!res.ok) {
        setError(payload.error ?? "Could not save correction.");
        return;
      }

      await Promise.resolve(onSubmitted(Boolean(payload.appliedDirectly)));
      onClose();
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
      <div className="av-card w-full max-w-md p-6 shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--av-accent)] text-[var(--av-accent-ink)]">
              <ShieldAlert className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-[var(--av-ink)]">
                {isElevatedActor
                  ? "Apply Direct Correction"
                  : "Request Owner Correction"}
              </h2>
              <p className="text-xs text-[var(--av-muted)]">
                {target.entityLabel}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--av-surface-subtle)] text-[var(--av-ink)] hover:bg-[var(--av-surface-hover)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 rounded-2xl bg-[var(--av-surface-subtle)] px-4 py-3 text-xs">
          <span className="font-semibold text-[var(--av-muted)]">
            Current Record:{" "}
          </span>
          <span className="font-bold text-[var(--av-ink)]">
            {target.currentSummary}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {target.entityType === "delivery" && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--av-ink)]">
                What needs to be fixed?
              </label>
              <select
                value={correctionType}
                onChange={(e) =>
                  setCorrectionType(e.target.value as CorrectionType)
                }
                className="av-input w-full rounded-2xl px-3.5 py-2.5 text-xs font-semibold"
              >
                <option value="change_payment_method">
                  Fix Payment Method (Cash / GCash / Utang)
                </option>
                <option value="update_amount">Fix Total Amount (₱)</option>
                <option value="cancel_delivery">Cancel this Delivery</option>
              </select>
            </div>
          )}

          {correctionType === "change_payment_method" &&
            target.entityType === "pos_sale" && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[var(--av-ink)]">
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
                          ? "border-[var(--av-accent)] bg-[var(--av-accent)] text-[var(--av-accent-ink)]"
                          : "border-[var(--av-border-strong)] bg-[var(--av-surface)] text-[var(--av-ink)]"
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
                <label className="mb-1.5 block text-xs font-semibold text-[var(--av-ink)]">
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
                          ? "border-[var(--av-accent)] bg-[var(--av-accent)] text-[var(--av-accent-ink)]"
                          : "border-[var(--av-border-strong)] bg-[var(--av-surface)] text-[var(--av-ink)]"
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
              <label className="mb-1.5 block text-xs font-semibold text-[var(--av-ink)]">
                {correctionType === "adjust_shift_cash"
                  ? "Correct Actual Cash Counted (₱)"
                  : "Correct Amount (₱)"}
                {target.defaultAmount !== undefined && (
                  <span className="ml-1 font-normal text-[var(--av-muted)]">
                    (currently {formatPHP(target.defaultAmount)})
                  </span>
                )}
              </label>
              <input
                type="text"
                inputMode="decimal"
                required
                value={amountInput}
                onKeyDown={handleDecimalKeyDown}
                onChange={(e) =>
                  setAmountInput(sanitizeDecimalInput(e.target.value))
                }
                placeholder={
                  target.defaultAmount !== undefined
                    ? `Enter new amount (was ${target.defaultAmount.toFixed(2)})`
                    : "Enter new amount"
                }
                className="av-input w-full rounded-2xl px-4 py-2.5 text-sm font-bold tabular-nums"
              />
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--av-ink)]">
              Reason
            </label>
            <textarea
              rows={3}
              required
              minLength={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Customer paid via GCash instead of Cash, or mistyped coin total."
              className="av-input w-full rounded-2xl px-3.5 py-2.5 text-xs"
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
              className="av-btn-outline rounded-full px-4 py-2.5 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="av-btn-primary rounded-full px-5 py-2.5 text-xs font-semibold transition disabled:opacity-50"
            >
              {submitting
                ? "Saving..."
                : isElevatedActor
                  ? "Apply Fix Now"
                  : "Send to Owner"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

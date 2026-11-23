"use client";

import { Banknote, Calculator, Clock, CreditCard } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  handleDecimalKeyDown,
  sanitizeDecimalInput,
} from "@/app/_components/ui/input-validation";
import {
  EmptyState,
  NoticeBanner,
  RowActionMenu,
  StatusChip,
} from "@/app/_components/ui/monochrome-controls";
import { QuickStatCard } from "@/app/_components/ui/quick-stat-card";
import type { CorrectionModalTarget } from "./correction-request-modal";
import { formatPHP, type ShiftClosingOverviewDTO } from "./types";

interface ShiftClosingTabProps {
  data: ShiftClosingOverviewDTO;
  businessDate: string;
  stationQuery: string;
  isElevatedActor: boolean;
  onDataChanged: () => Promise<void> | void;
  onRequestCorrection: (target: CorrectionModalTarget) => void;
}

export function ShiftClosingTab({
  data,
  businessDate,
  stationQuery,
  isElevatedActor,
  onDataChanged,
  onRequestCorrection,
}: ShiftClosingTabProps) {
  const { liveTally, history } = data;

  const [shiftLabel, setShiftLabel] = useState("Full Day");
  const [openingCashInput, setOpeningCashInput] = useState("");
  const [actualCashInput, setActualCashInput] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const openingCash = Math.max(0, Number(openingCashInput) || 0);
  const expectedCash = openingCash + liveTally.totalCashCollected;
  const hasActualCash = actualCashInput.trim() !== "";
  const actualCash = hasActualCash
    ? Math.max(0, Number(actualCashInput) || 0)
    : 0;
  const difference = actualCash - expectedCash;
  const totalUnpaid =
    liveTally.deliveryUnpaidTotal + (liveTally.walkinUtangSales ?? 0);

  async function handleCloseShift(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasActualCash) {
      setError("Enter the actual cash you counted before closing the shift.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/cashier/shift-closing${stationQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessDate,
          shiftLabel,
          openingCash,
          actualCash,
          notes: notes || undefined,
        }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error ?? "Could not close shift.");
        return;
      }

      setSuccess(`Shift "${shiftLabel}" closed and saved for ${businessDate}.`);
      setOpeningCashInput("");
      setActualCashInput("");
      setNotes("");
      await Promise.resolve(onDataChanged());
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Quick Stats Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <QuickStatCard
          highlighted
          label="Expected Cash Total"
          value={formatPHP(expectedCash)}
          sublabel="Cash sales + fees + vendo + starting cash"
          icon={<Banknote className="h-5 w-5" />}
        />
        <QuickStatCard
          label="Total Daily Sales"
          value={formatPHP(liveTally.totalGrossSales)}
          sublabel="Cash + GCash / Bank + Vendo"
          icon={<Calculator className="h-5 w-5" />}
        />
        <QuickStatCard
          label="GCash / Bank"
          value={formatPHP(liveTally.totalDigitalCollected)}
          sublabel="Online payments (not in drawer)"
          icon={<CreditCard className="h-5 w-5" />}
        />
        <QuickStatCard
          label="Unpaid & Utang"
          value={formatPHP(totalUnpaid)}
          sublabel="Excluded from cash until paid"
          icon={<Clock className="h-5 w-5" />}
        />
      </div>

      {/* Automatic Breakdown + Cash Counter */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="av-card space-y-5 p-6 lg:col-span-7">
          <div>
            <h2 className="text-base font-bold text-[var(--av-ink)]">
              Automatic Daily Cash Tally
            </h2>
            <p className="text-xs font-normal text-[var(--av-muted)]">
              Walk-in sales, delivery sales, fees, and vendo income automatically
              summed into one final expected peso amount.
            </p>
          </div>

          <div className="space-y-2 text-xs">
            {[
              {
                title: "Starting Cash",
                sub: "Cash in drawer at start of shift",
                val: formatPHP(openingCash),
              },
              {
                title: `Walk-in Cash Sales (${liveTally.walkinCount} sales)`,
                sub: `GCash/Bank: ${formatPHP(liveTally.walkinDigitalSales)} · Utang: ${formatPHP(liveTally.walkinUtangSales ?? 0)}`,
                val: `+${formatPHP(liveTally.walkinCashSales)}`,
              },
              {
                title: `Delivery Water Sales — Cash (${liveTally.deliveryCount} deliveries)`,
                sub: `GCash: ${formatPHP(liveTally.deliveryDigitalSales)} · Unpaid: ${formatPHP(liveTally.deliveryUnpaidTotal)}`,
                val: `+${formatPHP(liveTally.deliveryWaterCashSales)}`,
              },
              {
                title: "Delivery / Extra Fees — Cash",
                sub: "Fees collected in cash",
                val: `+${formatPHP(liveTally.deliveryFeeCashSales)}`,
              },
              {
                title: "Vendo Machine Income (Monthly)",
                sub: `Coins logged on ${businessDate}`,
                val: `+${formatPHP(liveTally.vendoDailyIncome)}`,
              },
            ].map((row) => (
              <div
                key={row.title}
                className="flex items-center justify-between rounded-2xl bg-[var(--av-surface-subtle)] px-4 py-3"
              >
                <div>
                  <div className="font-semibold text-[var(--av-ink)]">
                    {row.title}
                  </div>
                  <div className="text-[11px] font-normal text-[var(--av-muted)]">
                    {row.sub}
                  </div>
                </div>
                <span className="text-sm font-bold text-[var(--av-ink)] tabular-nums">
                  {row.val}
                </span>
              </div>
            ))}

            <div className="flex items-center justify-between rounded-2xl bg-[var(--av-accent)] px-5 py-4 text-[var(--av-accent-ink)]">
              <span className="text-sm font-bold">
                Final Expected Cash (Total Peso)
              </span>
              <span className="text-xl font-bold tabular-nums">
                {formatPHP(expectedCash)}
              </span>
            </div>
          </div>

          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--av-muted)]">
              Delivery Count &amp; Gallon In/Out Summary
            </h3>
            <div className="mt-2.5 grid gap-3 text-xs sm:grid-cols-3">
              {(
                [
                  { label: "Today", stat: liveTally.deliveryStats.today },
                  { label: "This Week", stat: liveTally.deliveryStats.week },
                  { label: "This Month", stat: liveTally.deliveryStats.month },
                ] as const
              ).map(({ label, stat }) => (
                <div
                  key={label}
                  className="rounded-2xl border border-[var(--av-border)] bg-[var(--av-surface)] p-3.5"
                >
                  <div className="text-[11px] font-semibold text-[var(--av-muted)]">
                    {label}
                  </div>
                  <div className="mt-1 font-bold text-[var(--av-ink)] tabular-nums">
                    {stat.count} · {formatPHP(stat.totalSales)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[var(--av-muted)] tabular-nums">
                    {stat.gallonsOut} out · {stat.emptiesIn} in
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Count Cash & Over/Short Check */}
        <form
          onSubmit={handleCloseShift}
          className="av-card space-y-4 p-6 lg:col-span-5"
        >
          <div>
            <h2 className="text-base font-bold text-[var(--av-ink)]">
              Count Cash &amp; Close Shift
            </h2>
            <p className="text-xs font-normal text-[var(--av-muted)]">
              Enter actual cash counted to automatically check Exact, Over, or
              Short.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--av-ink)]">
              Shift
            </label>
            <select
              value={shiftLabel}
              onChange={(e) => setShiftLabel(e.target.value)}
              className="av-input w-full rounded-2xl px-4 py-2.5 text-xs font-semibold"
            >
              <option value="Full Day">Full Day</option>
              <option value="Morning Shift">Morning Shift</option>
              <option value="Afternoon Shift">Afternoon Shift</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--av-ink)]">
                Starting Cash (₱)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={openingCashInput}
                onKeyDown={handleDecimalKeyDown}
                onChange={(e) =>
                  setOpeningCashInput(sanitizeDecimalInput(e.target.value))
                }
                placeholder="e.g. 500.00"
                className="av-input w-full rounded-2xl px-3.5 py-2.5 text-sm font-bold tabular-nums"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--av-ink)]">
                Actual Cash Counted (₱)
              </label>
              <input
                type="text"
                inputMode="decimal"
                required
                value={actualCashInput}
                onKeyDown={handleDecimalKeyDown}
                onChange={(e) =>
                  setActualCashInput(sanitizeDecimalInput(e.target.value))
                }
                placeholder="Enter counted cash"
                className="av-input w-full rounded-2xl border-[var(--av-ink)] bg-[var(--av-surface)] px-3.5 py-2.5 text-sm font-bold tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-2 rounded-2xl bg-[var(--av-surface-subtle)] p-4 text-xs">
            <div className="flex justify-between text-[var(--av-muted)]">
              <span>Expected Final Peso</span>
              <span className="font-bold text-[var(--av-ink)] tabular-nums">
                {formatPHP(expectedCash)}
              </span>
            </div>
            <div className="flex justify-between text-[var(--av-muted)]">
              <span>Actual Cash Counted</span>
              <span className="font-bold text-[var(--av-ink)] tabular-nums">
                {hasActualCash ? formatPHP(actualCash) : "—"}
              </span>
            </div>

            {!hasActualCash ? (
              <div className="mt-2 rounded-2xl border border-dashed border-[var(--av-border-strong)] bg-[var(--av-surface)] px-4 py-3 text-center text-xs text-[var(--av-muted)]">
                Enter counted cash above to check Over / Short
              </div>
            ) : difference === 0 ? (
              <div className="mt-2 rounded-2xl bg-[var(--av-accent)] px-4 py-3 text-center text-[var(--av-accent-ink)]">
                <div className="text-xs font-bold uppercase tracking-wider">
                  Exact Cash · ₱0.00
                </div>
                <div className="mt-0.5 text-[11px] opacity-75">
                  Matches expected total exactly.
                </div>
              </div>
            ) : difference > 0 ? (
              <div className="mt-2 rounded-2xl border border-[var(--av-ink)] bg-[var(--av-surface)] px-4 py-3 text-center">
                <div className="text-sm font-bold text-[var(--av-ink)] tabular-nums">
                  OVER by +{formatPHP(difference)}
                </div>
                <div className="mt-0.5 text-[11px] text-[var(--av-muted)]">
                  Cash is MORE than expected.
                </div>
              </div>
            ) : (
              <div className="mt-2 rounded-2xl border-2 border-[var(--av-ink)] bg-[var(--av-surface-hover)] px-4 py-3 text-center">
                <div className="text-sm font-bold text-[var(--av-ink)] tabular-nums">
                  SHORT by {formatPHP(Math.abs(difference))}
                </div>
                <div className="mt-0.5 text-[11px] text-[var(--av-ink-secondary)]">
                  Cash is LESS than expected.
                </div>
              </div>
            )}
          </div>

          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Remarks / reason (optional)"
            className="av-input w-full rounded-2xl px-4 py-2.5 text-xs"
          />

          {error && (
            <NoticeBanner
              tone="error"
              message={error}
              onDismiss={() => setError(null)}
            />
          )}
          {success && (
            <NoticeBanner
              tone="success"
              message={success}
              onDismiss={() => setSuccess(null)}
            />
          )}

          <button
            type="submit"
            disabled={submitting || !hasActualCash || data.schemaMissing}
            className="av-btn-primary w-full rounded-full px-5 py-3.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-35"
          >
            {submitting ? "Saving..." : "Close Shift & Save Tally"}
          </button>
        </form>
      </div>

      {/* Past Closed Shifts */}
      <div className="av-card p-6">
        <h3 className="text-base font-bold text-[var(--av-ink)]">
          Past Closed Shifts ({history.length})
        </h3>
        <div className="mt-4 overflow-x-auto">
          {history.length === 0 ? (
            <EmptyState
              icon={<Calculator className="h-4 w-4" />}
              title="No closed shifts yet"
            />
          ) : (
            <table className="w-full border-separate border-spacing-y-2 text-left text-xs">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-[var(--av-muted)]">
                  <th className="px-3 pb-1">Date &amp; Shift</th>
                  <th className="px-3 pb-1">Total Sales</th>
                  <th className="px-3 pb-1">Expected Cash</th>
                  <th className="px-3 pb-1">Actual Cash</th>
                  <th className="px-3 pb-1">Cash Check</th>
                  <th className="px-3 pb-1">Notes</th>
                  <th className="pb-1 pr-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr
                    key={h.id}
                    className="rounded-2xl bg-[var(--av-surface-subtle)] font-medium"
                  >
                    <td className="rounded-l-2xl px-3 py-3">
                      <div className="font-bold text-[var(--av-ink)]">
                        {h.business_date} · {h.shift_label}
                      </div>
                      <div className="text-[11px] font-normal text-[var(--av-muted)]">
                        Closed {new Date(h.closed_at).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-3 py-3 font-bold text-[var(--av-ink)] tabular-nums">
                      {formatPHP(h.total_gross_sales)}
                    </td>
                    <td className="px-3 py-3 text-[var(--av-ink-secondary)] tabular-nums">
                      {formatPHP(h.expected_cash)}
                    </td>
                    <td className="px-3 py-3 font-bold text-[var(--av-ink)] tabular-nums">
                      {formatPHP(h.actual_cash)}
                    </td>
                    <td className="px-3 py-3">
                      <StatusChip
                        label={
                          h.variance === 0
                            ? "Exact"
                            : h.variance > 0
                              ? `Over +${formatPHP(h.variance)}`
                              : `Short ${formatPHP(Math.abs(h.variance))}`
                        }
                        tone={
                          h.variance === 0
                            ? "solid"
                            : h.variance > 0
                              ? "soft"
                              : "outline"
                        }
                      />
                    </td>
                    <td className="px-3 py-3 text-[var(--av-muted)]">
                      {h.notes || "—"}
                    </td>
                    <td className="rounded-r-2xl py-3 pr-3 text-right">
                      <RowActionMenu
                        ariaLabel={`Actions for ${h.business_date} ${h.shift_label}`}
                        actions={[
                          {
                            label: isElevatedActor
                              ? "Adjust Cash Count"
                              : "Request Cash Count Fix",
                            onClick: () =>
                              onRequestCorrection({
                                entityType: "shift_closing",
                                entityId: h.id,
                                entityLabel: `${h.business_date} · ${h.shift_label}`,
                                currentSummary: `Expected ${formatPHP(h.expected_cash)} · Counted ${formatPHP(h.actual_cash)}`,
                                defaultAmount: h.actual_cash,
                              }),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

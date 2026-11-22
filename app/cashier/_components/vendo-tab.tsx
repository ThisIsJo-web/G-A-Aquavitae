"use client";

import { Calendar, CalendarDays, CalendarRange, Coins } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  addIsoDaysClient,
  clampIsoDate,
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
import {
  formatPHP,
  type VendoOverviewDTO,
  type VendoPeriodType,
} from "./types";

interface VendoTabProps {
  data: VendoOverviewDTO;
  businessDate: string;
  todayDate: string;
  stationQuery: string;
  isElevatedActor: boolean;
  onDataChanged: () => Promise<void> | void;
  onRequestCorrection: (target: CorrectionModalTarget) => void;
}

export function VendoTab({
  data,
  businessDate,
  todayDate,
  stationQuery,
  isElevatedActor,
  onDataChanged,
  onRequestCorrection,
}: VendoTabProps) {
  const [machineName, setMachineName] = useState("");
  const [periodType, setPeriodType] = useState<VendoPeriodType>("daily");
  const [periodStart, setPeriodStart] = useState(businessDate);
  const [periodEnd, setPeriodEnd] = useState(businessDate);
  const [amount, setAmount] = useState("");
  const [meterStart, setMeterStart] = useState("");
  const [meterEnd, setMeterEnd] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const minPeriodStart = addIsoDaysClient(todayDate, -14);
  const minPeriodEnd = addIsoDaysClient(todayDate, -7);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!machineName.trim()) {
      setError("Enter the vendo machine name.");
      return;
    }
    if (!amount.trim() || !Number.isFinite(Number(amount))) {
      setError("Enter a valid peso amount collected.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/cashier/vendo${stationQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          machineName: machineName.trim(),
          periodType,
          periodStart: periodType === "weekly" ? periodStart : businessDate,
          periodEnd: periodType === "weekly" ? periodEnd : businessDate,
          amount: Number(amount),
          meterStart: meterStart ? Number(meterStart) : null,
          meterEnd: meterEnd ? Number(meterEnd) : null,
          notes: notes || undefined,
          businessDate,
        }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error ?? "Could not save vendo income.");
        return;
      }

      setSuccess(
        `Saved ${periodType} vendo income of ${formatPHP(Number(amount))}.`
      );
      setMachineName("");
      setAmount("");
      setMeterStart("");
      setMeterEnd("");
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
          label="Today's Daily Vendo"
          value={formatPHP(data.summary.todayDailyTotal)}
          sublabel="Added into Closing Shift Tally"
          icon={<Coins className="h-5 w-5" />}
        />
        <QuickStatCard
          label="Collected Today"
          value={formatPHP(data.summary.todayAllTotal)}
          sublabel="Daily + weekly counted today"
          icon={<Calendar className="h-5 w-5" />}
        />
        <QuickStatCard
          label="Last 7 Days"
          value={formatPHP(data.summary.weekTotal)}
          sublabel="Weekly vendo total"
          icon={<CalendarRange className="h-5 w-5" />}
        />
        <QuickStatCard
          label="This Month"
          value={formatPHP(data.summary.monthTotal)}
          sublabel={`${data.summary.dailyCount} daily · ${data.summary.weeklyCount} weekly`}
          icon={<CalendarDays className="h-5 w-5" />}
        />
      </div>

      {/* Form + History */}
      <div className="grid gap-6 lg:grid-cols-12">
        <form
          onSubmit={handleSubmit}
          className="av-card space-y-4 p-6 lg:col-span-5"
        >
          <div>
            <h2 className="text-base font-bold text-[var(--av-ink)]">
              Record Vendo Income
            </h2>
            <p className="text-xs font-normal text-[var(--av-muted)]">
              Enter coins collected daily or weekly from your water vendo.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--av-ink)]">
              Daily or Weekly
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(["daily", "weekly"] as VendoPeriodType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setPeriodType(type)}
                  className={`rounded-full border px-4 py-2 text-xs font-semibold capitalize transition ${
                    periodType === type
                      ? "border-[var(--av-accent)] bg-[var(--av-accent)] text-[var(--av-accent-ink)]"
                      : "border-[var(--av-border-strong)] bg-[var(--av-surface)] text-[var(--av-ink)] hover:bg-[var(--av-surface-subtle)]"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--av-ink)]">
              Machine Name
            </label>
            <input
              type="text"
              required
              value={machineName}
              onChange={(e) => setMachineName(e.target.value)}
              placeholder="e.g. Main Vendo #1"
              className="av-input w-full rounded-2xl px-4 py-2.5 text-sm"
            />
          </div>

          {periodType === "weekly" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--av-ink)]">
                  Start Date
                </label>
                <input
                  type="date"
                  required
                  min={minPeriodStart}
                  max={periodEnd <= todayDate ? periodEnd : todayDate}
                  value={periodStart}
                  onChange={(e) =>
                    setPeriodStart(
                      clampIsoDate(e.target.value, minPeriodStart, periodEnd)
                    )
                  }
                  className="av-input w-full rounded-2xl px-3 py-2 text-xs tabular-nums"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--av-ink)]">
                  End Date
                </label>
                <input
                  type="date"
                  required
                  min={periodStart >= minPeriodEnd ? periodStart : minPeriodEnd}
                  max={todayDate}
                  value={periodEnd}
                  onChange={(e) => {
                    const nextEnd = clampIsoDate(
                      e.target.value,
                      minPeriodEnd,
                      todayDate
                    );
                    setPeriodEnd(nextEnd);
                    if (periodStart > nextEnd) setPeriodStart(nextEnd);
                  }}
                  className="av-input w-full rounded-2xl px-3 py-2 text-xs tabular-nums"
                />
              </div>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--av-ink)]">
              Coins / Cash Collected (₱)
            </label>
            <input
              type="text"
              inputMode="decimal"
              required
              value={amount}
              onKeyDown={handleDecimalKeyDown}
              onChange={(e) => setAmount(sanitizeDecimalInput(e.target.value))}
              placeholder="e.g. 450.00"
              className="av-input w-full rounded-2xl px-4 py-2.5 text-base font-bold tabular-nums"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--av-muted)]">
                Meter Start (Optional)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={meterStart}
                onKeyDown={handleDecimalKeyDown}
                onChange={(e) =>
                  setMeterStart(sanitizeDecimalInput(e.target.value))
                }
                placeholder="e.g. 1250"
                className="av-input w-full rounded-2xl px-3 py-2 text-xs tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--av-muted)]">
                Meter End (Optional)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={meterEnd}
                onKeyDown={handleDecimalKeyDown}
                onChange={(e) =>
                  setMeterEnd(sanitizeDecimalInput(e.target.value))
                }
                placeholder="e.g. 1410"
                className="av-input w-full rounded-2xl px-3 py-2 text-xs tabular-nums"
              />
            </div>
          </div>

          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
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
            disabled={submitting || data.schemaMissing}
            className="av-btn-primary w-full rounded-full px-5 py-3 text-sm font-semibold transition disabled:opacity-40"
          >
            {submitting ? "Saving..." : "Save Vendo Income"}
          </button>
        </form>

        {/* Vendo History */}
        <div className="av-card p-6 lg:col-span-7">
          <h3 className="text-base font-bold text-[var(--av-ink)]">
            Vendo History ({data.collections.length})
          </h3>
          <div className="mt-4 overflow-x-auto">
            {data.collections.length === 0 ? (
              <EmptyState
                icon={<Coins className="h-4 w-4" />}
                title="No vendo income yet"
                description="Daily and weekly coin counts will appear here."
              />
            ) : (
              <table className="w-full border-separate border-spacing-y-2 text-left text-xs">
                <thead>
                  <tr className="text-[11px] font-semibold uppercase tracking-wider text-[var(--av-muted)]">
                    <th className="px-3 pb-1">Machine</th>
                    <th className="px-3 pb-1">Period</th>
                    <th className="px-3 pb-1">Meter</th>
                    <th className="px-3 pb-1">Amount</th>
                    <th className="px-3 pb-1">Notes</th>
                    <th className="pb-1 pr-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.collections.map((c) => (
                    <tr
                      key={c.id}
                      className="rounded-2xl bg-[var(--av-surface-subtle)] font-medium transition hover:bg-[var(--av-surface-hover)]"
                    >
                      <td className="rounded-l-2xl px-3 py-3">
                        <div className="font-bold text-[var(--av-ink)]">
                          {c.machine_name}
                        </div>
                        <div className="text-[11px] font-normal text-[var(--av-muted)]">
                          {c.business_date}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <StatusChip
                          label={c.period_type === "daily" ? "Daily" : "Weekly"}
                          tone={c.period_type === "daily" ? "solid" : "soft"}
                        />
                        <div className="mt-1 text-[11px] text-[var(--av-muted)] tabular-nums">
                          {c.period_start === c.period_end
                            ? c.period_start
                            : `${c.period_start} → ${c.period_end}`}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[11px] text-[var(--av-ink-secondary)] tabular-nums">
                        {c.meter_start !== null && c.meter_end !== null
                          ? `${c.meter_start} → ${c.meter_end}`
                          : "—"}
                      </td>
                      <td className="px-3 py-3 font-bold text-[var(--av-ink)] tabular-nums">
                        {formatPHP(c.amount)}
                      </td>
                      <td className="px-3 py-3 text-[var(--av-muted)]">
                        {c.notes || "—"}
                      </td>
                      <td className="rounded-r-2xl py-3 pr-3 text-right">
                        <RowActionMenu
                          ariaLabel={`Actions for ${c.machine_name}`}
                          actions={[
                            {
                              label: isElevatedActor
                                ? "Edit Amount"
                                : "Request Amount Fix",
                              onClick: () =>
                                onRequestCorrection({
                                  entityType: "vendo",
                                  entityId: c.id,
                                  entityLabel: `${c.machine_name} (${c.business_date})`,
                                  currentSummary: `${c.period_type === "daily" ? "Daily" : "Weekly"} · ${formatPHP(c.amount)}`,
                                  defaultAmount: c.amount,
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
    </div>
  );
}

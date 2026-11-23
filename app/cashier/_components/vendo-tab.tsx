"use client";

import { Calendar, CalendarDays, Coins, Hash } from "lucide-react";
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
import { formatPHP, type VendoOverviewDTO } from "./types";

interface VendoTabProps {
  data: VendoOverviewDTO;
  businessDate: string;
  todayDate: string;
  stationQuery: string;
  isElevatedActor: boolean;
  onDataChanged: () => Promise<void> | void;
  onRequestCorrection: (target: CorrectionModalTarget) => void;
}

function addMonthsClient(yearMonth: string, deltaMonths: number): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + deltaMonths, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(isoOrYm: string): string {
  const ym = isoOrYm.slice(0, 7);
  const [y, m] = ym.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return ym;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
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
  const maxMonth = todayDate.slice(0, 7);
  const minMonth = addMonthsClient(maxMonth, -11);
  const activeMonthLabel = formatMonthLabel(businessDate);
  const activeYear = businessDate.slice(0, 4);

  const [machineName, setMachineName] = useState("");
  const [collectionMonth, setCollectionMonth] = useState(
    businessDate.slice(0, 7)
  );
  const [amount, setAmount] = useState("");
  const [meterStart, setMeterStart] = useState("");
  const [meterEnd, setMeterEnd] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function clampMonth(raw: string): string {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return maxMonth;
    if (raw > maxMonth) return maxMonth;
    if (raw < minMonth) return minMonth;
    return raw;
  }

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

    const safeMonth = clampMonth(collectionMonth);
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/cashier/vendo${stationQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          machineName: machineName.trim(),
          collectionMonth: safeMonth,
          amount: Number(amount),
          meterStart: meterStart ? Number(meterStart) : null,
          meterEnd: meterEnd ? Number(meterEnd) : null,
          notes: notes || undefined,
          businessDate,
        }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error ?? "Could not save monthly vendo income.");
        return;
      }

      setSuccess(
        `Saved monthly vendo income for ${formatMonthLabel(safeMonth)}: ${formatPHP(Number(amount))}.`
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
      {/* Quick Stats Row (Strictly Monthly Vendo) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <QuickStatCard
          highlighted
          label={`Monthly Vendo (${activeMonthLabel})`}
          value={formatPHP(data.summary.thisMonthTotal)}
          sublabel="Total vendo coins recorded for this month"
          icon={<Coins className="h-5 w-5" />}
        />
        <QuickStatCard
          label="Recorded Today"
          value={formatPHP(data.summary.todayTotal)}
          sublabel="Included in today's Closing Shift cash drawer"
          icon={<Calendar className="h-5 w-5" />}
        />
        <QuickStatCard
          label={`${activeYear} Vendo Total`}
          value={formatPHP(data.summary.yearTotal)}
          sublabel="Cumulative monthly collections this year"
          icon={<CalendarDays className="h-5 w-5" />}
        />
        <QuickStatCard
          label="Monthly Entries"
          value={data.summary.totalEntries}
          sublabel="Logged monthly coin collections"
          icon={<Hash className="h-5 w-5" />}
        />
      </div>

      {/* Form + Monthly History */}
      <div className="grid gap-6 lg:grid-cols-12">
        <form
          onSubmit={handleSubmit}
          className="av-card space-y-4 p-6 lg:col-span-5"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-[var(--av-ink)]">
                Record Monthly Vendo Income
              </h2>
              <p className="text-xs font-normal text-[var(--av-muted)]">
                Log monthly coin collections from your water vendo machine.
              </p>
            </div>
            <StatusChip label="Monthly" tone="solid" />
          </div>

          <div>
            <label
              htmlFor="vendo-month"
              className="mb-1.5 block text-xs font-semibold text-[var(--av-ink)]"
            >
              Collection Month
            </label>
            <input
              id="vendo-month"
              type="month"
              required
              min={minMonth}
              max={maxMonth}
              value={collectionMonth}
              onChange={(e) => setCollectionMonth(clampMonth(e.target.value))}
              className="av-input w-full rounded-2xl px-4 py-2.5 text-sm font-semibold tabular-nums"
            />
          </div>

          <div>
            <label
              htmlFor="vendo-machine"
              className="mb-1.5 block text-xs font-semibold text-[var(--av-ink)]"
            >
              Machine Name
            </label>
            <input
              id="vendo-machine"
              type="text"
              required
              value={machineName}
              onChange={(e) => setMachineName(e.target.value)}
              placeholder="e.g. Main Vendo #1"
              className="av-input w-full rounded-2xl px-4 py-2.5 text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="vendo-amount"
              className="mb-1.5 block text-xs font-semibold text-[var(--av-ink)]"
            >
              Monthly Coins / Cash Collected (₱)
            </label>
            <input
              id="vendo-amount"
              type="text"
              inputMode="decimal"
              required
              value={amount}
              onKeyDown={handleDecimalKeyDown}
              onChange={(e) => setAmount(sanitizeDecimalInput(e.target.value))}
              placeholder="e.g. 4500.00"
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
                placeholder="e.g. 1680"
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
            {submitting ? "Saving..." : "Save Monthly Vendo Income"}
          </button>
        </form>

        {/* Monthly Vendo History */}
        <div className="av-card p-6 lg:col-span-7">
          <h3 className="text-base font-bold text-[var(--av-ink)]">
            Monthly Vendo History ({data.collections.length})
          </h3>
          <div className="mt-4 overflow-x-auto">
            {data.collections.length === 0 ? (
              <EmptyState
                icon={<Coins className="h-4 w-4" />}
                title="No monthly vendo income yet"
                description="Monthly coin collections will appear here."
              />
            ) : (
              <table className="w-full border-separate border-spacing-y-2 text-left text-xs">
                <thead>
                  <tr className="text-[11px] font-semibold uppercase tracking-wider text-[var(--av-muted)]">
                    <th className="px-3 pb-1">Machine</th>
                    <th className="px-3 pb-1">Month</th>
                    <th className="px-3 pb-1">Meter</th>
                    <th className="px-3 pb-1">Amount</th>
                    <th className="px-3 pb-1">Notes</th>
                    <th className="pb-1 pr-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.collections.map((c) => {
                    const monthText = formatMonthLabel(
                      c.period_start || c.business_date
                    );
                    return (
                      <tr
                        key={c.id}
                        className="rounded-2xl bg-[var(--av-surface-subtle)] font-medium transition hover:bg-[var(--av-surface-hover)]"
                      >
                        <td className="rounded-l-2xl px-3 py-3">
                          <div className="font-bold text-[var(--av-ink)]">
                            {c.machine_name}
                          </div>
                          <div className="text-[11px] font-normal text-[var(--av-muted)]">
                            Logged {c.business_date}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <StatusChip label={monthText} tone="solid" />
                          <div className="mt-1 text-[11px] text-[var(--av-muted)]">
                            Monthly
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
                                    entityLabel: `${c.machine_name} (${monthText})`,
                                    currentSummary: `Monthly (${monthText}) · ${formatPHP(c.amount)}`,
                                    defaultAmount: c.amount,
                                  }),
                              },
                            ]}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

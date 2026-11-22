"use client";

import { Download, FileSpreadsheet, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { trackAction } from "@/app/_components/activity-tracker";
import {
  EmptyState,
  NoticeBanner,
  RowActionMenu,
  StatusChip,
} from "@/app/_components/ui/monochrome-controls";
import {
  formatPHP,
  type OwnerDashboardSnapshot,
  type OwnerUnifiedSaleRow,
} from "./types";

export type OwnerSalesSubView = "sales" | "shifts";

interface OwnerSalesTabProps {
  snapshot: OwnerDashboardSnapshot;
  stationQuery: string;
  stationAmpParam: string;
  subView: OwnerSalesSubView;
  onSubViewChange: (view: OwnerSalesSubView) => void;
  onDataChanged: () => Promise<void>;
}

type ChannelFilter = "all" | "walkin" | "delivery" | "vendo";
type StatusFilter = "all" | "paid" | "unpaid" | "utang" | "voided";

function channelLabel(channel: OwnerUnifiedSaleRow["channel"]): string {
  if (channel === "walkin") return "Walk-in";
  if (channel === "delivery") return "Delivery";
  return "Vendo";
}

function statusChipProps(status: OwnerUnifiedSaleRow["status"]): {
  label: string;
  tone: "solid" | "soft" | "outline" | "green";
} {
  if (status === "paid") return { label: "Paid", tone: "green" };
  if (status === "utang") return { label: "Utang", tone: "solid" };
  if (status === "unpaid") return { label: "Unpaid", tone: "solid" };
  return { label: "Voided", tone: "outline" };
}

export function OwnerSalesTab({
  snapshot,
  stationQuery,
  stationAmpParam,
  subView,
  onSubViewChange,
  onDataChanged,
}: OwnerSalesTabProps) {
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredSales = useMemo(() => {
    const q = query.trim().toLowerCase();
    return snapshot.salesRows.filter((row) => {
      if (channelFilter !== "all" && row.channel !== channelFilter)
        return false;
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (q) {
        const hay =
          `${row.customerLabel} ${row.reference} ${row.paymentMethod} ${row.businessDate}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [snapshot.salesRows, channelFilter, statusFilter, query]);

  const filteredTotal = useMemo(
    () =>
      filteredSales.reduce(
        (sum, r) => (r.status === "voided" ? sum : sum + r.amount),
        0
      ),
    [filteredSales]
  );

  // Only count IDs that still exist in the current snapshot
  const activeSelectedRows = useMemo(
    () => snapshot.salesRows.filter((row) => selectedIds.includes(row.id)),
    [snapshot.salesRows, selectedIds]
  );

  function toggleRow(id: string) {
    setConfirmingDelete(false);
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function toggleAllVisible() {
    setConfirmingDelete(false);
    const visibleIds = filteredSales.map((r) => r.id);
    const allChecked =
      visibleIds.length > 0 &&
      visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds(allChecked ? [] : visibleIds);
  }

  async function handleConfirmBulkDelete() {
    if (activeSelectedRows.length === 0) return;
    setDeleting(true);
    setFeedback(null);
    trackAction({
      module: "pos",
      action: `Confirmed deletion of ${activeSelectedRows.length} sales record(s)`,
      controlLabel: "Confirm Delete",
    });
    try {
      const response = await fetch(`/api/owner/sales${stationQuery}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: activeSelectedRows.map((row) => ({
            id: row.id,
            channel: row.channel,
          })),
        }),
      });

      const payload = (await response.json()) as {
        deletedCount?: number;
        error?: string;
      };
      if (!response.ok) {
        setFeedback({
          tone: "error",
          message: payload.error ?? "Unable to delete selected sales records.",
        });
        return;
      }

      const count = payload.deletedCount ?? activeSelectedRows.length;
      setSelectedIds([]);
      setConfirmingDelete(false);
      setFeedback({
        tone: "success",
        message: `Deleted ${count} selected sales ${count === 1 ? "record" : "records"}.`,
      });
      await onDataChanged();
    } catch {
      setFeedback({
        tone: "error",
        message: "Connection error while deleting selected sales.",
      });
    } finally {
      setDeleting(false);
    }
  }

  function handleCopyDetails(row: OwnerUnifiedSaleRow) {
    const text = `${row.businessDate} · ${channelLabel(row.channel)} · ${row.customerLabel} (${row.reference}) · ${formatPHP(row.amount)} [${row.paymentMethod}]`;
    void navigator.clipboard?.writeText(text);
    setCopiedId(row.id);
    window.setTimeout(() => setCopiedId(null), 1800);
  }

  const exportBase = `/api/owner/export?range=${snapshot.rangeDays}${stationAmpParam}`;

  return (
    <div className="space-y-6">
      {feedback && (
        <NoticeBanner
          tone={feedback.tone}
          message={feedback.message}
          onDismiss={() => setFeedback(null)}
        />
      )}

      <div className="av-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex rounded-full bg-[var(--av-surface-subtle)] p-1">
            <button
              type="button"
              onClick={() => onSubViewChange("sales")}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                subView === "sales"
                  ? "bg-[var(--av-accent)] text-[var(--av-accent-ink)]"
                  : "text-[var(--av-muted)] hover:text-[var(--av-ink)]"
              }`}
            >
              Sales Records ({snapshot.salesRows.length})
            </button>
            <button
              type="button"
              onClick={() => onSubViewChange("shifts")}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                subView === "shifts"
                  ? "bg-[var(--av-accent)] text-[var(--av-accent-ink)]"
                  : "text-[var(--av-muted)] hover:text-[var(--av-ink)]"
              }`}
            >
              Closed Shifts ({snapshot.shiftClosings.length})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`${exportBase}&format=csv`}
              className="av-btn-primary inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </a>
            <a
              href={`${exportBase}&format=txt`}
              className="av-btn-outline inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition"
            >
              Export TXT
            </a>
            <a
              href={`${exportBase}&format=json`}
              className="av-btn-outline inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition"
            >
              JSON
            </a>
          </div>
        </div>

        {subView === "sales" && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--av-border)] pt-5">
            <div className="relative min-w-[220px] flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--av-subtle)]" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search customer, receipt, area, or date..."
                className="av-input w-full rounded-full py-2 pl-10 pr-4 text-xs font-medium"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(["all", "walkin", "delivery", "vendo"] as const).map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => setChannelFilter(ch)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                    channelFilter === ch
                      ? "bg-[var(--av-accent)] text-[var(--av-accent-ink)]"
                      : "border border-[var(--av-border-strong)] bg-[var(--av-surface)] text-[var(--av-ink-secondary)] hover:bg-[var(--av-surface-subtle)]"
                  }`}
                >
                  {ch === "all"
                    ? "All Channels"
                    : ch === "walkin"
                      ? "Walk-in"
                      : ch === "delivery"
                        ? "Deliveries"
                        : "Vendo"}
                </button>
              ))}

              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as StatusFilter)
                }
                aria-label="Filter by payment status"
                className="av-input rounded-full bg-[var(--av-surface)] px-3.5 py-1.5 text-xs font-semibold"
              >
                <option value="all">All Statuses</option>
                <option value="paid">Paid</option>
                <option value="unpaid">Unpaid</option>
                <option value="utang">Utang</option>
                <option value="voided">Voided</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {subView === "sales" ? (
        <div className="av-card p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold tracking-tight text-[var(--av-ink)]">
                All Sales ({filteredSales.length})
              </h2>
              <p className="text-xs text-[var(--av-muted)]">
                Filtered active total:{" "}
                <span className="font-semibold tabular-nums text-[var(--av-ink)]">
                  {formatPHP(filteredTotal)}
                </span>
                {activeSelectedRows.length > 0 && (
                  <> · {activeSelectedRows.length} selected</>
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {copiedId && <StatusChip label="Copied to clipboard" tone="solid" />}

              {activeSelectedRows.length > 0 &&
                (!confirmingDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(true)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/12 px-3.5 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-500/20 dark:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Selected ({activeSelectedRows.length})
                  </button>
                ) : (
                  <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-red-500/40 bg-red-500/10 py-1 pr-1 pl-3">
                    <span className="text-xs font-semibold text-red-700 dark:text-red-300">
                      Delete {activeSelectedRows.length}{" "}
                      {activeSelectedRows.length === 1 ? "record" : "records"}?
                    </span>
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={() => setConfirmingDelete(false)}
                      className="rounded-full border border-[var(--av-border-strong)] bg-[var(--av-surface)] px-3 py-1 text-xs font-semibold text-[var(--av-ink)] transition hover:bg-[var(--av-surface-subtle)] disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={() => void handleConfirmBulkDelete()}
                      className="inline-flex items-center gap-1 rounded-full bg-red-600 px-3.5 py-1 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                    >
                      <Trash2 className="h-3 w-3" />
                      {deleting
                        ? "Deleting..."
                        : `Confirm Delete (${activeSelectedRows.length})`}
                    </button>
                  </div>
                ))}
            </div>
          </div>

          {filteredSales.length === 0 ? (
            <EmptyState
              icon={<FileSpreadsheet className="h-5 w-5" />}
              title="No matching sales records"
              description="Try adjusting your channel filter, status filter, or date range."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-y-2 text-left text-xs">
                <thead>
                  <tr className="text-[11px] font-semibold uppercase tracking-wider text-[var(--av-muted)]">
                    <th className="w-10 px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label="Select all visible rows"
                        checked={
                          filteredSales.length > 0 &&
                          filteredSales.every((r) => selectedIds.includes(r.id))
                        }
                        onChange={toggleAllVisible}
                        className="h-4 w-4 rounded border-[var(--av-border-strong)] accent-[var(--av-accent)]"
                      />
                    </th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Channel</th>
                    <th className="px-3 py-2">Customer / Reference</th>
                    <th className="px-3 py-2 text-right">Gallons</th>
                    <th className="px-3 py-2">Payment</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="w-12 px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSales.map((row) => {
                    const chip = statusChipProps(row.status);
                    const checked = selectedIds.includes(row.id);

                    return (
                      <tr
                        key={row.id}
                        className="bg-[var(--av-surface-subtle)] font-medium text-[var(--av-ink)] transition hover:bg-[var(--av-surface-hover)]"
                      >
                        <td className="rounded-l-2xl px-3 py-3.5">
                          <input
                            type="checkbox"
                            aria-label={`Select ${row.reference}`}
                            checked={checked}
                            onChange={() => toggleRow(row.id)}
                            className="h-4 w-4 rounded border-[var(--av-border-strong)] accent-[var(--av-accent)]"
                          />
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 tabular-nums text-[var(--av-ink-secondary)]">
                          {row.businessDate}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5">
                          <StatusChip
                            label={channelLabel(row.channel)}
                            tone="outline"
                          />
                        </td>
                        <td className="px-3 py-3.5">
                          <div className="font-semibold text-[var(--av-ink)]">
                            {row.customerLabel}
                          </div>
                          <div className="text-[11px] font-normal text-[var(--av-muted)]">
                            {row.reference}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums">
                          {row.gallons > 0 ? row.gallons : "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-[var(--av-ink-secondary)]">
                          {row.paymentMethod}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5">
                          <StatusChip label={chip.label} tone={chip.tone} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-right font-bold tabular-nums">
                          {formatPHP(row.amount)}
                        </td>
                        <td className="rounded-r-2xl px-3 py-3.5 text-right">
                          <RowActionMenu
                            actions={[
                              {
                                label: "Copy Receipt Summary",
                                onClick: () => handleCopyDetails(row),
                              },
                              {
                                label: "Select for Deletion",
                                onClick: () => {
                                  setSelectedIds([row.id]);
                                  setConfirmingDelete(true);
                                },
                              },
                            ]}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="av-card p-6">
          <div className="mb-4">
            <h2 className="text-base font-bold tracking-tight text-[var(--av-ink)]">
              Closed Shift Tallies ({snapshot.shiftClosings.length})
            </h2>
            <p className="text-xs text-[var(--av-muted)]">
              Shift closing history with automatic Over / Short check
            </p>
          </div>

          {snapshot.shiftClosings.length === 0 ? (
            <EmptyState
              icon={<FileSpreadsheet className="h-5 w-5" />}
              title="No closed shifts recorded yet"
              description="Once a shift is closed at the end of the day, the tally appears here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-y-2 text-left text-xs">
                <thead>
                  <tr className="text-[11px] font-semibold uppercase tracking-wider text-[var(--av-muted)]">
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2">Shift</th>
                    <th className="px-4 py-2 text-right">Gross Sales</th>
                    <th className="px-4 py-2 text-right">Expected Cash</th>
                    <th className="px-4 py-2 text-right">Actual Cash</th>
                    <th className="px-4 py-2">Cash Check</th>
                    <th className="px-4 py-2">Orders</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.shiftClosings.map((shift) => {
                    const varianceLabel =
                      shift.variance === 0
                        ? "Exact"
                        : shift.variance > 0
                          ? `Over +${formatPHP(shift.variance)}`
                          : `Short -${formatPHP(Math.abs(shift.variance))}`;

                    return (
                      <tr
                        key={shift.id}
                        className="bg-[var(--av-surface-subtle)] font-medium text-[var(--av-ink)] transition hover:bg-[var(--av-surface-hover)]"
                      >
                        <td className="rounded-l-2xl px-4 py-3.5 font-semibold tabular-nums">
                          {shift.businessDate}
                        </td>
                        <td className="px-4 py-3.5 text-[var(--av-ink-secondary)]">
                          <div>{shift.shiftLabel}</div>
                          {shift.notes && (
                            <div className="text-[11px] text-[var(--av-muted)]">
                              {shift.notes}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right font-bold tabular-nums">
                          {formatPHP(shift.totalGrossSales)}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-[var(--av-ink-secondary)]">
                          {formatPHP(shift.expectedCash)}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-[var(--av-ink)]">
                          {formatPHP(shift.actualCash)}
                        </td>
                        <td className="px-4 py-3.5">
                          <StatusChip
                            label={varianceLabel}
                            tone={
                              shift.variance === 0
                                ? "green"
                                : shift.variance < 0
                                  ? "red"
                                  : "yellow"
                            }
                          />
                        </td>
                        <td className="rounded-r-2xl px-4 py-3.5 text-[var(--av-ink-secondary)] tabular-nums">
                          {shift.walkinCount} walk-in · {shift.deliveryCount} del
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

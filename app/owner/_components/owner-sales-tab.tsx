"use client";

import { Download, FileSpreadsheet, Search } from "lucide-react";
import { useMemo, useState } from "react";
import {
  EmptyState,
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
  subView: OwnerSalesSubView;
  onSubViewChange: (view: OwnerSalesSubView) => void;
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
  tone: "solid" | "soft" | "outline";
} {
  if (status === "paid") return { label: "Paid", tone: "soft" };
  if (status === "utang") return { label: "Utang", tone: "solid" };
  if (status === "unpaid") return { label: "Unpaid", tone: "solid" };
  return { label: "Voided", tone: "outline" };
}

export function OwnerSalesTab({
  snapshot,
  subView,
  onSubViewChange,
}: OwnerSalesTabProps) {
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredSales = useMemo(() => {
    const q = query.trim().toLowerCase();
    return snapshot.salesRows.filter((row) => {
      if (channelFilter !== "all" && row.channel !== channelFilter) return false;
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

  function toggleRow(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function toggleAllVisible() {
    const visibleIds = filteredSales.map((r) => r.id);
    const allChecked =
      visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds(allChecked ? [] : visibleIds);
  }

  function handleCopyDetails(row: OwnerUnifiedSaleRow) {
    const text = `${row.businessDate} · ${channelLabel(row.channel)} · ${row.customerLabel} (${row.reference}) · ${formatPHP(row.amount)} [${row.paymentMethod}]`;
    void navigator.clipboard?.writeText(text);
    setCopiedId(row.id);
    window.setTimeout(() => setCopiedId(null), 1800);
  }

  const exportBase = `/api/owner/export?range=${snapshot.rangeDays}`;

  return (
    <div className="space-y-6">
      {/* Top Controls Card */}
      <div className="av-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Sub-view Switcher */}
          <div className="inline-flex rounded-full bg-[#F2F2F4] p-1">
            <button
              type="button"
              onClick={() => onSubViewChange("sales")}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                subView === "sales"
                  ? "bg-[#111111] text-white"
                  : "text-[#52525B] hover:text-[#111111]"
              }`}
            >
              Sales Ledger ({snapshot.salesRows.length})
            </button>
            <button
              type="button"
              onClick={() => onSubViewChange("shifts")}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                subView === "shifts"
                  ? "bg-[#111111] text-white"
                  : "text-[#52525B] hover:text-[#111111]"
              }`}
            >
              Closed Shifts ({snapshot.shiftClosings.length})
            </button>
          </div>

          {/* Export Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`${exportBase}&format=csv`}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#111111] px-4 py-2 text-xs font-semibold text-white transition hover:bg-black/85"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </a>
            <a
              href={`${exportBase}&format=txt`}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#D4D4D8] bg-white px-4 py-2 text-xs font-semibold text-[#111111] transition hover:bg-[#F4F4F6]"
            >
              Export TXT
            </a>
            <a
              href={`${exportBase}&format=json`}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#D4D4D8] bg-white px-4 py-2 text-xs font-semibold text-[#111111] transition hover:bg-[#F4F4F6]"
            >
              JSON
            </a>
          </div>
        </div>

        {subView === "sales" && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#ECECEF] pt-5">
            <div className="relative min-w-[220px] flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A1A1AA]" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search customer, receipt, area, or date..."
                className="w-full rounded-full border border-[#E4E4E7] bg-[#F8F8FA] py-2 pl-10 pr-4 text-xs font-medium text-[#111111] placeholder:text-[#A1A1AA] focus:border-[#111111] focus:bg-white focus:outline-none"
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
                      ? "bg-[#111111] text-white"
                      : "border border-[#E4E4E7] bg-white text-[#52525B] hover:bg-[#F4F4F6]"
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
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                aria-label="Filter by payment status"
                className="rounded-full border border-[#E4E4E7] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#111111] focus:border-[#111111] focus:outline-none"
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

      {/* Table Section */}
      {subView === "sales" ? (
        <div className="av-card p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold tracking-tight text-[#111111]">
                Unified Sales ({filteredSales.length})
              </h2>
              <p className="text-xs text-[#71717A]">
                Filtered active total:{" "}
                <span className="font-semibold tabular-nums text-[#111111]">
                  {formatPHP(filteredTotal)}
                </span>
                {selectedIds.length > 0 && (
                  <> · {selectedIds.length} selected</>
                )}
              </p>
            </div>
            {copiedId && <StatusChip label="Copied to clipboard" tone="solid" />}
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
                  <tr className="text-[11px] font-semibold uppercase tracking-wider text-[#71717A]">
                    <th className="w-10 px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label="Select all visible rows"
                        checked={
                          filteredSales.length > 0 &&
                          filteredSales.every((r) => selectedIds.includes(r.id))
                        }
                        onChange={toggleAllVisible}
                        className="h-4 w-4 rounded border-[#D4D4D8] accent-[#111111]"
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
                        className="bg-[#F8F8FA] font-medium text-[#111111] transition hover:bg-[#EFEFF2]"
                      >
                        <td className="rounded-l-2xl px-3 py-3.5">
                          <input
                            type="checkbox"
                            aria-label={`Select ${row.reference}`}
                            checked={checked}
                            onChange={() => toggleRow(row.id)}
                            className="h-4 w-4 rounded border-[#D4D4D8] accent-[#111111]"
                          />
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 tabular-nums text-[#52525B]">
                          {row.businessDate}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5">
                          <StatusChip
                            label={channelLabel(row.channel)}
                            tone="outline"
                          />
                        </td>
                        <td className="px-3 py-3.5">
                          <div className="font-semibold text-[#111111]">
                            {row.customerLabel}
                          </div>
                          <div className="text-[11px] font-normal text-[#71717A]">
                            {row.reference}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums">
                          {row.gallons > 0 ? row.gallons : "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-[#52525B]">
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
            <h2 className="text-base font-bold tracking-tight text-[#111111]">
              Closed Shift Tallies ({snapshot.shiftClosings.length})
            </h2>
            <p className="text-xs text-[#71717A]">
              Cashier shift closing history with automatic Over / Short verification
            </p>
          </div>

          {snapshot.shiftClosings.length === 0 ? (
            <EmptyState
              icon={<FileSpreadsheet className="h-5 w-5" />}
              title="No closed shifts recorded yet"
              description="Once a cashier closes a shift at the end of the day, the verified tally appears here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-y-2 text-left text-xs">
                <thead>
                  <tr className="text-[11px] font-semibold uppercase tracking-wider text-[#71717A]">
                    <th className="px-4 py-2">Business Date</th>
                    <th className="px-4 py-2">Shift</th>
                    <th className="px-4 py-2 text-right">Gross Sales</th>
                    <th className="px-4 py-2 text-right">Expected Cash</th>
                    <th className="px-4 py-2 text-right">Actual Cash</th>
                    <th className="px-4 py-2">Variance</th>
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
                        className="bg-[#F8F8FA] font-medium text-[#111111] transition hover:bg-[#EFEFF2]"
                      >
                        <td className="rounded-l-2xl px-4 py-3.5 font-semibold tabular-nums">
                          {shift.businessDate}
                        </td>
                        <td className="px-4 py-3.5 text-[#52525B]">
                          <div>{shift.shiftLabel}</div>
                          {shift.notes && (
                            <div className="text-[11px] text-[#71717A]">
                              {shift.notes}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right font-bold tabular-nums">
                          {formatPHP(shift.totalGrossSales)}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-[#52525B]">
                          {formatPHP(shift.expectedCash)}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-[#111111]">
                          {formatPHP(shift.actualCash)}
                        </td>
                        <td className="px-4 py-3.5">
                          <StatusChip
                            label={varianceLabel}
                            tone={shift.variance < 0 ? "solid" : "soft"}
                          />
                        </td>
                        <td className="rounded-r-2xl px-4 py-3.5 text-[#52525B] tabular-nums">
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

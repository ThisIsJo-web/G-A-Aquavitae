"use client";

import { Search, Users, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import {
  EmptyState,
  StatusChip,
} from "@/app/_components/ui/monochrome-controls";
import { QuickStatCard } from "@/app/_components/ui/quick-stat-card";
import {
  formatPHP,
  formatRangeShortLabel,
  type OwnerDashboardSnapshot,
} from "./types";

export type OwnerCustomersView = "customers" | "unpaid";

interface OwnerCustomersTabProps {
  snapshot: OwnerDashboardSnapshot;
  activeView: OwnerCustomersView;
  onViewChange: (view: OwnerCustomersView) => void;
}

export function OwnerCustomersTab({
  snapshot,
  activeView,
  onViewChange,
}: OwnerCustomersTabProps) {
  const [query, setQuery] = useState("");

  const filteredCustomers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return snapshot.customers;
    return snapshot.customers.filter((c) =>
      `${c.customerName} ${c.area} ${c.phone ?? ""}`.toLowerCase().includes(q)
    );
  }, [snapshot.customers, query]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <QuickStatCard
          highlighted
          label="Regular Customers"
          value={snapshot.customers.length}
          sublabel="Active delivery accounts"
          icon={<Users className="h-5 w-5" />}
        />
        <QuickStatCard
          label="Open Unpaid Bills"
          value={formatPHP(snapshot.quickStats.unpaidBalances)}
          sublabel={`${snapshot.unpaidBills.length} unpaid deliveries & walk-in utang`}
          icon={<Wallet className="h-5 w-5" />}
        />
      </div>

      <div className="av-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex flex-wrap rounded-full bg-[var(--av-surface-subtle)] p-1">
            <button
              type="button"
              onClick={() => onViewChange("customers")}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                activeView === "customers"
                  ? "bg-[var(--av-accent)] text-[var(--av-accent-ink)]"
                  : "text-[var(--av-muted)] hover:text-[var(--av-ink)]"
              }`}
            >
              Regular Customers ({snapshot.customers.length})
            </button>
            <button
              type="button"
              onClick={() => onViewChange("unpaid")}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                activeView === "unpaid"
                  ? "bg-[var(--av-accent)] text-[var(--av-accent-ink)]"
                  : "text-[var(--av-muted)] hover:text-[var(--av-ink)]"
              }`}
            >
              Unpaid &amp; Utang ({snapshot.unpaidBills.length})
            </button>
          </div>

          {activeView === "customers" && (
            <div className="relative min-w-[220px] flex-1 max-w-xs">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--av-subtle)]" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search customer or area..."
                className="av-input w-full rounded-full py-2 pl-10 pr-4 text-xs font-medium"
              />
            </div>
          )}
        </div>

        {activeView === "customers" && (
          <div className="mt-5">
            {filteredCustomers.length === 0 ? (
              <EmptyState
                icon={<Users className="h-5 w-5" />}
                title="No regular delivery customers yet"
                description="Regular delivery customers added in Deliveries will appear here with their area price and gallon balance."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-y-2 text-left text-xs">
                  <thead>
                    <tr className="text-[11px] font-semibold uppercase tracking-wider text-[var(--av-muted)]">
                      <th className="px-4 py-2">Customer</th>
                      <th className="px-4 py-2">Area</th>
                      <th className="px-4 py-2 text-right">Area Price</th>
                      <th className="px-4 py-2 text-right">
                        Deliveries ({formatRangeShortLabel(snapshot.rangeDays)})
                      </th>
                      <th className="px-4 py-2">Gallons Held</th>
                      <th className="px-4 py-2 text-right">Unpaid Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCustomers.map((c) => (
                      <tr
                        key={c.id}
                        className="bg-[var(--av-surface-subtle)] font-medium text-[var(--av-ink)] transition hover:bg-[var(--av-surface-hover)]"
                      >
                        <td className="rounded-l-2xl px-4 py-3.5">
                          <div className="font-semibold text-[var(--av-ink)]">
                            {c.customerName}
                          </div>
                          {c.phone && (
                            <div className="text-[11px] font-normal text-[var(--av-muted)]">
                              {c.phone}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-[var(--av-ink-secondary)]">
                          {c.area}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums">
                          {formatPHP(c.defaultUnitPrice)}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-[var(--av-ink-secondary)]">
                          {c.totalDeliveriesInRange}
                        </td>
                        <td className="px-4 py-3.5">
                          <StatusChip
                            label={`${c.gallonsHeld} gal held`}
                            tone={c.gallonsHeld > 0 ? "solid" : "soft"}
                          />
                        </td>
                        <td className="rounded-r-2xl px-4 py-3.5 text-right font-bold tabular-nums">
                          {c.unpaidTotal > 0 ? (
                            <StatusChip
                              label={formatPHP(c.unpaidTotal)}
                              tone="solid"
                            />
                          ) : (
                            <span className="font-normal text-[var(--av-muted)]">
                              Paid
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeView === "unpaid" && (
          <div className="mt-5">
            {snapshot.unpaidBills.length === 0 ? (
              <EmptyState
                icon={<Wallet className="h-5 w-5" />}
                title="No unpaid bills or utang"
                description="All deliveries and walk-in orders are settled."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-y-2 text-left text-xs">
                  <thead>
                    <tr className="text-[11px] font-semibold uppercase tracking-wider text-[var(--av-muted)]">
                      <th className="px-4 py-2">Date</th>
                      <th className="px-4 py-2">Source</th>
                      <th className="px-4 py-2">Customer</th>
                      <th className="px-4 py-2">Details</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.unpaidBills.map((bill) => (
                      <tr
                        key={`${bill.source}-${bill.id}`}
                        className="bg-[var(--av-surface-subtle)] font-medium text-[var(--av-ink)] transition hover:bg-[var(--av-surface-hover)]"
                      >
                        <td className="rounded-l-2xl px-4 py-3.5 tabular-nums text-[var(--av-ink-secondary)]">
                          {bill.businessDate}
                        </td>
                        <td className="px-4 py-3.5">
                          <StatusChip
                            label={
                              bill.source === "delivery"
                                ? "Delivery"
                                : "Walk-in Utang"
                            }
                            tone="outline"
                          />
                        </td>
                        <td className="px-4 py-3.5 font-semibold">
                          {bill.customerName}
                        </td>
                        <td className="px-4 py-3.5 text-[var(--av-ink-secondary)]">
                          {bill.detail}
                        </td>
                        <td className="px-4 py-3.5">
                          <StatusChip
                            label={
                              bill.source === "delivery" ? "Unpaid" : "Utang"
                            }
                            tone="solid"
                          />
                        </td>
                        <td className="rounded-r-2xl px-4 py-3.5 text-right font-bold tabular-nums">
                          {formatPHP(bill.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

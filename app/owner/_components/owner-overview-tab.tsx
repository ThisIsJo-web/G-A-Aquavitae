"use client";

import {
  AlertCircle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  Droplets,
  Package,
  Receipt,
  Wallet,
} from "lucide-react";
import { MonochromeBarChart } from "@/app/_components/ui/monochrome-bar-chart";
import { EmptyState, StatusChip } from "@/app/_components/ui/monochrome-controls";
import { QuickStatCard } from "@/app/_components/ui/quick-stat-card";
import {
  formatPHP,
  formatRangeDescription,
  formatRangeLabel,
  type OwnerDashboardSnapshot,
  type OwnerPendingItem,
} from "./types";

interface OwnerOverviewTabProps {
  snapshot: OwnerDashboardSnapshot;
  onSelectPending: (item: OwnerPendingItem) => void;
}

export function OwnerOverviewTab({
  snapshot,
  onSelectPending,
}: OwnerOverviewTabProps) {
  const { quickStats, pendingItems } = snapshot;
  const periodLabel = formatRangeLabel(snapshot.rangeDays);
  const periodDesc = formatRangeDescription(snapshot.rangeDays);

  return (
    <div className="min-w-0 space-y-5 sm:space-y-6">
      {/* Top Row: Quick Stats (1 col mobile · 2x2 tablet/laptop · 4 col wide desktop) */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 sm:gap-4 min-[1400px]:grid-cols-4">
        <QuickStatCard
          highlighted
          label={`Total Sales (${periodLabel})`}
          value={formatPHP(quickStats.totalSales)}
          sublabel={`Walk-in ${formatPHP(quickStats.walkinSales)} · Delivery ${formatPHP(quickStats.deliverySales)}`}
          icon={<Banknote className="h-5 w-5" />}
        />

        <QuickStatCard
          label={`Gallons Sold (${periodLabel})`}
          value={quickStats.gallonsSold.toLocaleString("en-PH")}
          sublabel={`${quickStats.walkinGallons} walk-in · ${quickStats.deliveryGallons} delivery`}
          icon={<Droplets className="h-5 w-5" />}
        />

        <QuickStatCard
          label="Unpaid Balances"
          value={formatPHP(quickStats.unpaidBalances)}
          sublabel={`${quickStats.unpaidCount} open ${quickStats.unpaidCount === 1 ? "bill" : "bills"} (Deliveries + Utang)`}
          icon={<Wallet className="h-5 w-5" />}
        />

        <QuickStatCard
          label={`Expenses (${periodLabel})`}
          value={formatPHP(quickStats.totalExpenses)}
          sublabel={`Net Profit: ${formatPHP(quickStats.netProfit)}`}
          icon={<Receipt className="h-5 w-5" />}
        />
      </div>

      {/* Two-Series Bar Charts */}
      <div className="grid grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-2">
        <MonochromeBarChart
          title="Sales vs. Expenses"
          subtitle={`${periodLabel} · ${snapshot.startDate} to ${snapshot.endDate}`}
          primaryLabel="Sales"
          secondaryLabel="Expenses"
          data={snapshot.salesVsExpensesChart}
          formatValue={formatPHP}
        />

        <MonochromeBarChart
          title="Walk-in vs. Delivery Gallons"
          subtitle={`Container volume across ${periodDesc}`}
          primaryLabel="Walk-in"
          secondaryLabel="Deliveries"
          data={snapshot.gallonsChart}
          formatValue={(v) => `${v.toLocaleString("en-PH")} gal`}
        />
      </div>

      {/* Bottom Row: Pending Attention + Revenue & Container Snapshot */}
      <div className="grid grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-12">
        {/* Pending Attention Feed */}
        <section className="av-card min-w-0 p-4 sm:p-6 xl:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-bold tracking-tight text-[var(--av-ink)]">
                Pending Attention
              </h2>
              <p className="mt-0.5 text-xs text-[var(--av-muted)]">
                Unpaid bills, low stock, borrowed gallons, and shift shortages
              </p>
            </div>
            <StatusChip
              label={
                pendingItems.length === 0
                  ? "All Clear"
                  : `${pendingItems.length} ${pendingItems.length === 1 ? "Item" : "Items"}`
              }
              tone={pendingItems.length === 0 ? "green" : "solid"}
              dot
            />
          </div>

          <div className="mt-4 space-y-2.5 sm:mt-5">
            {pendingItems.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 className="h-5 w-5" />}
                title="Everything looks healthy"
                description="No unpaid balances, low stock alerts, unreturned borrowed gallons, or shift shortages right now."
              />
            ) : (
              pendingItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectPending(item)}
                  className="group flex w-full flex-col gap-3 rounded-2xl bg-[var(--av-surface-subtle)] px-4 py-3.5 text-left transition hover:bg-[var(--av-surface-hover)] sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--av-surface)] text-[var(--av-ink)] ring-1 ring-[var(--av-border)] sm:h-10 sm:w-10">
                      <AlertCircle className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--av-ink)] sm:truncate">
                        {item.title}
                      </p>
                      <p className="text-xs text-[var(--av-muted)] sm:truncate">
                        {item.detail}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center justify-between gap-3 pl-12 sm:justify-end sm:pl-0">
                    <StatusChip label={item.metric} tone="solid" />
                    <ArrowRight className="h-4 w-4 text-[var(--av-muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--av-ink)]" />
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        {/* Station Summary Card */}
        <section className="av-card flex min-w-0 flex-col justify-between p-4 sm:p-6 xl:col-span-5">
          <div>
            <h2 className="text-base font-bold tracking-tight text-[var(--av-ink)]">
              Channel &amp; Container Summary
            </h2>
            <p className="mt-0.5 text-xs text-[var(--av-muted)]">
              Quick breakdown of station revenue and containers
            </p>

            <div className="mt-4 space-y-2.5 sm:mt-5">
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--av-surface-subtle)] px-4 py-3 text-xs sm:text-sm">
                <span className="font-medium text-[var(--av-ink-secondary)]">
                  Walk-in POS
                </span>
                <span className="shrink-0 font-bold tabular-nums text-[var(--av-ink)]">
                  {formatPHP(quickStats.walkinSales)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--av-surface-subtle)] px-4 py-3 text-xs sm:text-sm">
                <span className="font-medium text-[var(--av-ink-secondary)]">
                  Deliveries
                </span>
                <span className="shrink-0 font-bold tabular-nums text-[var(--av-ink)]">
                  {formatPHP(quickStats.deliverySales)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--av-surface-subtle)] px-4 py-3 text-xs sm:text-sm">
                <span className="font-medium text-[var(--av-ink-secondary)]">
                  Vendo Machine
                </span>
                <span className="shrink-0 font-bold tabular-nums text-[var(--av-ink)]">
                  {formatPHP(quickStats.vendoSales)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--av-accent)] px-4 py-3 text-xs text-[var(--av-accent-ink)] sm:text-sm">
                <span className="font-semibold">
                  Net Profit ({periodLabel})
                </span>
                <span className="shrink-0 font-bold tabular-nums">
                  {formatPHP(quickStats.netProfit)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 border-t border-[var(--av-border)] pt-4 min-[400px]:grid-cols-2">
            <div className="min-w-0 rounded-2xl bg-[var(--av-surface-subtle)] p-3.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--av-muted)]">
                <Package className="h-3.5 w-3.5 shrink-0 text-[var(--av-ink)]" />
                <span className="truncate">On Hand</span>
              </div>
              <div className="mt-1.5 text-xl font-bold tabular-nums text-[var(--av-ink)]">
                {quickStats.onHandGallons}
              </div>
              <div className="text-[11px] text-[var(--av-muted)]">
                Station gallons
              </div>
            </div>

            <div className="min-w-0 rounded-2xl bg-[var(--av-surface-subtle)] p-3.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--av-muted)]">
                <Droplets className="h-3.5 w-3.5 shrink-0 text-[var(--av-ink)]" />
                <span className="truncate">Borrowed Out</span>
              </div>
              <div className="mt-1.5 text-xl font-bold tabular-nums text-[var(--av-ink)]">
                {quickStats.borrowedOutGallons}
              </div>
              <div className="text-[11px] text-[var(--av-muted)]">
                With customers
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

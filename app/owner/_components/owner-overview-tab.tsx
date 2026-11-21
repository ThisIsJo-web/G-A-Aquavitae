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
import { formatPHP, type OwnerDashboardSnapshot, type OwnerPendingItem } from "./types";

interface OwnerOverviewTabProps {
  snapshot: OwnerDashboardSnapshot;
  onSelectPending: (item: OwnerPendingItem) => void;
}

export function OwnerOverviewTab({
  snapshot,
  onSelectPending,
}: OwnerOverviewTabProps) {
  const { quickStats, pendingItems } = snapshot;

  return (
    <div className="space-y-6">
      {/* Top Row: Quick Stats (1 Highlighted Solid Black Card) */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <QuickStatCard
          highlighted
          label={`Total Sales (${snapshot.rangeDays}d)`}
          value={formatPHP(quickStats.totalSales)}
          sublabel={`Walk-in ${formatPHP(quickStats.walkinSales)} · Delivery ${formatPHP(quickStats.deliverySales)}`}
          icon={<Banknote className="h-5 w-5" />}
        />

        <QuickStatCard
          label={`Gallons Sold (${snapshot.rangeDays}d)`}
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
          label={`Expenses (${snapshot.rangeDays}d)`}
          value={formatPHP(quickStats.totalExpenses)}
          sublabel={`Net Profit: ${formatPHP(quickStats.netProfit)}`}
          icon={<Receipt className="h-5 w-5" />}
        />
      </div>

      {/* Two-Series Monochrome Bar Charts */}
      <div className="grid gap-6 xl:grid-cols-2">
        <MonochromeBarChart
          title="Sales vs. Expenses"
          subtitle={`${snapshot.startDate} to ${snapshot.endDate} · Hover any bar for totals`}
          primaryLabel="Sales"
          secondaryLabel="Expenses"
          data={snapshot.salesVsExpensesChart}
          formatValue={formatPHP}
        />

        <MonochromeBarChart
          title="Walk-in vs. Delivery Gallons"
          subtitle={`Container volume across the last ${snapshot.rangeDays} days`}
          primaryLabel="Walk-in"
          secondaryLabel="Deliveries"
          data={snapshot.gallonsChart}
          formatValue={(v) => `${v.toLocaleString("en-PH")} gal`}
        />
      </div>

      {/* Bottom Row: Pending Attention + Revenue & Container Snapshot */}
      <div className="grid gap-6 xl:grid-cols-12">
        {/* Pending Attention Feed */}
        <section className="av-card p-6 xl:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold tracking-tight text-[#111111]">
                Pending Attention
              </h2>
              <p className="mt-0.5 text-xs text-[#71717A]">
                Unpaid bills, low stock, borrowed gallons, and shift shortages
              </p>
            </div>
            <StatusChip
              label={
                pendingItems.length === 0
                  ? "All Clear"
                  : `${pendingItems.length} ${pendingItems.length === 1 ? "Item" : "Items"}`
              }
              tone={pendingItems.length === 0 ? "soft" : "solid"}
              dot
            />
          </div>

          <div className="mt-5 space-y-2.5">
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
                  className="group flex w-full items-center justify-between gap-4 rounded-2xl bg-[#F8F8FA] px-4 py-3.5 text-left transition hover:bg-[#EFEFF2]"
                >
                  <div className="flex min-w-0 items-center gap-3.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#111111] ring-1 ring-[#E8E8EC]">
                      <AlertCircle className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#111111]">
                        {item.title}
                      </p>
                      <p className="truncate text-xs text-[#71717A]">
                        {item.detail}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <StatusChip label={item.metric} tone="solid" />
                    <ArrowRight className="h-4 w-4 text-[#71717A] transition group-hover:translate-x-0.5 group-hover:text-[#111111]" />
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        {/* Station Summary Card */}
        <section className="av-card flex flex-col justify-between p-6 xl:col-span-5">
          <div>
            <h2 className="text-base font-bold tracking-tight text-[#111111]">
              Channel &amp; Container Summary
            </h2>
            <p className="mt-0.5 text-xs text-[#71717A]">
              Quick breakdown of station revenue and containers
            </p>

            <div className="mt-5 space-y-2.5">
              <div className="flex items-center justify-between rounded-2xl bg-[#F8F8FA] px-4 py-3 text-sm">
                <span className="font-medium text-[#52525B]">Walk-in POS</span>
                <span className="font-bold tabular-nums text-[#111111]">
                  {formatPHP(quickStats.walkinSales)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-[#F8F8FA] px-4 py-3 text-sm">
                <span className="font-medium text-[#52525B]">Deliveries</span>
                <span className="font-bold tabular-nums text-[#111111]">
                  {formatPHP(quickStats.deliverySales)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-[#F8F8FA] px-4 py-3 text-sm">
                <span className="font-medium text-[#52525B]">Vendo Machine</span>
                <span className="font-bold tabular-nums text-[#111111]">
                  {formatPHP(quickStats.vendoSales)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-[#111111] px-4 py-3 text-sm text-white">
                <span className="font-semibold">Net Profit ({snapshot.rangeDays}d)</span>
                <span className="font-bold tabular-nums">
                  {formatPHP(quickStats.netProfit)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-[#ECECEF] pt-4">
            <div className="rounded-2xl bg-[#F8F8FA] p-3.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#71717A]">
                <Package className="h-3.5 w-3.5 text-[#111111]" />
                On Hand
              </div>
              <div className="mt-1.5 text-xl font-bold tabular-nums text-[#111111]">
                {quickStats.onHandGallons}
              </div>
              <div className="text-[11px] text-[#71717A]">Station gallons</div>
            </div>

            <div className="rounded-2xl bg-[#F8F8FA] p-3.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#71717A]">
                <Droplets className="h-3.5 w-3.5 text-[#111111]" />
                Borrowed Out
              </div>
              <div className="mt-1.5 text-xl font-bold tabular-nums text-[#111111]">
                {quickStats.borrowedOutGallons}
              </div>
              <div className="text-[11px] text-[#71717A]">With customers</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

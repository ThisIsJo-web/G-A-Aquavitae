"use client";

import { ArrowLeftRight, Package, Search, Users, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import {
  EmptyState,
  NoticeBanner,
  StatusChip,
} from "@/app/_components/ui/monochrome-controls";
import { QuickStatCard } from "@/app/_components/ui/quick-stat-card";
import { formatPHP, type OwnerDashboardSnapshot } from "./types";

export type OwnerCustomersView = "stock" | "customers" | "unpaid" | "borrowed";

interface OwnerCustomersTabProps {
  snapshot: OwnerDashboardSnapshot;
  activeView: OwnerCustomersView;
  onViewChange: (view: OwnerCustomersView) => void;
}

function formatMovementLabel(movementType: string): string {
  switch (movementType) {
    case "restock":
      return "Restock";
    case "walkin_out":
      return "Walk-in Sale";
    case "delivery_out":
      return "Delivery Out";
    case "borrow_out":
      return "Borrowed Out";
    case "borrow_return":
      return "Empty Returned";
    case "damaged":
      return "Damaged";
    case "adjustment":
      return "Stock Adjustment";
    default:
      return movementType;
  }
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
      {/* Quick Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <QuickStatCard
          highlighted
          label="Gallons On Hand"
          value={snapshot.quickStats.onHandGallons}
          sublabel={`${snapshot.quickStats.borrowedOutGallons} borrowed out · ${snapshot.quickStats.damagedGallons} damaged`}
          icon={<Package className="h-5 w-5" />}
        />
        <QuickStatCard
          label="Regular Customers"
          value={snapshot.customers.length}
          sublabel="Active delivery suki accounts"
          icon={<Users className="h-5 w-5" />}
        />
        <QuickStatCard
          label="Open Unpaid Bills"
          value={formatPHP(snapshot.quickStats.unpaidBalances)}
          sublabel={`${snapshot.unpaidBills.length} unpaid deliveries & walk-in utang`}
          icon={<Wallet className="h-5 w-5" />}
        />
      </div>

      <NoticeBanner
        tone="info"
        message="Read-only Owner oversight view. Gallon restocks, payment collections, and borrowed returns are recorded by Cashier accounts."
      />

      {/* View Switcher & Search */}
      <div className="av-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex flex-wrap rounded-full bg-[#F2F2F4] p-1">
            <button
              type="button"
              onClick={() => onViewChange("stock")}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                activeView === "stock"
                  ? "bg-[#111111] text-white"
                  : "text-[#52525B] hover:text-[#111111]"
              }`}
            >
              Station Stock ({snapshot.quickStats.onHandGallons} on hand)
            </button>
            <button
              type="button"
              onClick={() => onViewChange("customers")}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                activeView === "customers"
                  ? "bg-[#111111] text-white"
                  : "text-[#52525B] hover:text-[#111111]"
              }`}
            >
              Regular Customers ({snapshot.customers.length})
            </button>
            <button
              type="button"
              onClick={() => onViewChange("unpaid")}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                activeView === "unpaid"
                  ? "bg-[#111111] text-white"
                  : "text-[#52525B] hover:text-[#111111]"
              }`}
            >
              Unpaid &amp; Utang ({snapshot.unpaidBills.length})
            </button>
            <button
              type="button"
              onClick={() => onViewChange("borrowed")}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                activeView === "borrowed"
                  ? "bg-[#111111] text-white"
                  : "text-[#52525B] hover:text-[#111111]"
              }`}
            >
              Borrowed Gallons ({snapshot.borrowedItems.length})
            </button>
          </div>

          {activeView === "customers" && (
            <div className="relative min-w-[220px] flex-1 max-w-xs">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A1A1AA]" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search customer or area..."
                className="w-full rounded-full border border-[#E4E4E7] bg-[#F8F8FA] py-2 pl-10 pr-4 text-xs font-medium text-[#111111] placeholder:text-[#A1A1AA] focus:border-[#111111] focus:bg-white focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Sub-tab 0: Station Stock & Movement Logs */}
        {activeView === "stock" && (
          <div className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-[#F8F8FA] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#71717A]">
                  On-Hand Station Gallons
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-2xl font-bold tabular-nums text-[#111111]">
                    {snapshot.quickStats.onHandGallons}
                  </span>
                  <StatusChip
                    label={
                      snapshot.quickStats.onHandGallons < 20
                        ? "Low Stock (< 20)"
                        : "Healthy Stock"
                    }
                    tone={
                      snapshot.quickStats.onHandGallons < 20 ? "solid" : "soft"
                    }
                    dot
                  />
                </div>
                <p className="mt-1 text-[11px] text-[#71717A]">
                  Ask your cashier to log a Gallon Restock under Gallon
                  Inventory when containers are stocked.
                </p>
              </div>

              <div className="rounded-2xl bg-[#F8F8FA] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#71717A]">
                  Borrowed Out (With Customers)
                </div>
                <div className="mt-1.5 text-2xl font-bold tabular-nums text-[#111111]">
                  {snapshot.quickStats.borrowedOutGallons}
                </div>
                <p className="mt-1 text-[11px] text-[#71717A]">
                  Gallons currently held by customers awaiting return.
                </p>
              </div>

              <div className="rounded-2xl bg-[#F8F8FA] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#71717A]">
                  Damaged / Retired
                </div>
                <div className="mt-1.5 text-2xl font-bold tabular-nums text-[#111111]">
                  {snapshot.quickStats.damagedGallons}
                </div>
                <p className="mt-1 text-[11px] text-[#71717A]">
                  Containers flagged damaged by the station.
                </p>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[#71717A]">
                Recent Gallon Movements ({snapshot.stockLogs.length})
              </h3>
              {snapshot.stockLogs.length === 0 ? (
                <EmptyState
                  icon={<ArrowLeftRight className="h-5 w-5" />}
                  title="No gallon movements recorded yet"
                  description="Once your cashier logs a restock, filled gallon sale, or delivery, movements appear here."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-separate border-spacing-y-2 text-left text-xs">
                    <thead>
                      <tr className="text-[11px] font-semibold uppercase tracking-wider text-[#71717A]">
                        <th className="px-4 py-2">Date</th>
                        <th className="px-4 py-2">Activity</th>
                        <th className="px-4 py-2 text-right">Change</th>
                        <th className="px-4 py-2 text-right">Balance After</th>
                        <th className="px-4 py-2">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.stockLogs.map((log) => (
                        <tr
                          key={log.id}
                          className="bg-[#F8F8FA] font-medium text-[#111111] transition hover:bg-[#EFEFF2]"
                        >
                          <td className="rounded-l-2xl whitespace-nowrap px-4 py-3 tabular-nums text-[#52525B]">
                            {log.businessDate}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <StatusChip
                              label={formatMovementLabel(log.movementType)}
                              tone="outline"
                            />
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-bold tabular-nums">
                            {log.quantityDelta > 0
                              ? `+${log.quantityDelta}`
                              : log.quantityDelta}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-[#52525B]">
                            {log.balanceAfter}
                          </td>
                          <td className="rounded-r-2xl px-4 py-3 text-[#71717A]">
                            {log.notes || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sub-tab 1: Regular Delivery Customers */}
        {activeView === "customers" && (
          <div className="mt-5">
            {filteredCustomers.length === 0 ? (
              <EmptyState
                icon={<Users className="h-5 w-5" />}
                title="No regular delivery customers yet"
                description="Regular delivery customers registered by your cashier will appear here with their area price and gallon balance."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-y-2 text-left text-xs">
                  <thead>
                    <tr className="text-[11px] font-semibold uppercase tracking-wider text-[#71717A]">
                      <th className="px-4 py-2">Customer</th>
                      <th className="px-4 py-2">Area</th>
                      <th className="px-4 py-2 text-right">Area Price</th>
                      <th className="px-4 py-2 text-right">
                        Deliveries ({snapshot.rangeDays}d)
                      </th>
                      <th className="px-4 py-2">Gallons Held</th>
                      <th className="px-4 py-2 text-right">Unpaid Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCustomers.map((c) => (
                      <tr
                        key={c.id}
                        className="bg-[#F8F8FA] font-medium text-[#111111] transition hover:bg-[#EFEFF2]"
                      >
                        <td className="rounded-l-2xl px-4 py-3.5">
                          <div className="font-semibold text-[#111111]">
                            {c.customerName}
                          </div>
                          {c.phone && (
                            <div className="text-[11px] font-normal text-[#71717A]">
                              {c.phone}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-[#52525B]">{c.area}</td>
                        <td className="px-4 py-3.5 text-right tabular-nums">
                          {formatPHP(c.defaultUnitPrice)}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-[#52525B]">
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
                            <span className="font-normal text-[#71717A]">
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

        {/* Sub-tab 2: Unpaid Bills & Walk-in Utang */}
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
                    <tr className="text-[11px] font-semibold uppercase tracking-wider text-[#71717A]">
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
                        className="bg-[#F8F8FA] font-medium text-[#111111] transition hover:bg-[#EFEFF2]"
                      >
                        <td className="rounded-l-2xl px-4 py-3.5 tabular-nums text-[#52525B]">
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
                        <td className="px-4 py-3.5 text-[#52525B]">
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

        {/* Sub-tab 3: Borrowed Gallons */}
        {activeView === "borrowed" && (
          <div className="mt-5">
            {snapshot.borrowedItems.length === 0 ? (
              <EmptyState
                icon={<Package className="h-5 w-5" />}
                title="No borrowed gallons outstanding"
                description="All customer-borrowed containers have been returned to the station."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-y-2 text-left text-xs">
                  <thead>
                    <tr className="text-[11px] font-semibold uppercase tracking-wider text-[#71717A]">
                      <th className="px-4 py-2">Date</th>
                      <th className="px-4 py-2">Customer</th>
                      <th className="px-4 py-2 text-right">Borrowed</th>
                      <th className="px-4 py-2 text-right">Returned</th>
                      <th className="px-4 py-2 text-right">Balance Out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.borrowedItems.map((item) => (
                      <tr
                        key={item.id}
                        className="bg-[#F8F8FA] font-medium text-[#111111] transition hover:bg-[#EFEFF2]"
                      >
                        <td className="rounded-l-2xl px-4 py-3.5 tabular-nums text-[#52525B]">
                          {item.borrowedDate}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="font-semibold">
                            {item.customerName}
                          </div>
                          {(item.customerAddress || item.customerPhone) && (
                            <div className="text-[11px] font-normal text-[#71717A]">
                              {[item.customerAddress, item.customerPhone]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums">
                          {item.qtyBorrowed}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-[#52525B]">
                          {item.qtyReturned}
                        </td>
                        <td className="rounded-r-2xl px-4 py-3.5 text-right">
                          <StatusChip
                            label={`${item.remaining} gal out`}
                            tone="solid"
                          />
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

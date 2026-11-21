"use client";

import { AlertCircle, ArrowLeftRight, Package } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  EmptyState,
  NoticeBanner,
  RowActionMenu,
  StatusChip,
} from "@/app/_components/ui/monochrome-controls";
import { QuickStatCard } from "@/app/_components/ui/quick-stat-card";
import {
  formatPHP,
  type BorrowedGallonDTO,
  type InventoryOverviewDTO,
} from "./types";

interface InventoryTabProps {
  data: InventoryOverviewDTO;
  businessDate: string;
  onDataChanged: () => Promise<void> | void;
}

const MOVEMENT_LABELS: Record<string, string> = {
  restock: "Added Stock",
  walkin_out: "Walk-in Sold",
  delivery_out: "Delivery",
  borrow_out: "Borrowed Out",
  borrow_return: "Returned",
  damaged: "Damaged",
  adjustment: "Adjusted",
};

export function InventoryTab({
  data,
  businessDate,
  onDataChanged,
}: InventoryTabProps) {
  const [movementType, setMovementType] = useState<
    "restock" | "damaged" | "adjustment"
  >("restock");
  const [stockQty, setStockQty] = useState("10");
  const [stockNotes, setStockNotes] = useState("");
  const [savingStock, setSavingStock] = useState(false);

  const [borrowCustomer, setBorrowCustomer] = useState("");
  const [borrowPhone, setBorrowPhone] = useState("");
  const [borrowAddress, setBorrowAddress] = useState("");
  const [borrowQty, setBorrowQty] = useState("1");
  const [borrowDeposit, setBorrowDeposit] = useState("0");
  const [borrowNotes, setBorrowNotes] = useState("");
  const [savingBorrow, setSavingBorrow] = useState(false);

  const [returnInputs, setReturnInputs] = useState<Record<string, string>>({});
  const [returningId, setReturningId] = useState<string | null>(null);
  const [borrowFilter, setBorrowFilter] = useState<"active" | "all">("active");
  const [selectedBorrowed, setSelectedBorrowed] = useState<Set<string>>(
    new Set()
  );
  const [error, setError] = useState<string | null>(null);

  async function handleStockMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingStock(true);
    setError(null);
    try {
      const res = await fetch("/api/cashier/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          movementType,
          quantity: Number(stockQty),
          notes: stockNotes || undefined,
          businessDate,
        }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error ?? "Could not update gallon stock.");
        return;
      }
      setStockNotes("");
      await Promise.resolve(onDataChanged());
    } finally {
      setSavingStock(false);
    }
  }

  async function handleAddBorrowed(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingBorrow(true);
    setError(null);
    try {
      const res = await fetch("/api/cashier/borrowed-gallons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: borrowCustomer,
          customerPhone: borrowPhone || undefined,
          customerAddress: borrowAddress || undefined,
          qtyBorrowed: Number(borrowQty),
          depositAmount: Number(borrowDeposit) || 0,
          notes: borrowNotes || undefined,
          businessDate,
        }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error ?? "Could not save borrowed gallons.");
        return;
      }
      setBorrowCustomer("");
      setBorrowPhone("");
      setBorrowAddress("");
      setBorrowQty("1");
      setBorrowDeposit("0");
      setBorrowNotes("");
      await Promise.resolve(onDataChanged());
    } finally {
      setSavingBorrow(false);
    }
  }

  async function handleReturnGallons(
    record: BorrowedGallonDTO,
    customQty?: number
  ) {
    const remaining = record.qty_borrowed - record.qty_returned;
    const qty = customQty ?? Number(returnInputs[record.id] ?? remaining);
    if (!Number.isFinite(qty) || qty <= 0) return;

    setReturningId(record.id);
    setError(null);
    try {
      const res = await fetch(
        `/api/cashier/borrowed-gallons/${record.id}/return`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ qtyReturned: qty, businessDate }),
        }
      );
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error ?? "Could not mark gallons returned.");
        return;
      }
      await Promise.resolve(onDataChanged());
    } finally {
      setReturningId(null);
    }
  }

  function toggleSelectBorrow(id: string) {
    setSelectedBorrowed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const visibleBorrowed =
    borrowFilter === "active"
      ? data.borrowedGallons.filter((b) => b.status !== "returned")
      : data.borrowedGallons;

  return (
    <div className="space-y-6">
      {error && (
        <NoticeBanner
          tone="error"
          message={error}
          onDismiss={() => setError(null)}
        />
      )}

      {/* Quick Stats Row (1 Solid Black Card) */}
      <div className="grid gap-4 sm:grid-cols-3">
        <QuickStatCard
          highlighted
          label="Gallons On-Hand"
          value={data.summary.totalOnHand}
          sublabel="Available station gallons"
          icon={<Package className="h-5 w-5" />}
        />
        <QuickStatCard
          label="Borrowed Gallons Out"
          value={data.summary.currentlyBorrowedOut}
          sublabel={`${data.summary.activeBorrowers} customer(s) holding gallons`}
          icon={<ArrowLeftRight className="h-5 w-5" />}
        />
        <QuickStatCard
          label="Damaged Gallons"
          value={data.summary.totalDamaged}
          sublabel="Marked damaged / unusable"
          icon={<AlertCircle className="h-5 w-5" />}
        />
      </div>

      {/* Forms */}
      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={handleStockMovement} className="av-card space-y-4 p-6">
          <div>
            <h2 className="text-base font-bold text-[#111111]">
              Update Daily Gallon Stock
            </h2>
            <p className="text-xs font-normal text-[#71717A]">
              Add gallons to stock, mark damaged gallons, or adjust your count.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#111111]">
                Action
              </label>
              <select
                value={movementType}
                onChange={(e) =>
                  setMovementType(
                    e.target.value as "restock" | "damaged" | "adjustment"
                  )
                }
                className="w-full rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-3.5 py-2.5 text-xs font-semibold text-[#111111]"
              >
                <option value="restock">Add Stock (+)</option>
                <option value="damaged">Mark Damaged (-)</option>
                <option value="adjustment">Adjust Count (+/-)</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#111111]">
                Gallons
              </label>
              <input
                type="number"
                required
                value={stockQty}
                onChange={(e) => setStockQty(e.target.value)}
                className="w-full rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-3.5 py-2.5 text-sm font-bold text-[#111111] tabular-nums"
              />
            </div>
          </div>

          <input
            type="text"
            value={stockNotes}
            onChange={(e) => setStockNotes(e.target.value)}
            placeholder="Note (e.g. Morning gallon count)"
            className="w-full rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-4 py-2.5 text-xs text-[#111111]"
          />

          <button
            type="submit"
            disabled={savingStock || data.schemaMissing}
            className="w-full rounded-full bg-[#111111] px-5 py-3 text-xs font-semibold text-white transition hover:bg-black/85 disabled:opacity-40"
          >
            {savingStock ? "Saving..." : "Update Stock"}
          </button>
        </form>

        <form onSubmit={handleAddBorrowed} className="av-card space-y-4 p-6">
          <div>
            <h2 className="text-base font-bold text-[#111111]">
              Record Borrowed Gallons
            </h2>
            <p className="text-xs font-normal text-[#71717A]">
              Track customers borrowing station gallons. Stock replenishes on
              return.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              required
              value={borrowCustomer}
              onChange={(e) => setBorrowCustomer(e.target.value)}
              placeholder="Customer name"
              className="rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-3.5 py-2.5 text-xs text-[#111111]"
            />
            <input
              type="text"
              value={borrowPhone}
              onChange={(e) => setBorrowPhone(e.target.value)}
              placeholder="Phone (optional)"
              className="rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-3.5 py-2.5 text-xs text-[#111111]"
            />
          </div>

          <input
            type="text"
            value={borrowAddress}
            onChange={(e) => setBorrowAddress(e.target.value)}
            placeholder="Area / Address (e.g. Tagum)"
            className="w-full rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-3.5 py-2.5 text-xs text-[#111111]"
          />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#111111]">
                Gallons Borrowed
              </label>
              <input
                type="number"
                min={1}
                required
                value={borrowQty}
                onChange={(e) => setBorrowQty(e.target.value)}
                className="w-full rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-3.5 py-2 text-sm font-bold text-[#111111] tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#111111]">
                Deposit (₱, Optional)
              </label>
              <input
                type="number"
                min={0}
                step="1"
                value={borrowDeposit}
                onChange={(e) => setBorrowDeposit(e.target.value)}
                className="w-full rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-3.5 py-2 text-sm font-bold text-[#111111] tabular-nums"
              />
            </div>
          </div>

          <input
            type="text"
            value={borrowNotes}
            onChange={(e) => setBorrowNotes(e.target.value)}
            placeholder="Note (optional)"
            className="w-full rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-3.5 py-2.5 text-xs text-[#111111]"
          />

          <button
            type="submit"
            disabled={savingBorrow || data.schemaMissing}
            className="w-full rounded-full border border-[#D4D4D8] bg-white px-5 py-3 text-xs font-semibold text-[#111111] transition hover:border-[#111111] hover:bg-[#111111] hover:text-white disabled:opacity-40"
          >
            {savingBorrow ? "Saving..." : "Save Borrowed Gallons"}
          </button>
        </form>
      </div>

      {/* Borrowed Gallons Rounded-Row Table */}
      <div className="av-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[#111111]">
              Borrowed Gallons ({visibleBorrowed.length})
            </h3>
            <p className="text-xs font-normal text-[#71717A]">
              Borrowed, returned, and remaining balance per customer.
            </p>
          </div>
          <div className="inline-flex rounded-full bg-[#F2F2F4] p-1 text-xs">
            <button
              type="button"
              onClick={() => setBorrowFilter("active")}
              className={`rounded-full px-3.5 py-1.5 font-semibold transition ${
                borrowFilter === "active"
                  ? "bg-[#111111] text-white"
                  : "text-[#52525B]"
              }`}
            >
              Unreturned
            </button>
            <button
              type="button"
              onClick={() => setBorrowFilter("all")}
              className={`rounded-full px-3.5 py-1.5 font-semibold transition ${
                borrowFilter === "all"
                  ? "bg-[#111111] text-white"
                  : "text-[#52525B]"
              }`}
            >
              All History
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          {visibleBorrowed.length === 0 ? (
            <EmptyState
              icon={<Package className="h-4 w-4" />}
              title="No borrowed gallons"
              description="All station containers are accounted for."
            />
          ) : (
            <table className="w-full border-separate border-spacing-y-2 text-left text-xs">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-[#71717A]">
                  <th className="w-8 pb-1 pl-3" />
                  <th className="px-3 pb-1">Customer</th>
                  <th className="px-3 pb-1">Balance</th>
                  <th className="px-3 pb-1">Deposit</th>
                  <th className="px-3 pb-1">Status</th>
                  <th className="pb-1 pr-3 text-right">Return</th>
                </tr>
              </thead>
              <tbody>
                {visibleBorrowed.map((b) => {
                  const remaining = b.qty_borrowed - b.qty_returned;
                  return (
                    <tr
                      key={b.id}
                      className="rounded-2xl bg-[#F7F7F9] font-medium transition hover:bg-[#F0F0F3]"
                    >
                      <td className="rounded-l-2xl py-3 pl-3">
                        <input
                          type="checkbox"
                          checked={selectedBorrowed.has(b.id)}
                          onChange={() => toggleSelectBorrow(b.id)}
                          aria-label={`Select ${b.customer_name}`}
                          className="h-4 w-4 rounded border-[#D4D4D8] accent-[#111111]"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-bold text-[#111111]">
                          {b.customer_name}
                        </div>
                        <div className="text-[11px] font-normal text-[#71717A]">
                          {[b.customer_address, b.customer_phone, b.borrowed_date]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </td>
                      <td className="px-3 py-3 tabular-nums">
                        <span className="font-bold text-[#111111]">
                          {b.qty_returned}/{b.qty_borrowed} returned
                        </span>
                        {remaining > 0 && (
                          <span className="ml-2 text-[#52525B]">
                            ({remaining} out)
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-[#52525B] tabular-nums">
                        {b.deposit_amount > 0
                          ? formatPHP(b.deposit_amount)
                          : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <StatusChip
                          label={
                            b.status === "returned"
                              ? "Returned"
                              : b.status === "partial"
                                ? "Partial"
                                : "Borrowed"
                          }
                          tone={
                            b.status === "returned"
                              ? "outline"
                              : b.status === "partial"
                                ? "soft"
                                : "solid"
                          }
                          dot
                        />
                      </td>
                      <td className="rounded-r-2xl py-3 pr-3 text-right">
                        {remaining > 0 ? (
                          <div className="inline-flex items-center gap-1.5">
                            <input
                              type="number"
                              min={1}
                              max={remaining}
                              value={returnInputs[b.id] ?? String(remaining)}
                              onChange={(e) =>
                                setReturnInputs((prev) => ({
                                  ...prev,
                                  [b.id]: e.target.value,
                                }))
                              }
                              aria-label={`Return qty for ${b.customer_name}`}
                              className="w-14 rounded-full border border-[#D4D4D8] bg-white px-2 py-1 text-center text-xs font-bold text-[#111111] tabular-nums"
                            />
                            <button
                              type="button"
                              disabled={returningId === b.id}
                              onClick={() => void handleReturnGallons(b)}
                              className="rounded-full bg-[#111111] px-3 py-1 text-[11px] font-semibold text-white hover:bg-black/85 disabled:opacity-40"
                            >
                              {returningId === b.id ? "..." : "Return"}
                            </button>
                            <RowActionMenu
                              actions={[
                                {
                                  label: `Return All (${remaining})`,
                                  disabled: returningId === b.id,
                                  onClick: () =>
                                    void handleReturnGallons(b, remaining),
                                },
                              ]}
                            />
                          </div>
                        ) : (
                          <span className="text-[11px] text-[#A1A1AA]">
                            Completed
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Today's Stock Changes */}
      <div className="av-card p-6">
        <h3 className="text-base font-bold text-[#111111]">
          Today&apos;s Stock Changes ({data.logs.length})
        </h3>
        <div className="mt-4 overflow-x-auto">
          {data.logs.length === 0 ? (
            <EmptyState title={`No stock changes for ${businessDate}`} />
          ) : (
            <table className="w-full border-separate border-spacing-y-2 text-left text-xs">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-[#71717A]">
                  <th className="px-3 pb-1">Time</th>
                  <th className="px-3 pb-1">Activity</th>
                  <th className="px-3 pb-1">Change</th>
                  <th className="px-3 pb-1">Stock Left</th>
                  <th className="px-3 pb-1">Note</th>
                </tr>
              </thead>
              <tbody>
                {data.logs.map((log) => (
                  <tr
                    key={log.id}
                    className="rounded-2xl bg-[#F7F7F9] font-medium"
                  >
                    <td className="rounded-l-2xl px-3 py-2.5 text-[11px] text-[#71717A] tabular-nums">
                      {new Date(log.created_at).toLocaleTimeString()}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusChip
                        label={
                          MOVEMENT_LABELS[log.movement_type] ??
                          log.movement_type
                        }
                        tone="soft"
                      />
                    </td>
                    <td className="px-3 py-2.5 font-bold text-[#111111] tabular-nums">
                      {log.quantity_delta >= 0
                        ? `+${log.quantity_delta}`
                        : log.quantity_delta}
                    </td>
                    <td className="px-3 py-2.5 font-bold text-[#111111] tabular-nums">
                      {log.balance_after}
                    </td>
                    <td className="rounded-r-2xl px-3 py-2.5 text-[#71717A]">
                      {log.notes || "—"}
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

"use client";

import { AlertCircle, ArrowLeftRight, Package, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  handleDecimalKeyDown,
  handleIntegerKeyDown,
  handlePhoneKeyDown,
  sanitizeDecimalInput,
  sanitizeIntegerInput,
  sanitizePhoneInput,
} from "@/app/_components/ui/input-validation";
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
} from "@/app/cashier/_components/types";

interface OwnerInventoryTabProps {
  stationQuery: string;
  todayDate: string;
  refreshSignal: number;
  onDataChanged: () => Promise<void>;
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

export function OwnerInventoryTab({
  stationQuery,
  todayDate,
  refreshSignal,
  onDataChanged,
}: OwnerInventoryTabProps) {
  const [data, setData] = useState<InventoryOverviewDTO | null>(null);
  const [loading, setLoading] = useState(true);

  const [movementType, setMovementType] = useState<
    "restock" | "damaged" | "adjustment"
  >("restock");
  const [stockQty, setStockQty] = useState("");
  const [stockNotes, setStockNotes] = useState("");
  const [savingStock, setSavingStock] = useState(false);

  const [borrowCustomer, setBorrowCustomer] = useState("");
  const [borrowPhone, setBorrowPhone] = useState("");
  const [borrowAddress, setBorrowAddress] = useState("");
  const [borrowQty, setBorrowQty] = useState("");
  const [borrowDeposit, setBorrowDeposit] = useState("");
  const [borrowNotes, setBorrowNotes] = useState("");
  const [savingBorrow, setSavingBorrow] = useState(false);

  const [returnInputs, setReturnInputs] = useState<Record<string, string>>({});
  const [returningId, setReturningId] = useState<string | null>(null);
  const [borrowFilter, setBorrowFilter] = useState<"active" | "all">("active");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadInventory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/owner/inventory${stationQuery}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const payload = (await res.json()) as InventoryOverviewDTO;
      setData(payload);
    } finally {
      setLoading(false);
    }
  }, [stationQuery]);

  useEffect(() => {
    let active = true;
    fetch(`/api/owner/inventory${stationQuery}`, { cache: "no-store" })
      .then(async (res) => {
        if (!active || !res.ok) return;
        const payload = (await res.json()) as InventoryOverviewDTO;
        if (active) setData(payload);
      })
      .catch(() => {
        // Ignore transient background refresh errors
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [stationQuery, refreshSignal]);

  async function handleStockMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const qty = Math.trunc(Number(stockQty));
    if (!stockQty.trim() || !Number.isFinite(qty) || qty === 0) {
      setError("Enter a valid whole number of gallons.");
      return;
    }

    setSavingStock(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/owner/inventory${stationQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          movementType,
          quantity: qty,
          notes: stockNotes.trim() || undefined,
          businessDate: todayDate,
        }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error ?? "Could not update gallon stock.");
        return;
      }
      setStockQty("");
      setStockNotes("");
      setSuccess("Station gallon stock updated.");
      await Promise.all([loadInventory(), onDataChanged()]);
    } finally {
      setSavingStock(false);
    }
  }

  async function handleAddBorrowed(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const qty = Math.floor(Number(borrowQty));
    if (!borrowCustomer.trim() || !Number.isFinite(qty) || qty <= 0) {
      setError("Enter customer name and gallons borrowed (at least 1).");
      return;
    }

    setSavingBorrow(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/owner/borrowed-gallons${stationQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: borrowCustomer.trim(),
          customerPhone: borrowPhone.trim() || undefined,
          customerAddress: borrowAddress.trim() || undefined,
          qtyBorrowed: qty,
          depositAmount: borrowDeposit ? Number(borrowDeposit) : 0,
          notes: borrowNotes.trim() || undefined,
          businessDate: todayDate,
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
      setBorrowQty("");
      setBorrowDeposit("");
      setBorrowNotes("");
      setSuccess("Borrowed gallon record saved.");
      await Promise.all([loadInventory(), onDataChanged()]);
    } finally {
      setSavingBorrow(false);
    }
  }

  async function handleReturnGallons(
    record: BorrowedGallonDTO,
    customQty?: number
  ) {
    const remaining = record.qty_borrowed - record.qty_returned;
    const rawVal = returnInputs[record.id];
    const qty =
      customQty ?? (rawVal && rawVal.trim() ? Number(rawVal) : remaining);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Enter a valid number of returned gallons.");
      return;
    }

    setReturningId(record.id);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(
        `/api/owner/borrowed-gallons/${record.id}/return${stationQuery}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ qtyReturned: qty, businessDate: todayDate }),
        }
      );
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error ?? "Could not mark gallons returned.");
        return;
      }
      setReturnInputs((prev) => ({ ...prev, [record.id]: "" }));
      setSuccess(`Marked ${qty} gallon(s) returned by ${record.customer_name}.`);
      await Promise.all([loadInventory(), onDataChanged()]);
    } finally {
      setReturningId(null);
    }
  }

  if (!data && loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-[24px] border border-[var(--av-border)] bg-[var(--av-surface)]"
            />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-[24px] border border-[var(--av-border)] bg-[var(--av-surface)]" />
      </div>
    );
  }

  const summary = data?.summary ?? {
    totalOnHand: 0,
    totalDamaged: 0,
    currentlyBorrowedOut: 0,
    activeBorrowers: 0,
  };
  const borrowedGallons = data?.borrowedGallons ?? [];
  const logs = data?.logs ?? [];
  const visibleBorrowed =
    borrowFilter === "active"
      ? borrowedGallons.filter((b) => b.status !== "returned")
      : borrowedGallons;

  return (
    <div className="space-y-6">
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

      {/* Quick Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <QuickStatCard
          highlighted
          label="Gallons On-Hand"
          value={summary.totalOnHand}
          sublabel="Available station containers"
          icon={<Package className="h-5 w-5" />}
        />
        <QuickStatCard
          label="Borrowed Gallons Out"
          value={summary.currentlyBorrowedOut}
          sublabel={`${summary.activeBorrowers} customer(s) holding gallons`}
          icon={<ArrowLeftRight className="h-5 w-5" />}
        />
        <QuickStatCard
          label="Damaged Gallons"
          value={summary.totalDamaged}
          sublabel="Marked damaged / retired"
          icon={<AlertCircle className="h-5 w-5" />}
        />
      </div>

      {/* Forms */}
      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={handleStockMovement} className="av-card space-y-4 p-6">
          <div>
            <h2 className="text-base font-bold text-[var(--av-ink)]">
              Update Station Gallon Stock
            </h2>
            <p className="text-xs font-normal text-[var(--av-muted)]">
              Add new gallons to stock, mark damaged gallons, or adjust your
              count.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--av-ink)]">
                Action
              </label>
              <select
                value={movementType}
                onChange={(e) => {
                  setMovementType(
                    e.target.value as "restock" | "damaged" | "adjustment"
                  );
                  setStockQty("");
                }}
                className="av-input w-full rounded-2xl px-3.5 py-2.5 text-xs font-semibold"
              >
                <option value="restock">Add Stock (+)</option>
                <option value="damaged">Mark Damaged (-)</option>
                <option value="adjustment">Adjust Count (+/-)</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--av-ink)]">
                Gallons
              </label>
              <input
                type="text"
                inputMode="numeric"
                required
                value={stockQty}
                onKeyDown={(e) =>
                  handleIntegerKeyDown(e, movementType === "adjustment")
                }
                onChange={(e) =>
                  setStockQty(
                    sanitizeIntegerInput(e.target.value, {
                      allowNegative: movementType === "adjustment",
                    })
                  )
                }
                placeholder={
                  movementType === "adjustment" ? "e.g. 5 or -5" : "e.g. 10"
                }
                className="av-input w-full rounded-2xl px-3.5 py-2.5 text-sm font-bold tabular-nums"
              />
            </div>
          </div>

          <input
            type="text"
            value={stockNotes}
            onChange={(e) => setStockNotes(e.target.value)}
            placeholder="Note (e.g. Morning gallon count)"
            className="av-input w-full rounded-2xl px-4 py-2.5 text-xs"
          />

          <button
            type="submit"
            disabled={savingStock || Boolean(data?.schemaMissing)}
            className="av-btn-primary w-full rounded-full px-5 py-3 text-xs font-semibold transition disabled:opacity-40"
          >
            {savingStock ? "Saving..." : "Update Stock"}
          </button>
        </form>

        <form onSubmit={handleAddBorrowed} className="av-card space-y-4 p-6">
          <div>
            <h2 className="text-base font-bold text-[var(--av-ink)]">
              Record Borrowed Gallons
            </h2>
            <p className="text-xs font-normal text-[var(--av-muted)]">
              Track customers borrowing station containers. Stock replenishes
              automatically when returned.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              required
              value={borrowCustomer}
              onChange={(e) => setBorrowCustomer(e.target.value)}
              placeholder="Customer name"
              className="av-input rounded-2xl px-3.5 py-2.5 text-xs"
            />
            <input
              type="tel"
              inputMode="tel"
              value={borrowPhone}
              onKeyDown={handlePhoneKeyDown}
              onChange={(e) =>
                setBorrowPhone(sanitizePhoneInput(e.target.value))
              }
              placeholder="Phone (optional)"
              className="av-input rounded-2xl px-3.5 py-2.5 text-xs"
            />
          </div>

          <input
            type="text"
            value={borrowAddress}
            onChange={(e) => setBorrowAddress(e.target.value)}
            placeholder="Area / Address (e.g. Tagum)"
            className="av-input w-full rounded-2xl px-3.5 py-2.5 text-xs"
          />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--av-ink)]">
                Gallons Borrowed
              </label>
              <input
                type="text"
                inputMode="numeric"
                required
                value={borrowQty}
                onKeyDown={(e) => handleIntegerKeyDown(e, false)}
                onChange={(e) =>
                  setBorrowQty(sanitizeIntegerInput(e.target.value))
                }
                placeholder="e.g. 2"
                className="av-input w-full rounded-2xl px-3.5 py-2 text-sm font-bold tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--av-ink)]">
                Deposit (₱, Optional)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={borrowDeposit}
                onKeyDown={handleDecimalKeyDown}
                onChange={(e) =>
                  setBorrowDeposit(sanitizeDecimalInput(e.target.value))
                }
                placeholder="e.g. 150"
                className="av-input w-full rounded-2xl px-3.5 py-2 text-sm font-bold tabular-nums"
              />
            </div>
          </div>

          <input
            type="text"
            value={borrowNotes}
            onChange={(e) => setBorrowNotes(e.target.value)}
            placeholder="Note (optional)"
            className="av-input w-full rounded-2xl px-3.5 py-2.5 text-xs"
          />

          <button
            type="submit"
            disabled={savingBorrow || Boolean(data?.schemaMissing)}
            className="av-btn-outline w-full rounded-full px-5 py-3 text-xs font-semibold transition disabled:opacity-40"
          >
            {savingBorrow ? "Saving..." : "Save Borrowed Gallons"}
          </button>
        </form>
      </div>

      {/* Borrowed Gallons Table */}
      <div className="av-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[var(--av-ink)]">
              Borrowed Gallons ({visibleBorrowed.length})
            </h3>
            <p className="text-xs font-normal text-[var(--av-muted)]">
              Borrowed, returned, and remaining containers per customer.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-full bg-[var(--av-surface-subtle)] p-1 text-xs">
              <button
                type="button"
                onClick={() => setBorrowFilter("active")}
                className={`rounded-full px-3.5 py-1.5 font-semibold transition ${
                  borrowFilter === "active"
                    ? "bg-[var(--av-accent)] text-[var(--av-accent-ink)]"
                    : "text-[var(--av-muted)]"
                }`}
              >
                Unreturned
              </button>
              <button
                type="button"
                onClick={() => setBorrowFilter("all")}
                className={`rounded-full px-3.5 py-1.5 font-semibold transition ${
                  borrowFilter === "all"
                    ? "bg-[var(--av-accent)] text-[var(--av-accent-ink)]"
                    : "text-[var(--av-muted)]"
                }`}
              >
                All History
              </button>
            </div>
            <button
              type="button"
              onClick={() => void loadInventory()}
              aria-label="Reload inventory"
              className="av-btn-outline flex h-8 w-8 items-center justify-center rounded-full"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              />
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
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-[var(--av-muted)]">
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
                      className="rounded-2xl bg-[var(--av-surface-subtle)] font-medium transition hover:bg-[var(--av-surface-hover)]"
                    >
                      <td className="rounded-l-2xl px-3 py-3">
                        <div className="font-bold text-[var(--av-ink)]">
                          {b.customer_name}
                        </div>
                        <div className="text-[11px] font-normal text-[var(--av-muted)]">
                          {[b.customer_address, b.customer_phone, b.borrowed_date]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </td>
                      <td className="px-3 py-3 tabular-nums">
                        <span className="font-bold text-[var(--av-ink)]">
                          {b.qty_returned}/{b.qty_borrowed} returned
                        </span>
                        {remaining > 0 && (
                          <span className="ml-2 text-[var(--av-muted)]">
                            ({remaining} out)
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-[var(--av-ink-secondary)] tabular-nums">
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
                              ? "green"
                              : b.status === "partial"
                                ? "yellow"
                                : "solid"
                          }
                          dot
                        />
                      </td>
                      <td className="rounded-r-2xl py-3 pr-3 text-right">
                        {remaining > 0 ? (
                          <div className="inline-flex items-center gap-1.5">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={returnInputs[b.id] ?? ""}
                              onKeyDown={(e) => handleIntegerKeyDown(e, false)}
                              onChange={(e) =>
                                setReturnInputs((prev) => ({
                                  ...prev,
                                  [b.id]: sanitizeIntegerInput(e.target.value),
                                }))
                              }
                              placeholder={String(remaining)}
                              aria-label={`Return qty for ${b.customer_name}`}
                              className="av-input w-14 rounded-full bg-[var(--av-surface)] px-2 py-1 text-center text-xs font-bold tabular-nums"
                            />
                            <button
                              type="button"
                              disabled={returningId === b.id}
                              onClick={() => void handleReturnGallons(b)}
                              className="av-btn-primary rounded-full px-3 py-1 text-[11px] font-semibold disabled:opacity-40"
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
                          <span className="text-[11px] text-[var(--av-muted)]">
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

      {/* Recent Stock Changes */}
      <div className="av-card p-6">
        <h3 className="text-base font-bold text-[var(--av-ink)]">
          Recent Stock Changes ({logs.length})
        </h3>
        <div className="mt-4 overflow-x-auto">
          {logs.length === 0 ? (
            <EmptyState title="No stock changes recorded yet" />
          ) : (
            <table className="w-full border-separate border-spacing-y-2 text-left text-xs">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-[var(--av-muted)]">
                  <th className="px-3 pb-1">Date &amp; Time</th>
                  <th className="px-3 pb-1">Activity</th>
                  <th className="px-3 pb-1">Change</th>
                  <th className="px-3 pb-1">Stock Left</th>
                  <th className="px-3 pb-1">Note</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="rounded-2xl bg-[var(--av-surface-subtle)] font-medium"
                  >
                    <td className="rounded-l-2xl px-3 py-2.5 text-[11px] text-[var(--av-muted)] tabular-nums">
                      {log.business_date} ·{" "}
                      {new Date(log.created_at).toLocaleTimeString()}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusChip
                        label={
                          MOVEMENT_LABELS[log.movement_type] ??
                          log.movement_type
                        }
                        tone="outline"
                      />
                    </td>
                    <td className="px-3 py-2.5 font-bold text-[var(--av-ink)] tabular-nums">
                      {log.quantity_delta >= 0
                        ? `+${log.quantity_delta}`
                        : log.quantity_delta}
                    </td>
                    <td className="px-3 py-2.5 font-bold text-[var(--av-ink)] tabular-nums">
                      {log.balance_after}
                    </td>
                    <td className="rounded-r-2xl px-3 py-2.5 text-[var(--av-muted)]">
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

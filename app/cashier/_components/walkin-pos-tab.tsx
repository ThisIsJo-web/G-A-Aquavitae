"use client";

import {
  Ban,
  Banknote,
  Clock,
  CreditCard,
  Droplets,
  Minus,
  Plus,
  Receipt,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { trackAction } from "@/app/_components/activity-tracker";
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
import {
  formatPHP,
  type DeliveryCustomerDTO,
  type PosOverviewDTO,
  type PosPaymentMethod,
  type PosProductDTO,
  type PosSaleDTO,
} from "./types";

interface WalkInPosTabProps {
  pos: PosOverviewDTO;
  customers: DeliveryCustomerDTO[];
  businessDate: string;
  stationQuery: string;
  isElevatedActor: boolean;
  onDataChanged: () => Promise<void> | void;
  onRequestCorrection: (target: CorrectionModalTarget) => void;
}

interface CartLine {
  product: PosProductDTO;
  quantity: number;
}

const PAYMENT_LABELS: Record<PosPaymentMethod, string> = {
  cash: "Cash",
  gcash: "GCash",
  utang: "Utang",
  bank: "Bank",
};

export function WalkInPosTab({
  pos,
  customers,
  businessDate,
  stationQuery,
  isElevatedActor,
  onDataChanged,
  onRequestCorrection,
}: WalkInPosTabProps) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>("cash");
  const [discountInput, setDiscountInput] = useState("");
  const [tenderedInput, setTenderedInput] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastReceipt, setLastReceipt] = useState<PosSaleDTO | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [selectedSales, setSelectedSales] = useState<string[]>([]);
  const [pendingBulkAction, setPendingBulkAction] = useState<
    "void" | "delete" | null
  >(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkSuccess, setBulkSuccess] = useState<string | null>(null);

  const activeSelectedSales = useMemo(
    () => pos.sales.filter((s) => selectedSales.includes(s.id)),
    [pos.sales, selectedSales]
  );
  const activeVoidableSales = useMemo(
    () => activeSelectedSales.filter((s) => s.status === "completed"),
    [activeSelectedSales]
  );

  const activeCustomers = customers.filter((c) => c.is_active);
  const selectedCustomer = activeCustomers.find(
    (c) => c.id === selectedCustomerId
  );

  function getQtyInCart(productId: string): number {
    return cart.find((l) => l.product.id === productId)?.quantity ?? 0;
  }

  function adjustQty(product: PosProductDTO, delta: number) {
    setError(null);
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (!existing) {
        return delta > 0 ? [...prev, { product, quantity: delta }] : prev;
      }
      const nextQty = existing.quantity + delta;
      if (nextQty <= 0) {
        return prev.filter((l) => l.product.id !== product.id);
      }
      return prev.map((l) =>
        l.product.id === product.id ? { ...l, quantity: nextQty } : l
      );
    });
  }

  const subtotal = cart.reduce(
    (sum, line) => sum + line.product.unit_price * line.quantity,
    0
  );
  const discount = Math.max(0, Number(discountInput) || 0);
  const totalAmount = Math.max(0, subtotal - discount);
  const amountTendered =
    paymentMethod === "cash"
      ? tenderedInput === ""
        ? totalAmount
        : Number(tenderedInput) || 0
      : paymentMethod === "utang"
        ? 0
        : totalAmount;
  const changeAmount =
    paymentMethod === "cash" ? Math.max(0, amountTendered - totalAmount) : 0;

  async function handleCheckout() {
    if (cart.length === 0) {
      setError("Tap + on an item to start an order.");
      return;
    }
    if (paymentMethod === "utang" && !customerName.trim()) {
      setError("Enter or select the customer name for Utang sales.");
      return;
    }
    if (paymentMethod === "cash" && amountTendered < totalAmount) {
      setError(
        `Cash received (${formatPHP(amountTendered)}) is less than total (${formatPHP(totalAmount)}).`
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/cashier/pos${stationQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((l) => ({
            productId: l.product.id,
            quantity: l.quantity,
          })),
          paymentMethod,
          discount,
          amountTendered,
          customerName: customerName.trim() || undefined,
          notes: notes.trim() || undefined,
          businessDate,
        }),
      });

      const data = (await res.json()) as {
        sale?: PosSaleDTO;
        error?: string;
      };

      if (!res.ok || !data.sale) {
        setError(data.error ?? "Could not save sale. Please try again.");
        return;
      }

      setLastReceipt(data.sale);
      setCart([]);
      setDiscountInput("");
      setTenderedInput("");
      setSelectedCustomerId("");
      setCustomerName("");
      setNotes("");
      await Promise.resolve(onDataChanged());
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVoidSale(saleId: string) {
    setVoidingId(saleId);
    setError(null);
    try {
      const res = await fetch(`/api/cashier/pos/${saleId}${stationQuery}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "void",
          reason: isElevatedActor ? "Voided by owner/admin" : "Voided by cashier",
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Could not void sale.");
        return;
      }
      await Promise.resolve(onDataChanged());
    } finally {
      setVoidingId(null);
    }
  }

  function toggleSelectSale(id: string) {
    setPendingBulkAction(null);
    setSelectedSales((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function toggleAllSales() {
    setPendingBulkAction(null);
    const allIds = pos.sales.map((s) => s.id);
    const allChecked =
      allIds.length > 0 && allIds.every((id) => selectedSales.includes(id));
    setSelectedSales(allChecked ? [] : allIds);
  }

  async function handleConfirmBulkAction() {
    if (!pendingBulkAction || activeSelectedSales.length === 0) return;
    setBulkBusy(true);
    setError(null);
    setBulkSuccess(null);

    try {
      if (pendingBulkAction === "delete") {
        trackAction({
          module: "pos",
          action: `Deleted ${activeSelectedSales.length} Walk-in sale(s)`,
          controlLabel: "Confirm Delete",
        });
        const res = await fetch(`/api/owner/sales${stationQuery}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: activeSelectedSales.map((s) => ({
              id: `pos-${s.id}`,
              channel: "walkin",
            })),
          }),
        });
        const payload = (await res.json()) as {
          deletedCount?: number;
          error?: string;
        };
        if (!res.ok) {
          setError(payload.error ?? "Could not delete selected walk-in sales.");
          return;
        }
        const count = payload.deletedCount ?? activeSelectedSales.length;
        setSelectedSales([]);
        setPendingBulkAction(null);
        setBulkSuccess(
          `Deleted ${count} selected walk-in ${count === 1 ? "sale" : "sales"}.`
        );
        await Promise.resolve(onDataChanged());
        return;
      }

      // Bulk Void selected completed sales
      if (activeVoidableSales.length === 0) {
        setPendingBulkAction(null);
        return;
      }
      trackAction({
        module: "pos",
        action: `Voided ${activeVoidableSales.length} Walk-in sale(s)`,
        controlLabel: "Confirm Void",
      });
      let voidedCount = 0;
      let firstErr: string | null = null;
      for (const sale of activeVoidableSales) {
        const res = await fetch(`/api/cashier/pos/${sale.id}${stationQuery}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "void",
            reason: isElevatedActor
              ? "Bulk voided by owner/admin"
              : "Bulk voided by cashier",
          }),
        });
        if (res.ok) {
          voidedCount += 1;
        } else if (!firstErr) {
          const payload = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          firstErr = payload.error ?? "Could not void one or more sales.";
        }
      }

      if (firstErr) setError(firstErr);
      if (voidedCount > 0) {
        setBulkSuccess(
          `Voided ${voidedCount} walk-in ${voidedCount === 1 ? "sale" : "sales"}.`
        );
      }
      setSelectedSales([]);
      setPendingBulkAction(null);
      await Promise.resolve(onDataChanged());
    } catch {
      setError("Connection error while updating selected sales.");
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Quick Stats Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <QuickStatCard
          highlighted
          label="Walk-in Total"
          value={formatPHP(pos.summary.grossTotal)}
          sublabel={`${pos.summary.completedCount} sales · ${pos.summary.gallonsSold} gallons`}
          icon={<ShoppingBag className="h-5 w-5" />}
        />
        <QuickStatCard
          label="Cash Received"
          value={formatPHP(pos.summary.cashTotal)}
          sublabel="Counted into cash drawer"
          icon={<Banknote className="h-5 w-5" />}
        />
        <QuickStatCard
          label="GCash / Bank"
          value={formatPHP(pos.summary.digitalTotal)}
          sublabel="Online payments"
          icon={<CreditCard className="h-5 w-5" />}
        />
        <QuickStatCard
          label="Walk-in Utang"
          value={formatPHP(pos.summary.utangTotal)}
          sublabel="Unpaid customer tabs"
          icon={<Clock className="h-5 w-5" />}
        />
      </div>

      {/* Tablet-First POS Grid */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Touch-Friendly Product Tiles */}
        <div className="space-y-4 lg:col-span-7">
          <div className="av-card p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[var(--av-ink)]">
                  Tap Items to Add
                </h2>
                <p className="text-xs font-normal text-[var(--av-muted)]">
                  Use + / − directly on each tile for fast rush checkout.
                </p>
              </div>
              <StatusChip
                label={`${cart.reduce((s, l) => s + l.quantity, 0)} in order`}
                tone="soft"
              />
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {pos.products.map((product) => {
                const qty = getQtyInCart(product.id);
                const isActive = qty > 0;

                return (
                  <div
                    key={product.id}
                    className={`flex min-h-[180px] flex-col justify-between rounded-[22px] border p-5 transition ${
                      isActive
                        ? "border-[var(--av-ink)] bg-[var(--av-surface-subtle)] shadow-[0_4px_16px_rgba(20,18,14,0.08)]"
                        : "border-[var(--av-border)] bg-[var(--av-surface)] hover:border-[var(--av-border-strong)]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span
                        className={`flex h-11 w-11 items-center justify-center rounded-full ${
                          isActive
                            ? "bg-[var(--av-accent)] text-[var(--av-accent-ink)]"
                            : "bg-[var(--av-surface-subtle)] text-[var(--av-ink)]"
                        }`}
                      >
                        <Droplets className="h-5 w-5" />
                      </span>
                      <span className="text-2xl font-bold tracking-tight text-[var(--av-ink)] tabular-nums">
                        {formatPHP(product.unit_price)}
                      </span>
                    </div>

                    <div className="mt-4">
                      <div className="text-base font-bold text-[var(--av-ink)]">
                        {product.name}
                      </div>
                      <p className="mt-0.5 text-xs font-normal text-[var(--av-muted)]">
                        {product.category === "refill"
                          ? "Customer brings own gallon"
                          : "New gallon filled with water"}
                      </p>
                    </div>

                    <div className="mt-5 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => adjustQty(product, -1)}
                        disabled={qty === 0}
                        aria-label={`Decrease ${product.name}`}
                        className="av-btn-outline flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-30"
                      >
                        <Minus className="h-4 w-4" />
                      </button>

                      <span className="min-w-[44px] text-center text-xl font-bold text-[var(--av-ink)] tabular-nums">
                        {qty}
                      </span>

                      <button
                        type="button"
                        onClick={() => adjustQty(product, 1)}
                        aria-label={`Add ${product.name}`}
                        className="av-btn-primary flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {lastReceipt && (
            <NoticeBanner
              tone="success"
              message={`Completed · Receipt ${lastReceipt.receipt_no} · Total ${formatPHP(lastReceipt.total_amount)}${
                lastReceipt.payment_method === "cash"
                  ? ` · Change ${formatPHP(lastReceipt.change_amount)}`
                  : ` · ${PAYMENT_LABELS[lastReceipt.payment_method]}`
              }`}
              onDismiss={() => setLastReceipt(null)}
            />
          )}
        </div>

        {/* Right: Persistent Order Summary */}
        <div className="av-card flex flex-col justify-between p-6 lg:col-span-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[var(--av-ink)]">
                Order Summary
              </h2>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setCart([]);
                    trackAction({
                      module: "pos",
                      action: "Cleared Walk-in cart",
                      controlLabel: "Clear",
                    });
                  }}
                  className="text-xs font-semibold text-[var(--av-muted)] underline hover:text-[var(--av-ink)]"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Cart Lines */}
            <div className="space-y-2">
              {cart.length === 0 ? (
                <EmptyState
                  icon={<Receipt className="h-4 w-4" />}
                  title="No items in order"
                  description="Tap + on Refill or Gallon Filled with Water."
                />
              ) : (
                cart.map((line) => (
                  <div
                    key={line.product.id}
                    className="flex items-center justify-between rounded-2xl bg-[var(--av-surface-subtle)] px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-bold text-[var(--av-ink)]">
                        {line.product.name}
                      </div>
                      <div className="text-[11px] font-medium text-[var(--av-muted)] tabular-nums">
                        {formatPHP(line.product.unit_price)} × {line.quantity}
                      </div>
                    </div>
                    <span className="text-sm font-bold text-[var(--av-ink)] tabular-nums">
                      {formatPHP(line.product.unit_price * line.quantity)}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Payment Method Pills */}
            <div>
              <label className="mb-2 block text-xs font-semibold text-[var(--av-muted)]">
                Payment Method
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["cash", "gcash", "utang"] as PosPaymentMethod[]).map(
                  (method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPaymentMethod(method)}
                      className={`rounded-full border px-3 py-2.5 text-xs font-semibold transition ${
                        paymentMethod === method
                          ? "border-[var(--av-accent)] bg-[var(--av-accent)] text-[var(--av-accent-ink)]"
                          : "border-[var(--av-border-strong)] bg-[var(--av-surface)] text-[var(--av-ink)] hover:bg-[var(--av-surface-subtle)]"
                      }`}
                    >
                      {PAYMENT_LABELS[method]}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Regular Customer Picker */}
            {activeCustomers.length > 0 && (
              <div>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedCustomerId(id);
                    const found = activeCustomers.find((c) => c.id === id);
                    setCustomerName(found ? found.customer_name : "");
                  }}
                  aria-label="Regular customer"
                  className="av-input w-full rounded-2xl px-3.5 py-2.5 text-xs font-medium"
                >
                  <option value="">Walk-in customer (or select regular)...</option>
                  {activeCustomers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.customer_name} — {c.area}
                      {c.gallons_held > 0 ? ` (${c.gallons_held} held)` : ""}
                    </option>
                  ))}
                </select>
                {selectedCustomer && (
                  <div className="mt-2 flex items-center justify-between rounded-2xl bg-[var(--av-surface-subtle)] px-3.5 py-2 text-[11px] font-medium text-[var(--av-ink-secondary)]">
                    <span>Container balance ({selectedCustomer.area})</span>
                    <StatusChip
                      label={`${selectedCustomer.gallons_held} gallons held`}
                      tone={selectedCustomer.gallons_held > 0 ? "solid" : "outline"}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={customerName}
                onChange={(e) => {
                  setSelectedCustomerId("");
                  setCustomerName(e.target.value);
                }}
                placeholder={
                  paymentMethod === "utang"
                    ? "Customer name (required)"
                    : "Customer name (optional)"
                }
                className="av-input rounded-2xl px-3.5 py-2.5 text-xs"
              />
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Note (optional)"
                className="av-input rounded-2xl px-3.5 py-2.5 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-[var(--av-muted)]">
                  Discount (₱)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={discountInput}
                  onKeyDown={handleDecimalKeyDown}
                  onChange={(e) =>
                    setDiscountInput(sanitizeDecimalInput(e.target.value))
                  }
                  placeholder="e.g. 10"
                  className="av-input w-full rounded-2xl px-3.5 py-2 text-sm font-semibold tabular-nums"
                />
              </div>

              {paymentMethod === "cash" && (
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-[var(--av-muted)]">
                    Cash Received (₱)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={tenderedInput}
                    onKeyDown={handleDecimalKeyDown}
                    onChange={(e) =>
                      setTenderedInput(sanitizeDecimalInput(e.target.value))
                    }
                    placeholder={
                      totalAmount > 0
                        ? `e.g. ${totalAmount.toFixed(2)}`
                        : "Enter cash received"
                    }
                    className="av-input w-full rounded-2xl px-3.5 py-2 text-sm font-semibold tabular-nums"
                  />
                </div>
              )}
            </div>

            {paymentMethod === "cash" && totalAmount > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {[totalAmount, 50, 100, 200, 500, 1000].map((preset, idx) => (
                  <button
                    key={`${preset}-${idx}`}
                    type="button"
                    onClick={() => setTenderedInput(String(preset))}
                    className="rounded-full border border-[var(--av-border-strong)] bg-[var(--av-surface)] px-3 py-1 text-[11px] font-semibold text-[var(--av-ink)] tabular-nums transition hover:border-[var(--av-accent)] hover:bg-[var(--av-accent)] hover:text-[var(--av-accent-ink)]"
                  >
                    {idx === 0 ? "Exact" : `₱${preset}`}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-5 space-y-4">
            <div className="space-y-1.5 rounded-2xl bg-[var(--av-surface-subtle)] p-4 text-xs">
              <div className="flex justify-between text-[var(--av-muted)]">
                <span>Subtotal</span>
                <span className="font-semibold text-[var(--av-ink)] tabular-nums">
                  {formatPHP(subtotal)}
                </span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-[var(--av-muted)]">
                  <span>Discount</span>
                  <span className="font-semibold text-[var(--av-ink)] tabular-nums">
                    -{formatPHP(discount)}
                  </span>
                </div>
              )}
              <div className="flex justify-between border-t border-[var(--av-border)] pt-2 text-base font-bold text-[var(--av-ink)]">
                <span>Total</span>
                <span className="tabular-nums">{formatPHP(totalAmount)}</span>
              </div>
              {paymentMethod === "cash" && (
                <div className="flex justify-between text-xs font-semibold text-[var(--av-ink-secondary)]">
                  <span>Change</span>
                  <span className="tabular-nums text-[var(--av-ink)]">
                    {formatPHP(changeAmount)}
                  </span>
                </div>
              )}
            </div>

            {error && (
              <NoticeBanner
                tone="error"
                message={error}
                onDismiss={() => setError(null)}
              />
            )}

            <button
              type="button"
              onClick={handleCheckout}
              disabled={submitting || cart.length === 0 || pos.schemaMissing}
              className="av-btn-primary w-full rounded-full px-6 py-4 text-sm font-semibold transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-35"
            >
              {submitting
                ? "Completing Sale..."
                : `Complete Sale · ${formatPHP(totalAmount)}`}
            </button>
          </div>
        </div>
      </div>

      {/* Walk-in Sales Table */}
      <div className="av-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[var(--av-ink)]">
              Walk-in Sales ({pos.sales.length})
            </h3>
            <p className="text-xs font-normal text-[var(--av-muted)]">
              Recorded for {businessDate}
              {activeSelectedSales.length > 0 && (
                <> · {activeSelectedSales.length} selected</>
              )}
            </p>
          </div>

          {activeSelectedSales.length > 0 &&
            (!pendingBulkAction ? (
              <div className="flex flex-wrap items-center gap-2">
                {activeVoidableSales.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setPendingBulkAction("void")}
                    className="av-btn-outline inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition"
                  >
                    <Ban className="h-3.5 w-3.5" />
                    Void Selected ({activeVoidableSales.length})
                  </button>
                )}
                {isElevatedActor && (
                  <button
                    type="button"
                    onClick={() => setPendingBulkAction("delete")}
                    className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/12 px-3.5 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-500/20 dark:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Selected ({activeSelectedSales.length})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedSales([])}
                  className="text-xs font-semibold text-[var(--av-muted)] hover:text-[var(--av-ink)]"
                >
                  Clear
                </button>
              </div>
            ) : (
              <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-red-500/40 bg-red-500/10 py-1 pr-1 pl-3">
                <span className="text-xs font-semibold text-red-700 dark:text-red-300">
                  {pendingBulkAction === "delete"
                    ? `Delete ${activeSelectedSales.length} ${activeSelectedSales.length === 1 ? "sale" : "sales"}?`
                    : `Void ${activeVoidableSales.length} ${activeVoidableSales.length === 1 ? "sale" : "sales"}?`}
                </span>
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => setPendingBulkAction(null)}
                  className="rounded-full border border-[var(--av-border-strong)] bg-[var(--av-surface)] px-3 py-1 text-xs font-semibold text-[var(--av-ink)] transition hover:bg-[var(--av-surface-subtle)] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => void handleConfirmBulkAction()}
                  className="inline-flex items-center gap-1 rounded-full bg-red-600 px-3.5 py-1 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                >
                  {pendingBulkAction === "delete" ? (
                    <Trash2 className="h-3 w-3" />
                  ) : (
                    <Ban className="h-3 w-3" />
                  )}
                  {bulkBusy
                    ? pendingBulkAction === "delete"
                      ? "Deleting..."
                      : "Voiding..."
                    : pendingBulkAction === "delete"
                      ? `Confirm Delete (${activeSelectedSales.length})`
                      : `Confirm Void (${activeVoidableSales.length})`}
                </button>
              </div>
            ))}
        </div>

        {bulkSuccess && (
          <div className="mt-4">
            <NoticeBanner
              tone="success"
              message={bulkSuccess}
              onDismiss={() => setBulkSuccess(null)}
            />
          </div>
        )}

        <div className="mt-4 overflow-x-auto">
          {pos.sales.length === 0 ? (
            <EmptyState
              icon={<ShoppingBag className="h-4 w-4" />}
              title={`No walk-in sales for ${businessDate}`}
              description="Completed walk-in orders will appear here."
            />
          ) : (
            <table className="w-full border-separate border-spacing-y-2 text-left text-xs">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-[var(--av-muted)]">
                  <th className="w-8 pb-1 pl-3">
                    <input
                      type="checkbox"
                      aria-label="Select all walk-in sales"
                      checked={
                        pos.sales.length > 0 &&
                        pos.sales.every((s) => selectedSales.includes(s.id))
                      }
                      onChange={toggleAllSales}
                      className="h-4 w-4 rounded border-[var(--av-border-strong)] accent-[var(--av-accent)]"
                    />
                  </th>
                  <th className="px-3 pb-1">Receipt</th>
                  <th className="px-3 pb-1">Items</th>
                  <th className="px-3 pb-1">Payment</th>
                  <th className="px-3 pb-1">Total</th>
                  <th className="px-3 pb-1">Status</th>
                  <th className="pb-1 pr-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {pos.sales.map((sale) => (
                  <tr
                    key={sale.id}
                    className={`rounded-2xl bg-[var(--av-surface-subtle)] font-medium transition hover:bg-[var(--av-surface-hover)] ${
                      sale.status === "voided" ? "opacity-55" : ""
                    }`}
                  >
                    <td className="rounded-l-2xl py-3 pl-3">
                      <input
                        type="checkbox"
                        checked={selectedSales.includes(sale.id)}
                        onChange={() => toggleSelectSale(sale.id)}
                        aria-label={`Select receipt ${sale.receipt_no}`}
                        className="h-4 w-4 rounded border-[var(--av-border-strong)] accent-[var(--av-accent)]"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-bold text-[var(--av-ink)] tabular-nums">
                        {sale.receipt_no}
                      </div>
                      <div className="text-[11px] font-normal text-[var(--av-muted)]">
                        {sale.customer_name || "Walk-in"} ·{" "}
                        {new Date(sale.created_at).toLocaleTimeString()}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[var(--av-ink-secondary)]">
                      {sale.items
                        .map((i) => `${i.quantity}× ${i.product_name}`)
                        .join(", ")}
                    </td>
                    <td className="px-3 py-3">
                      <StatusChip
                        label={PAYMENT_LABELS[sale.payment_method]}
                        tone="outline"
                      />
                    </td>
                    <td className="px-3 py-3 font-bold text-[var(--av-ink)] tabular-nums">
                      {formatPHP(sale.total_amount)}
                    </td>
                    <td className="px-3 py-3">
                      <StatusChip
                        label={
                          sale.status === "voided"
                            ? "Voided"
                            : sale.payment_method === "utang"
                              ? "Unpaid"
                              : "Paid"
                        }
                        tone={
                          sale.status === "voided"
                            ? "outline"
                            : sale.payment_method === "utang"
                              ? "soft"
                              : "solid"
                        }
                        dot
                      />
                    </td>
                    <td className="rounded-r-2xl py-3 pr-3 text-right">
                      <RowActionMenu
                        ariaLabel={`Actions for ${sale.receipt_no}`}
                        actions={
                          sale.status === "completed"
                            ? [
                                {
                                  label: isElevatedActor
                                    ? "Fix Payment Method"
                                    : "Request Payment Fix",
                                  onClick: () =>
                                    onRequestCorrection({
                                      entityType: "pos_sale",
                                      entityId: sale.id,
                                      entityLabel: `${sale.receipt_no} · ${sale.customer_name || "Walk-in"}`,
                                      currentSummary: `${PAYMENT_LABELS[sale.payment_method]} · ${formatPHP(sale.total_amount)}`,
                                      defaultPaymentMethod: sale.payment_method,
                                    }),
                                },
                                {
                                  label:
                                    voidingId === sale.id
                                      ? "Voiding..."
                                      : "Void Sale",
                                  disabled: voidingId === sale.id,
                                  emphasis: "muted",
                                  onClick: () => void handleVoidSale(sale.id),
                                },
                              ]
                            : []
                        }
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
  );
}

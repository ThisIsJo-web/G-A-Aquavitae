"use client";

import {
  Banknote,
  Clock,
  CreditCard,
  Droplets,
  Minus,
  Plus,
  Receipt,
  ShoppingBag,
} from "lucide-react";
import { useState } from "react";
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
  onDataChanged,
  onRequestCorrection,
}: WalkInPosTabProps) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>("cash");
  const [discountInput, setDiscountInput] = useState("0");
  const [tenderedInput, setTenderedInput] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastReceipt, setLastReceipt] = useState<PosSaleDTO | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [selectedSales, setSelectedSales] = useState<Set<string>>(new Set());

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
      const res = await fetch("/api/cashier/pos", {
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
      setDiscountInput("0");
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
      const res = await fetch(`/api/cashier/pos/${saleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "void", reason: "Voided by cashier" }),
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
    setSelectedSales((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {/* Quick Stats Row — 1 Highlighted Solid Black Card */}
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
        {/* Left: Large Touch-Friendly Product Tiles */}
        <div className="space-y-4 lg:col-span-7">
          <div className="av-card p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[#111111]">
                  Tap Items to Add
                </h2>
                <p className="text-xs font-normal text-[#71717A]">
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
                        ? "border-[#111111] bg-[#F8F8FA] shadow-[0_4px_16px_rgba(17,17,17,0.06)]"
                        : "border-[#E8E8EC] bg-white hover:border-[#D4D4D8]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span
                        className={`flex h-11 w-11 items-center justify-center rounded-full ${
                          isActive
                            ? "bg-[#111111] text-white"
                            : "bg-[#F2F2F4] text-[#111111]"
                        }`}
                      >
                        <Droplets className="h-5 w-5" />
                      </span>
                      <span className="text-2xl font-bold tracking-tight text-[#111111] tabular-nums">
                        {formatPHP(product.unit_price)}
                      </span>
                    </div>

                    <div className="mt-4">
                      <div className="text-base font-bold text-[#111111]">
                        {product.name}
                      </div>
                      <p className="mt-0.5 text-xs font-normal text-[#71717A]">
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
                        className="flex h-11 w-11 items-center justify-center rounded-full border border-[#D4D4D8] bg-white text-[#111111] transition hover:bg-[#F4F4F6] active:scale-95 disabled:opacity-30"
                      >
                        <Minus className="h-4 w-4" />
                      </button>

                      <span className="min-w-[44px] text-center text-xl font-bold text-[#111111] tabular-nums">
                        {qty}
                      </span>

                      <button
                        type="button"
                        onClick={() => adjustQty(product, 1)}
                        aria-label={`Add ${product.name}`}
                        className="flex h-11 w-11 items-center justify-center rounded-full bg-[#111111] text-white transition hover:bg-black/85 active:scale-95"
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
              <h2 className="text-base font-bold text-[#111111]">
                Order Summary
              </h2>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="text-xs font-semibold text-[#71717A] underline hover:text-[#111111]"
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
                    className="flex items-center justify-between rounded-2xl bg-[#F7F7F9] px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-bold text-[#111111]">
                        {line.product.name}
                      </div>
                      <div className="text-[11px] font-medium text-[#71717A] tabular-nums">
                        {formatPHP(line.product.unit_price)} × {line.quantity}
                      </div>
                    </div>
                    <span className="text-sm font-bold text-[#111111] tabular-nums">
                      {formatPHP(line.product.unit_price * line.quantity)}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Quick Payment Pills (Cash · GCash · Utang) */}
            <div>
              <label className="mb-2 block text-xs font-semibold text-[#71717A]">
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
                          ? "border-[#111111] bg-[#111111] text-white"
                          : "border-[#D4D4D8] bg-white text-[#111111] hover:bg-[#F4F4F6]"
                      }`}
                    >
                      {PAYMENT_LABELS[method]}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Customer + Live Container Balance */}
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
                  className="w-full rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-3.5 py-2.5 text-xs font-medium text-[#111111] focus:border-[#111111] focus:bg-white focus:outline-none"
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
                  <div className="mt-2 flex items-center justify-between rounded-2xl bg-[#F4F4F6] px-3.5 py-2 text-[11px] font-medium text-[#52525B]">
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
                className="rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-3.5 py-2.5 text-xs text-[#111111] placeholder:text-[#A1A1AA] focus:border-[#111111] focus:bg-white focus:outline-none"
              />
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Note (optional)"
                className="rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-3.5 py-2.5 text-xs text-[#111111] placeholder:text-[#A1A1AA] focus:border-[#111111] focus:bg-white focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-[#71717A]">
                  Discount (₱)
                </label>
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value)}
                  className="w-full rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-3.5 py-2 text-sm font-semibold text-[#111111] tabular-nums focus:border-[#111111] focus:bg-white focus:outline-none"
                />
              </div>

              {paymentMethod === "cash" && (
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-[#71717A]">
                    Cash Received (₱)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={tenderedInput}
                    onChange={(e) => setTenderedInput(e.target.value)}
                    placeholder={totalAmount.toFixed(2)}
                    className="w-full rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-3.5 py-2 text-sm font-semibold text-[#111111] tabular-nums focus:border-[#111111] focus:bg-white focus:outline-none"
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
                    className="rounded-full border border-[#E4E4E7] bg-white px-3 py-1 text-[11px] font-semibold text-[#111111] tabular-nums transition hover:border-[#111111] hover:bg-[#111111] hover:text-white"
                  >
                    {idx === 0 ? "Exact" : `₱${preset}`}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-5 space-y-4">
            <div className="space-y-1.5 rounded-2xl bg-[#F7F7F9] p-4 text-xs">
              <div className="flex justify-between text-[#71717A]">
                <span>Subtotal</span>
                <span className="font-semibold text-[#111111] tabular-nums">
                  {formatPHP(subtotal)}
                </span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-[#71717A]">
                  <span>Discount</span>
                  <span className="font-semibold text-[#111111] tabular-nums">
                    -{formatPHP(discount)}
                  </span>
                </div>
              )}
              <div className="flex justify-between border-t border-[#E8E8EC] pt-2 text-base font-bold text-[#111111]">
                <span>Total</span>
                <span className="tabular-nums">{formatPHP(totalAmount)}</span>
              </div>
              {paymentMethod === "cash" && (
                <div className="flex justify-between text-xs font-semibold text-[#52525B]">
                  <span>Change</span>
                  <span className="tabular-nums text-[#111111]">
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
              className="w-full rounded-full bg-[#111111] px-6 py-4 text-sm font-semibold text-white transition hover:bg-black/85 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-35"
            >
              {submitting
                ? "Completing Sale..."
                : `Complete Sale · ${formatPHP(totalAmount)}`}
            </button>
          </div>
        </div>
      </div>

      {/* Rounded-Row Walk-in Sales Table */}
      <div className="av-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-[#111111]">
              Walk-in Sales ({pos.sales.length})
            </h3>
            <p className="text-xs font-normal text-[#71717A]">
              Recorded for {businessDate}
            </p>
          </div>
          {selectedSales.size > 0 && (
            <StatusChip label={`${selectedSales.size} selected`} tone="solid" />
          )}
        </div>

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
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-[#71717A]">
                  <th className="w-8 pb-1 pl-3" />
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
                    className={`rounded-2xl bg-[#F7F7F9] font-medium transition hover:bg-[#F0F0F3] ${
                      sale.status === "voided" ? "opacity-55" : ""
                    }`}
                  >
                    <td className="rounded-l-2xl py-3 pl-3">
                      <input
                        type="checkbox"
                        checked={selectedSales.has(sale.id)}
                        onChange={() => toggleSelectSale(sale.id)}
                        aria-label={`Select receipt ${sale.receipt_no}`}
                        className="h-4 w-4 rounded border-[#D4D4D8] accent-[#111111]"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-bold text-[#111111] tabular-nums">
                        {sale.receipt_no}
                      </div>
                      <div className="text-[11px] font-normal text-[#71717A]">
                        {sale.customer_name || "Walk-in"} ·{" "}
                        {new Date(sale.created_at).toLocaleTimeString()}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[#3F3F46]">
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
                    <td className="px-3 py-3 font-bold text-[#111111] tabular-nums">
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
                                  label: "Request Payment Fix",
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
                                      : "Void Sale (Today)",
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

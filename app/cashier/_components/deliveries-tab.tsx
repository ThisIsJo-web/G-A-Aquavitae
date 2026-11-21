"use client";

import {
  ArrowLeftRight,
  CalendarDays,
  CalendarRange,
  Search,
  Truck,
  UserPlus,
  Users,
} from "lucide-react";
import { useState, type FormEvent } from "react";
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
  type DeliveriesOverviewDTO,
  type DeliveryCustomerDTO,
  type DeliveryOrderType,
  type DeliveryPaymentMethod,
  type DeliveryPaymentStatus,
} from "./types";

interface DeliveriesTabProps {
  data: DeliveriesOverviewDTO;
  businessDate: string;
  onDataChanged: () => Promise<void> | void;
  onRequestCorrection: (target: CorrectionModalTarget) => void;
}

export function DeliveriesTab({
  data,
  businessDate,
  onDataChanged,
  onRequestCorrection,
}: DeliveriesTabProps) {
  const activeCustomers = data.customers.filter((c) => c.is_active);

  // Add Regular Customer Form
  const [newCustName, setNewCustName] = useState("");
  const [newCustArea, setNewCustArea] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustPrice, setNewCustPrice] = useState("20");
  const [addingCustomer, setAddingCustomer] = useState(false);

  // Record Delivery Form
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [destination, setDestination] = useState("");
  const [orderType, setOrderType] = useState<DeliveryOrderType>("refill");
  const [quantity, setQuantity] = useState("1");
  const [emptyReturned, setEmptyReturned] = useState("1");
  const [emptyTouched, setEmptyTouched] = useState(false);
  const [unitPrice, setUnitPrice] = useState("20");
  const [deliveryFee, setDeliveryFee] = useState("0");
  const [paymentMethod, setPaymentMethod] =
    useState<DeliveryPaymentMethod>("cash");
  const [paymentStatus, setPaymentStatus] =
    useState<DeliveryPaymentStatus>("paid");
  const [deliveredBy, setDeliveredBy] = useState("");
  const [notes, setNotes] = useState("");
  const [saveAsRegular, setSaveAsRegular] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedDeliveries, setSelectedDeliveries] = useState<Set<string>>(
    new Set()
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const qtyNum = Math.max(0, Math.floor(Number(quantity) || 0));
  const emptyNum = Math.max(0, Math.floor(Number(emptyReturned) || 0));
  const unitPriceNum = Math.max(0, Number(unitPrice) || 0);
  const feeNum = Math.max(0, Number(deliveryFee) || 0);
  const computedTotal = qtyNum * unitPriceNum + feeNum;
  const netGallonDiff = orderType === "refill" ? emptyNum - qtyNum : -qtyNum;

  function applyCustomerToForm(customer: DeliveryCustomerDTO | null) {
    if (!customer) {
      setSelectedCustomerId("");
      return;
    }
    setSelectedCustomerId(customer.id);
    setCustomerName(customer.customer_name);
    setCustomerPhone(customer.phone ?? "");
    setDestination(customer.area);
    setOrderType("refill");
    setUnitPrice(String(customer.default_unit_price));
    setSaveAsRegular(false);
    setError(null);
  }

  function handleQuickPrice(price: number, type: DeliveryOrderType) {
    setOrderType(type);
    setUnitPrice(String(price));
    if (type === "gallon_with_water" && !emptyTouched) {
      setEmptyReturned("0");
    } else if (type === "refill" && !emptyTouched) {
      setEmptyReturned(quantity);
    }
  }

  function handleQuantityChange(val: string) {
    setQuantity(val);
    if (!emptyTouched && orderType === "refill") {
      setEmptyReturned(val);
    }
  }

  function toggleSelectDelivery(id: string) {
    setSelectedDeliveries((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAddCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAddingCustomer(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/cashier/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: newCustName,
          area: newCustArea,
          phone: newCustPhone || undefined,
          defaultUnitPrice: Number(newCustPrice) || 20,
        }),
      });
      const payload = (await res.json()) as {
        customer?: DeliveryCustomerDTO;
        error?: string;
      };
      if (!res.ok || !payload.customer) {
        setError(payload.error ?? "Could not add regular customer.");
        return;
      }

      setNewCustName("");
      setNewCustArea("");
      setNewCustPhone("");
      setNewCustPrice("20");
      setSuccess(`Saved regular customer: ${payload.customer.customer_name}.`);
      await Promise.resolve(onDataChanged());
    } finally {
      setAddingCustomer(false);
    }
  }

  async function handleCreateDelivery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/cashier/deliveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: selectedCustomerId || undefined,
          customerName,
          customerPhone: customerPhone || undefined,
          destination,
          orderType,
          quantity: qtyNum,
          emptyGallonsReturned: emptyNum,
          unitPrice: unitPriceNum,
          deliveryFee: feeNum,
          paymentMethod,
          paymentStatus,
          deliveredBy: deliveredBy.trim() || undefined,
          notes: notes.trim() || undefined,
          saveAsRegularCustomer: !selectedCustomerId && saveAsRegular,
          businessDate,
        }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error ?? "Could not record delivery.");
        return;
      }

      setSuccess(
        `Saved delivery for ${customerName} (${destination}) · ${formatPHP(computedTotal)}.`
      );
      setSelectedCustomerId("");
      setCustomerName("");
      setCustomerPhone("");
      setDestination("");
      setOrderType("refill");
      setQuantity("1");
      setEmptyReturned("1");
      setEmptyTouched(false);
      setUnitPrice("20");
      setDeliveryFee("0");
      setDeliveredBy("");
      setNotes("");
      setSaveAsRegular(false);
      await Promise.resolve(onDataChanged());
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePatchDelivery(
    id: string,
    patch: {
      paymentStatus?: DeliveryPaymentStatus;
      paymentMethod?: DeliveryPaymentMethod;
      cancelled?: boolean;
    }
  ) {
    setUpdatingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/cashier/deliveries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const payload = (await res.json()) as { error?: string };
        setError(payload.error ?? "Could not update delivery.");
        return;
      }
      await Promise.resolve(onDataChanged());
    } finally {
      setUpdatingId(null);
    }
  }

  const filteredCustomers = activeCustomers.filter((c) => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      c.customer_name.toLowerCase().includes(q) ||
      c.area.toLowerCase().includes(q)
    );
  });

  const { today, week, month } = data.tallies;

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

      {/* Quick Stats Row (1 Solid Black Card) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <QuickStatCard
          highlighted
          label="Today's Deliveries"
          value={today.count}
          sublabel={`${formatPHP(today.totalSales)} · ${today.gallonsOut} gallons`}
          icon={<Truck className="h-5 w-5" />}
        />
        <QuickStatCard
          label="This Week"
          value={week.count}
          sublabel={`${formatPHP(week.totalSales)} · ${week.gallonsOut} out`}
          icon={<CalendarRange className="h-5 w-5" />}
        />
        <QuickStatCard
          label="This Month"
          value={month.count}
          sublabel={`${formatPHP(month.totalSales)} · ${month.gallonsOut} out`}
          icon={<CalendarDays className="h-5 w-5" />}
        />
        <QuickStatCard
          label="Gallons Out / In"
          value={`${today.gallonsOut} / ${today.emptiesIn}`}
          sublabel={
            today.netGallons === 0
              ? "Exact swap today"
              : today.netGallons < 0
                ? `${Math.abs(today.netGallons)} more out than returned`
                : `+${today.netGallons} extra empties in`
          }
          icon={<ArrowLeftRight className="h-5 w-5" />}
        />
      </div>

      {/* Record Delivery + Regular Customers */}
      <div className="grid gap-6 lg:grid-cols-12">
        <form
          onSubmit={handleCreateDelivery}
          className="av-card space-y-5 p-6 lg:col-span-7"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-[#111111]">
                Record Delivery
              </h2>
              <p className="text-xs font-normal text-[#71717A]">
                Log gallons delivered, empty gallons returned, and area price.
              </p>
            </div>
            {selectedCustomerId && (
              <button
                type="button"
                onClick={() => applyCustomerToForm(null)}
                className="text-xs font-semibold text-[#71717A] underline hover:text-[#111111]"
              >
                Clear customer
              </button>
            )}
          </div>

          {activeCustomers.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#111111]">
                Regular Customer (Optional)
              </label>
              <select
                value={selectedCustomerId}
                onChange={(e) => {
                  const found =
                    activeCustomers.find((c) => c.id === e.target.value) ??
                    null;
                  applyCustomerToForm(found);
                }}
                className="w-full rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-4 py-2.5 text-sm font-medium text-[#111111] focus:border-[#111111] focus:bg-white focus:outline-none"
              >
                <option value="">New / One-time customer...</option>
                {activeCustomers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.customer_name} — {c.area} (₱{c.default_unit_price})
                    {c.gallons_held > 0 ? ` · ${c.gallons_held} held` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#111111]">
                Customer Name
              </label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Ate Linda"
                className="w-full rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-4 py-2.5 text-sm text-[#111111] placeholder:text-[#A1A1AA] focus:border-[#111111] focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#111111]">
                Area / Address
              </label>
              <input
                type="text"
                required
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="e.g. Tagum"
                className="w-full rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-4 py-2.5 text-sm text-[#111111] placeholder:text-[#A1A1AA] focus:border-[#111111] focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          {/* Quick-tap Area Pricing */}
          <div>
            <label className="mb-2 block text-xs font-semibold text-[#111111]">
              Price per Gallon
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleQuickPrice(20, "refill")}
                className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                  orderType === "refill" && unitPriceNum === 20
                    ? "border-[#111111] bg-[#111111] text-white"
                    : "border-[#D4D4D8] bg-white text-[#111111] hover:bg-[#F4F4F6]"
                }`}
              >
                ₱20 · Refill
              </button>
              <button
                type="button"
                onClick={() => handleQuickPrice(25, "refill")}
                className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                  orderType === "refill" && unitPriceNum === 25
                    ? "border-[#111111] bg-[#111111] text-white"
                    : "border-[#D4D4D8] bg-white text-[#111111] hover:bg-[#F4F4F6]"
                }`}
              >
                ₱25 · Farther Area
              </button>
              <button
                type="button"
                onClick={() => handleQuickPrice(160, "gallon_with_water")}
                className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                  orderType === "gallon_with_water"
                    ? "border-[#111111] bg-[#111111] text-white"
                    : "border-[#D4D4D8] bg-white text-[#111111] hover:bg-[#F4F4F6]"
                }`}
              >
                ₱160 · Filled Gallon
              </button>

              <div className="ml-auto flex items-center gap-1.5">
                <span className="text-xs font-semibold text-[#71717A]">₱</span>
                <input
                  type="number"
                  min={0}
                  step="1"
                  required
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  aria-label="Custom price per gallon"
                  className="w-20 rounded-full border border-[#E4E4E7] bg-[#F8F8FA] px-3 py-1.5 text-center text-xs font-bold text-[#111111] tabular-nums focus:border-[#111111] focus:bg-white focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Gallon In & Out */}
          <div className="rounded-2xl bg-[#F7F7F9] p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#111111]">
                  Gallons Out
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={quantity}
                  onChange={(e) => handleQuantityChange(e.target.value)}
                  className="w-full rounded-2xl border border-[#E4E4E7] bg-white px-3 py-2 text-sm font-bold text-[#111111] tabular-nums"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#111111]">
                  Empties Returned (In)
                </label>
                <input
                  type="number"
                  min={0}
                  required
                  value={emptyReturned}
                  onChange={(e) => {
                    setEmptyTouched(true);
                    setEmptyReturned(e.target.value);
                  }}
                  className="w-full rounded-2xl border border-[#E4E4E7] bg-white px-3 py-2 text-sm font-bold text-[#111111] tabular-nums"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#111111]">
                  Extra Fee (₱)
                </label>
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={deliveryFee}
                  onChange={(e) => setDeliveryFee(e.target.value)}
                  className="w-full rounded-2xl border border-[#E4E4E7] bg-white px-3 py-2 text-sm font-bold text-[#111111] tabular-nums"
                />
              </div>
            </div>

            <div className="mt-3 text-xs font-medium text-[#52525B]">
              {orderType === "gallon_with_water" ? (
                <>
                  Selling {qtyNum} filled gallon(s) — station stock decreases by{" "}
                  <strong className="text-[#111111]">{qtyNum}</strong>
                  {emptyNum > 0 ? ` (+${emptyNum} empty returned)` : ""}.
                </>
              ) : netGallonDiff === 0 ? (
                <>
                  Exact swap ({qtyNum} out / {emptyNum} empty in) — no borrowed
                  gallons.
                </>
              ) : netGallonDiff < 0 ? (
                <>
                  <strong className="text-[#111111]">
                    {Math.abs(netGallonDiff)} gallon(s)
                  </strong>{" "}
                  will be added to Borrowed under{" "}
                  {customerName || "this customer"}.
                </>
              ) : (
                <>
                  <strong className="text-[#111111]">+{netGallonDiff}</strong>{" "}
                  extra empty gallon(s) returned — restores station stock &amp;
                  reduces borrowed balance.
                </>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#111111]">
                Payment
              </label>
              <select
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(e.target.value as DeliveryPaymentMethod)
                }
                className="w-full rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-3 py-2.5 text-xs font-semibold text-[#111111]"
              >
                <option value="cash">Cash</option>
                <option value="gcash">GCash</option>
                <option value="credit">Utang / Credit</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#111111]">
                Status
              </label>
              <select
                value={paymentStatus}
                onChange={(e) =>
                  setPaymentStatus(e.target.value as DeliveryPaymentStatus)
                }
                className="w-full rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-3 py-2.5 text-xs font-semibold text-[#111111]"
              >
                <option value="paid">Paid</option>
                <option value="unpaid">Unpaid</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#111111]">
                Delivered By (Ref)
              </label>
              <input
                type="text"
                value={deliveredBy}
                onChange={(e) => setDeliveredBy(e.target.value)}
                placeholder="Optional name"
                className="w-full rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-3 py-2.5 text-xs text-[#111111]"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="text"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="Customer phone (optional)"
              className="rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-3.5 py-2.5 text-xs text-[#111111]"
            />
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Landmark / note (optional)"
              className="rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-3.5 py-2.5 text-xs text-[#111111]"
            />
          </div>

          {!selectedCustomerId && (
            <label className="inline-flex items-center gap-2 text-xs font-medium text-[#52525B]">
              <input
                type="checkbox"
                checked={saveAsRegular}
                onChange={(e) => setSaveAsRegular(e.target.checked)}
                className="h-4 w-4 rounded border-[#D4D4D8] accent-[#111111]"
              />
              <span>Save as regular delivery customer</span>
            </label>
          )}

          <div className="flex items-center justify-between rounded-2xl bg-[#F7F7F9] px-5 py-3.5">
            <span className="text-xs font-semibold text-[#71717A]">
              Delivery Total
            </span>
            <span className="text-xl font-bold text-[#111111] tabular-nums">
              {formatPHP(computedTotal)}
            </span>
          </div>

          <button
            type="submit"
            disabled={submitting || data.schemaMissing}
            className="w-full rounded-full bg-[#111111] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-black/85 disabled:opacity-40"
          >
            {submitting
              ? "Saving..."
              : `Save Delivery · ${formatPHP(computedTotal)}`}
          </button>
        </form>

        {/* Right: Regular Delivery Customers */}
        <div className="av-card flex flex-col p-6 lg:col-span-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F2F2F4] text-[#111111]">
              <Users className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-base font-bold text-[#111111]">
                Regular Customers ({activeCustomers.length})
              </h3>
              <p className="text-xs font-normal text-[#71717A]">
                Area rate &amp; station gallon balance per customer.
              </p>
            </div>
          </div>

          <form onSubmit={handleAddCustomer} className="mt-5 space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                required
                value={newCustName}
                onChange={(e) => setNewCustName(e.target.value)}
                placeholder="Customer name"
                className="rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-3.5 py-2 text-xs text-[#111111] focus:border-[#111111] focus:bg-white focus:outline-none"
              />
              <input
                type="text"
                required
                value={newCustArea}
                onChange={(e) => setNewCustArea(e.target.value)}
                placeholder="Area (e.g. Tagum)"
                className="rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-3.5 py-2 text-xs text-[#111111] focus:border-[#111111] focus:bg-white focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={newCustPhone}
                onChange={(e) => setNewCustPhone(e.target.value)}
                placeholder="Phone (optional)"
                className="rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-3.5 py-2 text-xs text-[#111111] focus:border-[#111111] focus:bg-white focus:outline-none"
              />
              <div className="flex items-center gap-1">
                {["20", "25"].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setNewCustPrice(p)}
                    className={`rounded-full border px-2.5 py-1.5 text-xs font-semibold tabular-nums ${
                      newCustPrice === p
                        ? "border-[#111111] bg-[#111111] text-white"
                        : "border-[#D4D4D8] bg-white text-[#111111]"
                    }`}
                  >
                    ₱{p}
                  </button>
                ))}
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={newCustPrice}
                  onChange={(e) => setNewCustPrice(e.target.value)}
                  aria-label="Default customer price"
                  className="w-full rounded-full border border-[#E4E4E7] bg-[#F8F8FA] px-2.5 py-1.5 text-center text-xs font-semibold text-[#111111] tabular-nums"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={addingCustomer || data.schemaMissing}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-[#D4D4D8] bg-white px-4 py-2.5 text-xs font-semibold text-[#111111] transition hover:border-[#111111] hover:bg-[#111111] hover:text-white disabled:opacity-40"
            >
              <UserPlus className="h-3.5 w-3.5" />
              {addingCustomer ? "Saving..." : "Add Regular Customer"}
            </button>
          </form>

          {activeCustomers.length > 0 && (
            <div className="relative mt-4">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 h-3.5 w-3.5 -translate-y-1/2 text-[#A1A1AA]" />
              <input
                type="search"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Search customer or area..."
                className="w-full rounded-full border border-[#E4E4E7] bg-[#F8F8FA] py-2 pr-3.5 pl-9 text-xs text-[#111111] placeholder:text-[#A1A1AA] focus:border-[#111111] focus:bg-white focus:outline-none"
              />
            </div>
          )}

          <div className="mt-4 max-h-[340px] flex-1 space-y-2 overflow-y-auto">
            {filteredCustomers.length === 0 ? (
              <EmptyState
                icon={<Users className="h-4 w-4" />}
                title="No regular customers yet"
                description="Save frequent callers for 1-tap delivery entry."
              />
            ) : (
              filteredCustomers.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded-2xl bg-[#F7F7F9] px-3.5 py-3 text-xs transition hover:bg-[#F0F0F3]"
                >
                  <div className="min-w-0">
                    <div className="truncate font-bold text-[#111111]">
                      {c.customer_name}
                    </div>
                    <div className="text-[11px] font-normal text-[#71717A]">
                      {c.area} ·{" "}
                      <span className="font-semibold text-[#111111] tabular-nums">
                        ₱{c.default_unit_price}
                      </span>
                      {c.phone ? ` · ${c.phone}` : ""}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {c.gallons_held > 0 && (
                      <StatusChip label={`${c.gallons_held} held`} tone="solid" />
                    )}
                    <button
                      type="button"
                      onClick={() => applyCustomerToForm(c)}
                      className="rounded-full border border-[#D4D4D8] bg-white px-3 py-1 text-[11px] font-semibold text-[#111111] transition hover:border-[#111111] hover:bg-[#111111] hover:text-white"
                    >
                      Deliver
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Rounded-Row Deliveries Table */}
      <div className="av-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-[#111111]">
              Deliveries ({data.deliveries.length})
            </h3>
            <p className="text-xs font-normal text-[#71717A]">
              {businessDate} · Cash {formatPHP(data.summary.paidCashTotal)} ·
              GCash {formatPHP(data.summary.paidDigitalTotal)} · Unpaid{" "}
              {formatPHP(data.summary.unpaidTotal)}
            </p>
          </div>
          {selectedDeliveries.size > 0 && (
            <StatusChip
              label={`${selectedDeliveries.size} selected`}
              tone="solid"
            />
          )}
        </div>

        <div className="mt-4 overflow-x-auto">
          {data.deliveries.length === 0 ? (
            <EmptyState
              icon={<Truck className="h-4 w-4" />}
              title={`No deliveries for ${businessDate}`}
              description="Logged deliveries will appear here with automatic daily, weekly, and monthly tallies."
            />
          ) : (
            <table className="w-full border-separate border-spacing-y-2 text-left text-xs">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-[#71717A]">
                  <th className="w-8 pb-1 pl-3" />
                  <th className="px-3 pb-1">Customer &amp; Area</th>
                  <th className="px-3 pb-1">Gallons Out / In</th>
                  <th className="px-3 pb-1">Total</th>
                  <th className="px-3 pb-1">Status</th>
                  <th className="px-3 pb-1">Reference</th>
                  <th className="pb-1 pr-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.deliveries.map((d) => {
                  const busy = updatingId === d.id;
                  const isCancelled = d.delivery_status === "cancelled";

                  return (
                    <tr
                      key={d.id}
                      className={`rounded-2xl bg-[#F7F7F9] font-medium transition hover:bg-[#F0F0F3] ${
                        isCancelled ? "opacity-55" : ""
                      }`}
                    >
                      <td className="rounded-l-2xl py-3 pl-3">
                        <input
                          type="checkbox"
                          checked={selectedDeliveries.has(d.id)}
                          onChange={() => toggleSelectDelivery(d.id)}
                          aria-label={`Select delivery for ${d.customer_name}`}
                          className="h-4 w-4 rounded border-[#D4D4D8] accent-[#111111]"
                        />
                      </td>

                      <td className="px-3 py-3">
                        <div className="font-bold text-[#111111]">
                          {d.customer_name}
                        </div>
                        <div className="text-[11px] font-normal text-[#71717A]">
                          {d.destination}
                          {d.customer_phone ? ` · ${d.customer_phone}` : ""}
                        </div>
                      </td>

                      <td className="px-3 py-3">
                        <div className="font-semibold text-[#111111] tabular-nums">
                          {d.quantity} Out · {d.empty_gallons_returned} In
                        </div>
                        <div className="text-[11px] font-normal text-[#71717A]">
                          {d.order_type === "gallon_with_water"
                            ? "Filled Gallon"
                            : "Refill"}
                          {d.borrowed_gallons_count > 0
                            ? ` · ${d.borrowed_gallons_count} borrowed`
                            : ""}
                        </div>
                      </td>

                      <td className="px-3 py-3">
                        <div className="font-bold text-[#111111] tabular-nums">
                          {formatPHP(d.total_amount)}
                        </div>
                        <div className="text-[11px] font-normal text-[#71717A] tabular-nums">
                          {formatPHP(d.unit_price)}/gal
                          {d.delivery_fee > 0
                            ? ` + ${formatPHP(d.delivery_fee)}`
                            : ""}
                        </div>
                      </td>

                      <td className="px-3 py-3">
                        {isCancelled ? (
                          <StatusChip label="Cancelled" tone="outline" />
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            <StatusChip
                              label={
                                d.payment_status === "paid" ? "Paid" : "Unpaid"
                              }
                              tone={
                                d.payment_status === "paid" ? "solid" : "soft"
                              }
                              dot
                            />
                            <StatusChip
                              label={d.payment_method.toUpperCase()}
                              tone="outline"
                            />
                          </div>
                        )}
                      </td>

                      <td className="px-3 py-3 text-[11px] text-[#71717A]">
                        {d.delivered_by || "—"}
                      </td>

                      <td className="rounded-r-2xl py-3 pr-3 text-right">
                        <RowActionMenu
                          ariaLabel={`Actions for ${d.customer_name}`}
                          actions={
                            isCancelled
                              ? []
                              : [
                                  ...(d.payment_status !== "paid"
                                    ? [
                                        {
                                          label: busy
                                            ? "Updating..."
                                            : "Mark Paid (Cash)",
                                          disabled: busy,
                                          onClick: () =>
                                            void handlePatchDelivery(d.id, {
                                              paymentStatus: "paid",
                                              paymentMethod: "cash",
                                            }),
                                        },
                                        {
                                          label: "Mark Paid (GCash)",
                                          disabled: busy,
                                          onClick: () =>
                                            void handlePatchDelivery(d.id, {
                                              paymentStatus: "paid",
                                              paymentMethod: "gcash",
                                            }),
                                        },
                                      ]
                                    : []),
                                  {
                                    label: "Request Correction / Cancel",
                                    disabled: busy,
                                    emphasis: "muted" as const,
                                    onClick: () =>
                                      onRequestCorrection({
                                        entityType: "delivery",
                                        entityId: d.id,
                                        entityLabel: `${d.customer_name} · ${d.destination}`,
                                        currentSummary: `${d.quantity} gal · ${formatPHP(d.total_amount)} (${d.payment_method.toUpperCase()} / ${d.payment_status})`,
                                        defaultPaymentMethod: d.payment_method,
                                        defaultAmount: d.total_amount,
                                      }),
                                  },
                                ]
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

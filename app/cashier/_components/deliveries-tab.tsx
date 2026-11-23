"use client";

import {
  ArrowLeftRight,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Search,
  Trash2,
  Truck,
  UserPlus,
  Users,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { trackAction } from "@/app/_components/activity-tracker";
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
  stationQuery: string;
  isElevatedActor: boolean;
  onDataChanged: () => Promise<void> | void;
  onRequestCorrection: (target: CorrectionModalTarget) => void;
}

export function DeliveriesTab({
  data,
  businessDate,
  stationQuery,
  isElevatedActor,
  onDataChanged,
  onRequestCorrection,
}: DeliveriesTabProps) {
  const activeCustomers = data.customers.filter((c) => c.is_active);

  // Add Regular Customer Form (placeholder-only, no pre-filled values)
  const [newCustName, setNewCustName] = useState("");
  const [newCustArea, setNewCustArea] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustPrice, setNewCustPrice] = useState("");
  const [addingCustomer, setAddingCustomer] = useState(false);

  // Record Delivery Form (placeholder-only, no pre-filled values)
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [destination, setDestination] = useState("");
  const [orderType, setOrderType] = useState<DeliveryOrderType>("refill");
  const [quantity, setQuantity] = useState("");
  const [emptyReturned, setEmptyReturned] = useState("");
  const [emptyTouched, setEmptyTouched] = useState(false);
  const [unitPrice, setUnitPrice] = useState("");
  const [deliveryFee, setDeliveryFee] = useState("");
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
  const [selectedDeliveries, setSelectedDeliveries] = useState<string[]>([]);
  const [pendingBulkAction, setPendingBulkAction] = useState<
    "paid_cash" | "paid_gcash" | "delete" | null
  >(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const activeSelectedDeliveries = useMemo(
    () => data.deliveries.filter((d) => selectedDeliveries.includes(d.id)),
    [data.deliveries, selectedDeliveries]
  );
  const activeUnpaidSelected = useMemo(
    () =>
      activeSelectedDeliveries.filter(
        (d) => d.delivery_status !== "cancelled" && d.payment_status === "unpaid"
      ),
    [activeSelectedDeliveries]
  );

  const qtyNum = Math.max(0, Math.floor(Number(quantity) || 0));
  const emptyNum =
    emptyReturned === "" && !emptyTouched && orderType === "refill"
      ? qtyNum
      : Math.max(0, Math.floor(Number(emptyReturned) || 0));
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
      setEmptyReturned("");
    }
  }

  function handleQuantityChange(raw: string) {
    const clean = sanitizeIntegerInput(raw);
    setQuantity(clean);
    if (!emptyTouched && orderType === "refill") {
      setEmptyReturned(clean);
    }
  }

  function toggleSelectDelivery(id: string) {
    setPendingBulkAction(null);
    setSelectedDeliveries((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function toggleAllDeliveries() {
    setPendingBulkAction(null);
    const allIds = data.deliveries.map((d) => d.id);
    const allChecked =
      allIds.length > 0 &&
      allIds.every((id) => selectedDeliveries.includes(id));
    setSelectedDeliveries(allChecked ? [] : allIds);
  }

  async function handleConfirmBulkDeliveryAction() {
    if (!pendingBulkAction || activeSelectedDeliveries.length === 0) return;
    setBulkBusy(true);
    setError(null);
    setSuccess(null);

    try {
      if (pendingBulkAction === "delete") {
        trackAction({
          module: "deliveries",
          action: `Deleted ${activeSelectedDeliveries.length} delivery record(s)`,
          controlLabel: "Confirm Delete",
        });
        const res = await fetch(`/api/owner/sales${stationQuery}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: activeSelectedDeliveries.map((d) => ({
              id: `del-${d.id}`,
              channel: "delivery",
            })),
          }),
        });
        const payload = (await res.json()) as {
          deletedCount?: number;
          error?: string;
        };
        if (!res.ok) {
          setError(payload.error ?? "Could not delete selected deliveries.");
          return;
        }
        const count = payload.deletedCount ?? activeSelectedDeliveries.length;
        setSelectedDeliveries([]);
        setPendingBulkAction(null);
        setSuccess(
          `Deleted ${count} selected ${count === 1 ? "delivery" : "deliveries"}.`
        );
        await Promise.resolve(onDataChanged());
        return;
      }

      // Mark selected unpaid deliveries as Paid (Cash or GCash)
      const targetMethod: DeliveryPaymentMethod =
        pendingBulkAction === "paid_gcash" ? "gcash" : "cash";
      if (activeUnpaidSelected.length === 0) {
        setPendingBulkAction(null);
        return;
      }
      trackAction({
        module: "deliveries",
        action: `Marked ${activeUnpaidSelected.length} delivery record(s) Paid (${targetMethod.toUpperCase()})`,
        controlLabel:
          targetMethod === "gcash"
            ? "Confirm Paid (GCash)"
            : "Confirm Paid (Cash)",
      });

      let updatedCount = 0;
      let firstErr: string | null = null;
      for (const del of activeUnpaidSelected) {
        const res = await fetch(
          `/api/cashier/deliveries/${del.id}${stationQuery}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              paymentStatus: "paid",
              paymentMethod: targetMethod,
            }),
          }
        );
        if (res.ok) {
          updatedCount += 1;
        } else if (!firstErr) {
          const payload = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          firstErr = payload.error ?? "Could not update one or more deliveries.";
        }
      }

      if (firstErr) setError(firstErr);
      if (updatedCount > 0) {
        setSuccess(
          `Marked ${updatedCount} ${updatedCount === 1 ? "delivery" : "deliveries"} as Paid (${targetMethod === "gcash" ? "GCash" : "Cash"}).`
        );
      }
      setSelectedDeliveries([]);
      setPendingBulkAction(null);
      await Promise.resolve(onDataChanged());
    } catch {
      setError("Connection error while updating selected deliveries.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleAddCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAddingCustomer(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/cashier/customers${stationQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: newCustName,
          area: newCustArea,
          phone: newCustPhone || undefined,
          defaultUnitPrice: newCustPrice ? Number(newCustPrice) : 20,
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
      setNewCustPrice("");
      setSuccess(`Saved regular customer: ${payload.customer.customer_name}.`);
      await Promise.resolve(onDataChanged());
    } finally {
      setAddingCustomer(false);
    }
  }

  async function handleCreateDelivery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (qtyNum <= 0) {
      setError("Enter the number of gallons delivered (at least 1).");
      return;
    }
    if (!unitPrice.trim()) {
      setError("Select or enter the price per gallon.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/cashier/deliveries${stationQuery}`, {
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
      setQuantity("");
      setEmptyReturned("");
      setEmptyTouched(false);
      setUnitPrice("");
      setDeliveryFee("");
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
      const res = await fetch(`/api/cashier/deliveries/${id}${stationQuery}`, {
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

      {/* Quick Stats Row */}
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
              <h2 className="text-base font-bold text-[var(--av-ink)]">
                Record Delivery
              </h2>
              <p className="text-xs font-normal text-[var(--av-muted)]">
                Log gallons delivered, empty gallons returned, and area price.
              </p>
            </div>
            {selectedCustomerId && (
              <button
                type="button"
                onClick={() => applyCustomerToForm(null)}
                className="text-xs font-semibold text-[var(--av-muted)] underline hover:text-[var(--av-ink)]"
              >
                Clear customer
              </button>
            )}
          </div>

          {activeCustomers.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--av-ink)]">
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
                className="av-input w-full rounded-2xl px-4 py-2.5 text-sm font-medium"
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
              <label className="mb-1.5 block text-xs font-semibold text-[var(--av-ink)]">
                Customer Name
              </label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Ate Linda"
                className="av-input w-full rounded-2xl px-4 py-2.5 text-sm"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--av-ink)]">
                Area / Address
              </label>
              <input
                type="text"
                required
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="e.g. Tagum"
                className="av-input w-full rounded-2xl px-4 py-2.5 text-sm"
              />
            </div>
          </div>

          {/* Quick-tap Area Pricing */}
          <div>
            <label className="mb-2 block text-xs font-semibold text-[var(--av-ink)]">
              Price per Gallon
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleQuickPrice(20, "refill")}
                className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                  orderType === "refill" && unitPrice === "20"
                    ? "border-[var(--av-accent)] bg-[var(--av-accent)] text-[var(--av-accent-ink)]"
                    : "border-[var(--av-border-strong)] bg-[var(--av-surface)] text-[var(--av-ink)] hover:bg-[var(--av-surface-subtle)]"
                }`}
              >
                ₱20 · Refill
              </button>
              <button
                type="button"
                onClick={() => handleQuickPrice(25, "refill")}
                className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                  orderType === "refill" && unitPrice === "25"
                    ? "border-[var(--av-accent)] bg-[var(--av-accent)] text-[var(--av-accent-ink)]"
                    : "border-[var(--av-border-strong)] bg-[var(--av-surface)] text-[var(--av-ink)] hover:bg-[var(--av-surface-subtle)]"
                }`}
              >
                ₱25 · Farther Area
              </button>
              <button
                type="button"
                onClick={() => handleQuickPrice(160, "gallon_with_water")}
                className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                  orderType === "gallon_with_water"
                    ? "border-[var(--av-accent)] bg-[var(--av-accent)] text-[var(--av-accent-ink)]"
                    : "border-[var(--av-border-strong)] bg-[var(--av-surface)] text-[var(--av-ink)] hover:bg-[var(--av-surface-subtle)]"
                }`}
              >
                ₱160 · Filled Gallon
              </button>

              <div className="ml-auto flex items-center gap-1.5">
                <span className="text-xs font-semibold text-[var(--av-muted)]">
                  ₱
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={unitPrice}
                  onKeyDown={handleDecimalKeyDown}
                  onChange={(e) =>
                    setUnitPrice(sanitizeDecimalInput(e.target.value))
                  }
                  placeholder="e.g. 20"
                  aria-label="Custom price per gallon"
                  className="av-input w-24 rounded-full px-3 py-1.5 text-center text-xs font-bold tabular-nums"
                />
              </div>
            </div>
          </div>

          {/* Gallon In & Out */}
          <div className="rounded-2xl bg-[var(--av-surface-subtle)] p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--av-ink)]">
                  Gallons Out
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={quantity}
                  onKeyDown={(e) => handleIntegerKeyDown(e, false)}
                  onChange={(e) => handleQuantityChange(e.target.value)}
                  placeholder="e.g. 5"
                  className="av-input w-full rounded-2xl bg-[var(--av-surface)] px-3 py-2 text-sm font-bold tabular-nums"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--av-ink)]">
                  Empties Returned (In)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={emptyReturned}
                  onKeyDown={(e) => handleIntegerKeyDown(e, false)}
                  onChange={(e) => {
                    setEmptyTouched(true);
                    setEmptyReturned(sanitizeIntegerInput(e.target.value));
                  }}
                  placeholder={orderType === "refill" ? "Same as out" : "e.g. 0"}
                  className="av-input w-full rounded-2xl bg-[var(--av-surface)] px-3 py-2 text-sm font-bold tabular-nums"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--av-ink)]">
                  Extra Fee (₱)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={deliveryFee}
                  onKeyDown={handleDecimalKeyDown}
                  onChange={(e) =>
                    setDeliveryFee(sanitizeDecimalInput(e.target.value))
                  }
                  placeholder="e.g. 0"
                  className="av-input w-full rounded-2xl bg-[var(--av-surface)] px-3 py-2 text-sm font-bold tabular-nums"
                />
              </div>
            </div>

            {qtyNum > 0 && (
              <div className="mt-3 text-xs font-medium text-[var(--av-ink-secondary)]">
                {orderType === "gallon_with_water" ? (
                  <>
                    Selling {qtyNum} filled gallon(s) — station stock decreases by{" "}
                    <strong className="text-[var(--av-ink)]">{qtyNum}</strong>
                    {emptyNum > 0 ? ` (+${emptyNum} empty returned)` : ""}.
                  </>
                ) : netGallonDiff === 0 ? (
                  <>
                    Exact swap ({qtyNum} out / {emptyNum} empty in) — no borrowed
                    gallons.
                  </>
                ) : netGallonDiff < 0 ? (
                  <>
                    <strong className="text-[var(--av-ink)]">
                      {Math.abs(netGallonDiff)} gallon(s)
                    </strong>{" "}
                    will be added to Borrowed under{" "}
                    {customerName || "this customer"}.
                  </>
                ) : (
                  <>
                    <strong className="text-[var(--av-ink)]">
                      +{netGallonDiff}
                    </strong>{" "}
                    extra empty gallon(s) returned — restores station stock &amp;
                    reduces borrowed balance.
                  </>
                )}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--av-ink)]">
                Payment
              </label>
              <select
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(e.target.value as DeliveryPaymentMethod)
                }
                className="av-input w-full rounded-2xl px-3 py-2.5 text-xs font-semibold"
              >
                <option value="cash">Cash</option>
                <option value="gcash">GCash</option>
                <option value="credit">Utang / Credit</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--av-ink)]">
                Status
              </label>
              <select
                value={paymentStatus}
                onChange={(e) =>
                  setPaymentStatus(e.target.value as DeliveryPaymentStatus)
                }
                className="av-input w-full rounded-2xl px-3 py-2.5 text-xs font-semibold"
              >
                <option value="paid">Paid</option>
                <option value="unpaid">Unpaid</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--av-ink)]">
                Delivered By
              </label>
              <input
                type="text"
                value={deliveredBy}
                onChange={(e) => setDeliveredBy(e.target.value)}
                placeholder="Rider name (optional)"
                className="av-input w-full rounded-2xl px-3 py-2.5 text-xs"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="tel"
              inputMode="tel"
              value={customerPhone}
              onKeyDown={handlePhoneKeyDown}
              onChange={(e) =>
                setCustomerPhone(sanitizePhoneInput(e.target.value))
              }
              placeholder="Phone number (optional)"
              className="av-input rounded-2xl px-3.5 py-2.5 text-xs"
            />
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Landmark / note (optional)"
              className="av-input rounded-2xl px-3.5 py-2.5 text-xs"
            />
          </div>

          {!selectedCustomerId && (
            <label className="inline-flex items-center gap-2 text-xs font-medium text-[var(--av-ink-secondary)]">
              <input
                type="checkbox"
                checked={saveAsRegular}
                onChange={(e) => setSaveAsRegular(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--av-border-strong)] accent-[var(--av-accent)]"
              />
              <span>Save as regular delivery customer</span>
            </label>
          )}

          <div className="flex items-center justify-between rounded-2xl bg-[var(--av-surface-subtle)] px-5 py-3.5">
            <span className="text-xs font-semibold text-[var(--av-muted)]">
              Delivery Total
            </span>
            <span className="text-xl font-bold text-[var(--av-ink)] tabular-nums">
              {formatPHP(computedTotal)}
            </span>
          </div>

          <button
            type="submit"
            disabled={submitting || data.schemaMissing}
            className="av-btn-primary w-full rounded-full px-6 py-3.5 text-sm font-semibold transition disabled:opacity-40"
          >
            {submitting
              ? "Saving..."
              : `Save Delivery · ${formatPHP(computedTotal)}`}
          </button>
        </form>

        {/* Right: Regular Delivery Customers */}
        <div className="av-card flex flex-col p-6 lg:col-span-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--av-surface-subtle)] text-[var(--av-ink)]">
              <Users className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-base font-bold text-[var(--av-ink)]">
                Regular Customers ({activeCustomers.length})
              </h3>
              <p className="text-xs font-normal text-[var(--av-muted)]">
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
                className="av-input rounded-2xl px-3.5 py-2 text-xs"
              />
              <input
                type="text"
                required
                value={newCustArea}
                onChange={(e) => setNewCustArea(e.target.value)}
                placeholder="Area (e.g. Tagum)"
                className="av-input rounded-2xl px-3.5 py-2 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                type="tel"
                inputMode="tel"
                value={newCustPhone}
                onKeyDown={handlePhoneKeyDown}
                onChange={(e) =>
                  setNewCustPhone(sanitizePhoneInput(e.target.value))
                }
                placeholder="Phone (optional)"
                className="av-input rounded-2xl px-3.5 py-2 text-xs"
              />
              <div className="flex items-center gap-1">
                {["20", "25"].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setNewCustPrice(p)}
                    className={`rounded-full border px-2.5 py-1.5 text-xs font-semibold tabular-nums ${
                      newCustPrice === p
                        ? "border-[var(--av-accent)] bg-[var(--av-accent)] text-[var(--av-accent-ink)]"
                        : "border-[var(--av-border-strong)] bg-[var(--av-surface)] text-[var(--av-ink)]"
                    }`}
                  >
                    ₱{p}
                  </button>
                ))}
                <input
                  type="text"
                  inputMode="decimal"
                  value={newCustPrice}
                  onKeyDown={handleDecimalKeyDown}
                  onChange={(e) =>
                    setNewCustPrice(sanitizeDecimalInput(e.target.value))
                  }
                  placeholder="₱ Rate"
                  aria-label="Default customer price"
                  className="av-input w-full rounded-full px-2.5 py-1.5 text-center text-xs font-semibold tabular-nums"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={addingCustomer || data.schemaMissing}
              className="av-btn-outline inline-flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-semibold transition disabled:opacity-40"
            >
              <UserPlus className="h-3.5 w-3.5" />
              {addingCustomer ? "Saving..." : "Add Regular Customer"}
            </button>
          </form>

          {activeCustomers.length > 0 && (
            <div className="relative mt-4">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 h-3.5 w-3.5 -translate-y-1/2 text-[var(--av-subtle)]" />
              <input
                type="search"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Search customer or area..."
                className="av-input w-full rounded-full py-2 pr-3.5 pl-9 text-xs"
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
                  className="flex items-center justify-between gap-2 rounded-2xl bg-[var(--av-surface-subtle)] px-3.5 py-3 text-xs transition hover:bg-[var(--av-surface-hover)]"
                >
                  <div className="min-w-0">
                    <div className="truncate font-bold text-[var(--av-ink)]">
                      {c.customer_name}
                    </div>
                    <div className="text-[11px] font-normal text-[var(--av-muted)]">
                      {c.area} ·{" "}
                      <span className="font-semibold text-[var(--av-ink)] tabular-nums">
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
                      className="av-btn-outline rounded-full px-3 py-1 text-[11px] font-semibold transition"
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

      {/* Deliveries Table */}
      <div className="av-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[var(--av-ink)]">
              Deliveries ({data.deliveries.length})
            </h3>
            <p className="text-xs font-normal text-[var(--av-muted)]">
              {businessDate} · Cash {formatPHP(data.summary.paidCashTotal)} ·
              GCash {formatPHP(data.summary.paidDigitalTotal)} · Unpaid{" "}
              {formatPHP(data.summary.unpaidTotal)}
              {activeSelectedDeliveries.length > 0 && (
                <> · {activeSelectedDeliveries.length} selected</>
              )}
            </p>
          </div>

          {activeSelectedDeliveries.length > 0 &&
            (!pendingBulkAction ? (
              <div className="flex flex-wrap items-center gap-2">
                {activeUnpaidSelected.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setPendingBulkAction("paid_cash")}
                      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/12 px-3.5 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-500/20 dark:text-emerald-300"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Mark Paid Cash ({activeUnpaidSelected.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingBulkAction("paid_gcash")}
                      className="av-btn-outline inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Mark Paid GCash ({activeUnpaidSelected.length})
                    </button>
                  </>
                )}

                {!isElevatedActor &&
                  activeSelectedDeliveries.length === 1 &&
                  activeSelectedDeliveries[0].delivery_status !== "cancelled" && (
                    <button
                      type="button"
                      onClick={() => {
                        const d = activeSelectedDeliveries[0];
                        onRequestCorrection({
                          entityType: "delivery",
                          entityId: d.id,
                          entityLabel: `${d.customer_name} · ${d.destination}`,
                          currentSummary: `${d.quantity} gal · ${formatPHP(d.total_amount)} (${d.payment_status})`,
                          defaultPaymentMethod: d.payment_method,
                          defaultAmount: d.total_amount,
                        });
                      }}
                      className="av-btn-outline inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition"
                    >
                      Request Correction / Cancel
                    </button>
                  )}

                {isElevatedActor && (
                  <button
                    type="button"
                    onClick={() => setPendingBulkAction("delete")}
                    className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/12 px-3.5 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-500/20 dark:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Selected ({activeSelectedDeliveries.length})
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSelectedDeliveries([])}
                  className="text-xs font-semibold text-[var(--av-muted)] hover:text-[var(--av-ink)]"
                >
                  Clear
                </button>
              </div>
            ) : (
              <div
                className={`inline-flex flex-wrap items-center gap-2 rounded-full border py-1 pr-1 pl-3 ${
                  pendingBulkAction === "delete"
                    ? "border-red-500/40 bg-red-500/10"
                    : "border-emerald-500/40 bg-emerald-500/10"
                }`}
              >
                <span
                  className={`text-xs font-semibold ${
                    pendingBulkAction === "delete"
                      ? "text-red-700 dark:text-red-300"
                      : "text-emerald-700 dark:text-emerald-300"
                  }`}
                >
                  {pendingBulkAction === "delete"
                    ? `Delete ${activeSelectedDeliveries.length} ${activeSelectedDeliveries.length === 1 ? "delivery" : "deliveries"}?`
                    : `Mark ${activeUnpaidSelected.length} paid via ${pendingBulkAction === "paid_gcash" ? "GCash" : "Cash"}?`}
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
                  onClick={() => void handleConfirmBulkDeliveryAction()}
                  className={`inline-flex items-center gap-1 rounded-full px-3.5 py-1 text-xs font-semibold text-white transition disabled:opacity-50 ${
                    pendingBulkAction === "delete"
                      ? "bg-red-600 hover:bg-red-700"
                      : "bg-emerald-600 hover:bg-emerald-700"
                  }`}
                >
                  {pendingBulkAction === "delete" ? (
                    <Trash2 className="h-3 w-3" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3" />
                  )}
                  {bulkBusy
                    ? pendingBulkAction === "delete"
                      ? "Deleting..."
                      : "Updating..."
                    : pendingBulkAction === "delete"
                      ? `Confirm Delete (${activeSelectedDeliveries.length})`
                      : `Confirm Paid (${activeUnpaidSelected.length})`}
                </button>
              </div>
            ))}
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
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-[var(--av-muted)]">
                  <th className="w-8 pb-1 pl-3">
                    <input
                      type="checkbox"
                      aria-label="Select all deliveries"
                      checked={
                        data.deliveries.length > 0 &&
                        data.deliveries.every((d) =>
                          selectedDeliveries.includes(d.id)
                        )
                      }
                      onChange={toggleAllDeliveries}
                      className="h-4 w-4 rounded border-[var(--av-border-strong)] accent-[var(--av-accent)]"
                    />
                  </th>
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
                  const isCancelled = d.delivery_status === "cancelled";
                  return (
                    <tr
                      key={d.id}
                      className={`rounded-2xl bg-[var(--av-surface-subtle)] font-medium transition hover:bg-[var(--av-surface-hover)] ${
                        isCancelled ? "opacity-55" : ""
                      }`}
                    >
                      <td className="rounded-l-2xl py-3 pl-3">
                        <input
                          type="checkbox"
                          checked={selectedDeliveries.includes(d.id)}
                          onChange={() => toggleSelectDelivery(d.id)}
                          aria-label={`Select delivery for ${d.customer_name}`}
                          className="h-4 w-4 rounded border-[var(--av-border-strong)] accent-[var(--av-accent)]"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-bold text-[var(--av-ink)]">
                          {d.customer_name}
                        </div>
                        <div className="text-[11px] font-normal text-[var(--av-muted)]">
                          {d.destination}
                          {d.customer_phone ? ` · ${d.customer_phone}` : ""}
                        </div>
                      </td>
                      <td className="px-3 py-3 tabular-nums">
                        <div className="font-bold text-[var(--av-ink)]">
                          {d.quantity} out / {d.empty_gallons_returned} in
                        </div>
                        <div className="text-[11px] text-[var(--av-muted)]">
                          {d.order_type === "gallon_with_water"
                            ? "Filled Gallon"
                            : "Refill"}{" "}
                          · ₱{d.unit_price}/gal
                        </div>
                      </td>
                      <td className="px-3 py-3 font-bold text-[var(--av-ink)] tabular-nums">
                        {formatPHP(d.total_amount)}
                        <div className="text-[11px] font-normal uppercase text-[var(--av-muted)]">
                          {d.payment_method === "credit"
                            ? "Utang"
                            : d.payment_method}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <StatusChip
                          label={
                            isCancelled
                              ? "Cancelled"
                              : d.payment_status === "paid"
                                ? "Paid"
                                : "Unpaid"
                          }
                          tone={
                            isCancelled
                              ? "outline"
                              : d.payment_status === "paid"
                                ? "solid"
                                : "soft"
                          }
                          dot
                        />
                      </td>
                      <td className="px-3 py-3 text-[11px] text-[var(--av-muted)]">
                        {d.delivered_by || d.notes || "—"}
                      </td>
                      <td className="rounded-r-2xl py-3 pr-3 text-right">
                        <RowActionMenu
                          ariaLabel={`Actions for ${d.customer_name}`}
                          actions={
                            !isCancelled
                              ? [
                                  ...(d.payment_status === "unpaid"
                                    ? [
                                        {
                                          label: "Mark Paid (Cash)",
                                          disabled: updatingId === d.id,
                                          onClick: () =>
                                            void handlePatchDelivery(d.id, {
                                              paymentStatus: "paid",
                                              paymentMethod: "cash",
                                            }),
                                        },
                                        {
                                          label: "Mark Paid (GCash)",
                                          disabled: updatingId === d.id,
                                          onClick: () =>
                                            void handlePatchDelivery(d.id, {
                                              paymentStatus: "paid",
                                              paymentMethod: "gcash",
                                            }),
                                        },
                                      ]
                                    : []),
                                  {
                                    label: isElevatedActor
                                      ? "Fix Payment / Amount"
                                      : "Request Correction / Cancel",
                                    onClick: () =>
                                      onRequestCorrection({
                                        entityType: "delivery",
                                        entityId: d.id,
                                        entityLabel: `${d.customer_name} · ${d.destination}`,
                                        currentSummary: `${d.quantity} gal · ${formatPHP(d.total_amount)} (${d.payment_status})`,
                                        defaultPaymentMethod: d.payment_method,
                                        defaultAmount: d.total_amount,
                                      }),
                                  },
                                  ...(isElevatedActor
                                    ? [
                                        {
                                          label: "Cancel Delivery",
                                          disabled: updatingId === d.id,
                                          emphasis: "muted" as const,
                                          onClick: () =>
                                            void handlePatchDelivery(d.id, {
                                              cancelled: true,
                                            }),
                                        },
                                      ]
                                    : []),
                                ]
                              : []
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

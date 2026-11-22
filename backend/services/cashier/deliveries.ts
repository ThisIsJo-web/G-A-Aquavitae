import "server-only";

import { createSupabaseAdminClient } from "@/backend/db/supabase";
import type {
  Database,
  DeliveryOrderType,
  DeliveryPaymentMethod,
  DeliveryPaymentStatus,
} from "@/backend/db/types";
import { AuthServiceError } from "@/backend/services/auth";
import {
  formatCentavosPHP,
  recordFinancialAuditEvent,
  toCentavos,
} from "@/backend/services/audit-ledger";
import {
  adjustGallonStock,
  assertOperationalDateAllowed,
  DEFAULT_GALLON_WITH_WATER_PRICE,
  DEFAULT_REFILL_PRICE,
  isMissingCashierSchemaError,
  roundMoney,
  sanitizeBusinessDate,
  toNumber,
} from "@/backend/services/cashier/shared";

export type DeliveryCustomerRow =
  Database["public"]["Tables"]["delivery_customers"]["Row"];
export type DeliveryRow = Database["public"]["Tables"]["deliveries"]["Row"];

export interface PeriodDeliveryTally {
  count: number;
  gallonsOut: number;
  emptiesIn: number;
  netGallons: number;
  totalSales: number;
}

export interface DeliveriesOverviewResult {
  businessDate: string;
  schemaMissing: boolean;
  customers: DeliveryCustomerRow[];
  deliveries: DeliveryRow[];
  tallies: {
    today: PeriodDeliveryTally;
    week: PeriodDeliveryTally;
    month: PeriodDeliveryTally;
  };
  summary: {
    totalDeliveries: number;
    totalGallonsOut: number;
    totalEmptiesIn: number;
    paidCashTotal: number;
    paidCashWaterTotal: number;
    paidCashDeliveryFees: number;
    paidDigitalTotal: number;
    unpaidTotal: number;
    grossActiveTotal: number;
  };
}

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function emptyPeriodTally(): PeriodDeliveryTally {
  return {
    count: 0,
    gallonsOut: 0,
    emptiesIn: 0,
    netGallons: 0,
    totalSales: 0,
  };
}

export async function listDeliveryCustomers(
  ownerId: string
): Promise<DeliveryCustomerRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("delivery_customers")
    .select("*")
    .eq("owner_id", ownerId)
    .order("is_active", { ascending: false })
    .order("customer_name", { ascending: true });

  if (error) {
    if (isMissingCashierSchemaError(error)) return [];
    throw new AuthServiceError(error.message, 500);
  }

  return (data ?? []).map((row) => ({
    ...row,
    default_unit_price: toNumber(row.default_unit_price, DEFAULT_REFILL_PRICE),
  }));
}

export async function createDeliveryCustomer(
  ownerId: string,
  input: {
    customerName: string;
    area: string;
    phone?: string;
    defaultUnitPrice?: number;
    notes?: string;
  }
): Promise<DeliveryCustomerRow> {
  const customerName = input.customerName.trim();
  const area = input.area.trim();
  if (!customerName || !area) {
    throw new AuthServiceError("Customer name and area are required", 400);
  }

  const defaultUnitPrice = roundMoney(
    input.defaultUnitPrice !== undefined &&
      Number.isFinite(Number(input.defaultUnitPrice))
      ? Math.max(0, Number(input.defaultUnitPrice))
      : DEFAULT_REFILL_PRICE
  );

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("delivery_customers")
    .insert({
      owner_id: ownerId,
      customer_name: customerName,
      area,
      phone: input.phone?.trim() || null,
      default_unit_price: defaultUnitPrice,
      gallons_held: 0,
      is_active: true,
      notes: input.notes?.trim() || null,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new AuthServiceError(
      error?.message ?? "Failed to save regular customer",
      500
    );
  }

  return {
    ...data,
    default_unit_price: toNumber(data.default_unit_price, DEFAULT_REFILL_PRICE),
  };
}

export async function updateDeliveryCustomer(
  ownerId: string,
  customerId: string,
  patch: {
    customerName?: string;
    area?: string;
    phone?: string | null;
    defaultUnitPrice?: number;
    isActive?: boolean;
    notes?: string | null;
  }
): Promise<DeliveryCustomerRow> {
  const admin = createSupabaseAdminClient();
  const updateData: Database["public"]["Tables"]["delivery_customers"]["Update"] =
    {};

  if (patch.customerName !== undefined && patch.customerName.trim()) {
    updateData.customer_name = patch.customerName.trim();
  }
  if (patch.area !== undefined && patch.area.trim()) {
    updateData.area = patch.area.trim();
  }
  if (patch.phone !== undefined) {
    updateData.phone = patch.phone?.trim() || null;
  }
  if (
    patch.defaultUnitPrice !== undefined &&
    Number.isFinite(Number(patch.defaultUnitPrice))
  ) {
    updateData.default_unit_price = roundMoney(
      Math.max(0, Number(patch.defaultUnitPrice))
    );
  }
  if (typeof patch.isActive === "boolean") {
    updateData.is_active = patch.isActive;
  }
  if (patch.notes !== undefined) {
    updateData.notes = patch.notes?.trim() || null;
  }

  const { data, error } = await admin
    .from("delivery_customers")
    .update(updateData)
    .eq("id", customerId)
    .eq("owner_id", ownerId)
    .select("*")
    .single();

  if (error || !data) {
    throw new AuthServiceError(
      error?.message ?? "Regular customer not found",
      404
    );
  }

  return {
    ...data,
    default_unit_price: toNumber(data.default_unit_price, DEFAULT_REFILL_PRICE),
  };
}

/**
 * Loads regular delivery customers, today's deliveries, and automatic
 * Daily / Weekly / Monthly delivery tallies (count, gallons Out/In, peso totals).
 */
export async function getDeliveriesOverview(
  ownerId: string,
  businessDateInput?: string
): Promise<DeliveriesOverviewResult> {
  const businessDate = sanitizeBusinessDate(businessDateInput);
  const weekStart = addDays(businessDate, -6);
  const monthStart = `${businessDate.slice(0, 7)}-01`;
  const earliestNeeded = weekStart < monthStart ? weekStart : monthStart;

  const admin = createSupabaseAdminClient();
  const [customersRes, windowDeliveriesRes] = await Promise.all([
    admin
      .from("delivery_customers")
      .select("*")
      .eq("owner_id", ownerId)
      .order("is_active", { ascending: false })
      .order("gallons_held", { ascending: false })
      .order("customer_name", { ascending: true }),
    admin
      .from("deliveries")
      .select("*")
      .eq("owner_id", ownerId)
      .gte("business_date", earliestNeeded)
      .lte("business_date", businessDate)
      .order("created_at", { ascending: false }),
  ]);

  if (
    isMissingCashierSchemaError(customersRes.error) ||
    isMissingCashierSchemaError(windowDeliveriesRes.error)
  ) {
    return {
      businessDate,
      schemaMissing: true,
      customers: [],
      deliveries: [],
      tallies: {
        today: emptyPeriodTally(),
        week: emptyPeriodTally(),
        month: emptyPeriodTally(),
      },
      summary: {
        totalDeliveries: 0,
        totalGallonsOut: 0,
        totalEmptiesIn: 0,
        paidCashTotal: 0,
        paidCashWaterTotal: 0,
        paidCashDeliveryFees: 0,
        paidDigitalTotal: 0,
        unpaidTotal: 0,
        grossActiveTotal: 0,
      },
    };
  }

  const customers: DeliveryCustomerRow[] = (customersRes.data ?? []).map(
    (c) => ({
      ...c,
      default_unit_price: toNumber(c.default_unit_price, DEFAULT_REFILL_PRICE),
    })
  );

  const allWindowRows: DeliveryRow[] = (windowDeliveriesRes.data ?? []).map(
    (d) => ({
      ...d,
      unit_price: toNumber(d.unit_price),
      delivery_fee: toNumber(d.delivery_fee),
      total_amount: toNumber(d.total_amount),
      empty_gallons_returned: Number(d.empty_gallons_returned ?? 0),
    })
  );

  const todayDeliveries = allWindowRows.filter(
    (d) => d.business_date === businessDate
  );

  const todayTally = emptyPeriodTally();
  const weekTally = emptyPeriodTally();
  const monthTally = emptyPeriodTally();

  let paidCashTotal = 0;
  let paidCashDeliveryFees = 0;
  let paidDigitalTotal = 0;
  let unpaidTotal = 0;

  for (const d of allWindowRows) {
    if (d.delivery_status === "cancelled") continue;

    const net = d.empty_gallons_returned - d.quantity;

    if (d.business_date === businessDate) {
      todayTally.count += 1;
      todayTally.gallonsOut += d.quantity;
      todayTally.emptiesIn += d.empty_gallons_returned;
      todayTally.netGallons += net;
      todayTally.totalSales = roundMoney(todayTally.totalSales + d.total_amount);

      if (d.payment_status === "paid") {
        if (d.payment_method === "cash") {
          paidCashTotal += d.total_amount;
          paidCashDeliveryFees += d.delivery_fee;
        } else {
          paidDigitalTotal += d.total_amount;
        }
      } else {
        unpaidTotal += d.total_amount;
      }
    }

    if (d.business_date >= weekStart && d.business_date <= businessDate) {
      weekTally.count += 1;
      weekTally.gallonsOut += d.quantity;
      weekTally.emptiesIn += d.empty_gallons_returned;
      weekTally.netGallons += net;
      weekTally.totalSales = roundMoney(weekTally.totalSales + d.total_amount);
    }

    if (d.business_date >= monthStart && d.business_date <= businessDate) {
      monthTally.count += 1;
      monthTally.gallonsOut += d.quantity;
      monthTally.emptiesIn += d.empty_gallons_returned;
      monthTally.netGallons += net;
      monthTally.totalSales = roundMoney(monthTally.totalSales + d.total_amount);
    }
  }

  const roundedPaidCash = roundMoney(paidCashTotal);
  const roundedPaidFees = roundMoney(paidCashDeliveryFees);
  const roundedPaidWater = roundMoney(
    Math.max(0, roundedPaidCash - roundedPaidFees)
  );

  return {
    businessDate,
    schemaMissing: false,
    customers,
    deliveries: todayDeliveries,
    tallies: {
      today: todayTally,
      week: weekTally,
      month: monthTally,
    },
    summary: {
      totalDeliveries: todayTally.count,
      totalGallonsOut: todayTally.gallonsOut,
      totalEmptiesIn: todayTally.emptiesIn,
      paidCashTotal: roundedPaidCash,
      paidCashWaterTotal: roundedPaidWater,
      paidCashDeliveryFees: roundedPaidFees,
      paidDigitalTotal: roundMoney(paidDigitalTotal),
      unpaidTotal: roundMoney(unpaidTotal),
      grossActiveTotal: roundMoney(
        paidCashTotal + paidDigitalTotal + unpaidTotal
      ),
    },
  };
}

export interface CreateDeliveryInput {
  customerId?: string | null;
  customerName: string;
  customerPhone?: string;
  destination: string;
  orderType: DeliveryOrderType;
  quantity: number;
  emptyGallonsReturned: number;
  unitPrice?: number;
  deliveryFee?: number;
  paymentMethod: DeliveryPaymentMethod;
  paymentStatus: DeliveryPaymentStatus;
  deliveredBy?: string;
  notes?: string;
  saveAsRegularCustomer?: boolean;
  businessDate?: string;
}

export async function createDelivery(
  cashierId: string,
  ownerId: string,
  input: CreateDeliveryInput
): Promise<DeliveryRow> {
  const businessDate = assertOperationalDateAllowed(
    input.businessDate,
    7,
    "Delivery date"
  );
  const customerName = input.customerName.trim();
  const destination = input.destination.trim();
  const quantity = Math.floor(Number(input.quantity));
  const emptyGallonsReturned = Math.max(
    0,
    Math.floor(Number(input.emptyGallonsReturned ?? 0))
  );

  if (!customerName || !destination) {
    throw new AuthServiceError(
      "Customer name and area/address are required",
      400
    );
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new AuthServiceError("Gallons delivered must be at least 1", 400);
  }

  const defaultUnit =
    input.orderType === "gallon_with_water"
      ? DEFAULT_GALLON_WITH_WATER_PRICE
      : DEFAULT_REFILL_PRICE;

  const unitPrice = roundMoney(
    input.unitPrice !== undefined && Number.isFinite(Number(input.unitPrice))
      ? Math.max(0, Number(input.unitPrice))
      : defaultUnit
  );
  const deliveryFee = roundMoney(Math.max(0, Number(input.deliveryFee ?? 0)));
  const totalAmount = roundMoney(unitPrice * quantity + deliveryFee);

  const admin = createSupabaseAdminClient();
  let resolvedCustomerId: string | null = input.customerId || null;

  // Optionally save new patronizing customer in the directory
  if (!resolvedCustomerId && input.saveAsRegularCustomer) {
    const { data: createdCust } = await admin
      .from("delivery_customers")
      .insert({
        owner_id: ownerId,
        customer_name: customerName,
        phone: input.customerPhone?.trim() || null,
        area: destination,
        default_unit_price:
          input.orderType === "refill" ? unitPrice : DEFAULT_REFILL_PRICE,
        gallons_held: 0,
        is_active: true,
      })
      .select("id")
      .single();

    if (createdCust?.id) {
      resolvedCustomerId = createdCust.id;
    }
  }

  // For refills, if fewer empty gallons come back than delivered, the shortage is borrowed gallons
  const newlyBorrowed =
    input.orderType === "refill"
      ? Math.max(0, quantity - emptyGallonsReturned)
      : 0;
  const extraEmptiesReturned =
    input.orderType === "refill"
      ? Math.max(0, emptyGallonsReturned - quantity)
      : emptyGallonsReturned;

  const { data: delivery, error: insErr } = await admin
    .from("deliveries")
    .insert({
      owner_id: ownerId,
      cashier_id: cashierId,
      rider_id: null,
      customer_id: resolvedCustomerId,
      customer_name: customerName,
      customer_phone: input.customerPhone?.trim() || null,
      destination,
      order_type: input.orderType,
      quantity,
      empty_gallons_returned: emptyGallonsReturned,
      unit_price: unitPrice,
      delivery_fee: deliveryFee,
      total_amount: totalAmount,
      payment_method: input.paymentMethod,
      payment_status: input.paymentStatus,
      delivery_status: "delivered",
      borrowed_gallons_count: newlyBorrowed,
      delivered_by: input.deliveredBy?.trim() || null,
      notes: input.notes?.trim() || null,
      business_date: businessDate,
      delivered_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (insErr || !delivery) {
    throw new AuthServiceError(
      insErr?.message ?? "Failed to save delivery",
      500
    );
  }

  // --- Gallon In & Out Inventory Reconciliation ---
  if (input.orderType === "gallon_with_water") {
    await adjustGallonStock({
      ownerId,
      cashierId,
      movementType: "delivery_out",
      quantityDelta: -quantity,
      businessDate,
      referenceId: delivery.id,
      notes: `Delivery sold ${quantity} filled gallon(s) to ${customerName} (${destination})`,
    });

    if (extraEmptiesReturned > 0) {
      await adjustGallonStock({
        ownerId,
        cashierId,
        movementType: "borrow_return",
        quantityDelta: extraEmptiesReturned,
        businessDate,
        referenceId: delivery.id,
        notes: `${customerName} returned ${extraEmptiesReturned} empty gallon(s)`,
      });
    }
  } else {
    // Refill In & Out logic
    if (newlyBorrowed > 0) {
      await admin.from("borrowed_gallons").insert({
        owner_id: ownerId,
        cashier_id: cashierId,
        delivery_id: delivery.id,
        customer_name: customerName,
        customer_phone: input.customerPhone?.trim() || null,
        customer_address: destination,
        qty_borrowed: newlyBorrowed,
        qty_returned: 0,
        deposit_amount: 0,
        status: "borrowed",
        borrowed_date: businessDate,
        notes: `Delivery In/Out: ${quantity} out, ${emptyGallonsReturned} empty returned`,
      });

      await adjustGallonStock({
        ownerId,
        cashierId,
        movementType: "borrow_out",
        quantityDelta: -newlyBorrowed,
        businessDate,
        referenceId: delivery.id,
        notes: `Delivery to ${customerName} (${destination}): ${quantity} out, ${emptyGallonsReturned} empty in`,
      });
    } else if (extraEmptiesReturned > 0) {
      await adjustGallonStock({
        ownerId,
        cashierId,
        movementType: "borrow_return",
        quantityDelta: extraEmptiesReturned,
        businessDate,
        referenceId: delivery.id,
        notes: `Delivery to ${customerName} (${destination}): ${quantity} out, ${emptyGallonsReturned} empty in (+${extraEmptiesReturned} returned)`,
      });

      // Settle open borrowed_gallons records for this customer (oldest first)
      const { data: openBorrows } = await admin
        .from("borrowed_gallons")
        .select("*")
        .eq("owner_id", ownerId)
        .ilike("customer_name", customerName)
        .neq("status", "returned")
        .order("borrowed_date", { ascending: true });

      let creditsLeft = extraEmptiesReturned;
      for (const b of openBorrows ?? []) {
        if (creditsLeft <= 0) break;
        const remaining = b.qty_borrowed - b.qty_returned;
        const apply = Math.min(remaining, creditsLeft);
        const nextReturned = b.qty_returned + apply;
        const complete = nextReturned >= b.qty_borrowed;

        await admin
          .from("borrowed_gallons")
          .update({
            qty_returned: nextReturned,
            status: complete ? "returned" : "partial",
            returned_at: complete ? new Date().toISOString() : null,
          })
          .eq("id", b.id);

        creditsLeft -= apply;
      }
    } else {
      // Exact 1-for-1 swap: log In & Out record with 0 net stock change
      const { data: stockRows } = await admin
        .from("gallon_stock")
        .select("on_hand_qty")
        .eq("owner_id", ownerId);

      const onHandTotal = (stockRows ?? []).reduce(
        (sum, r) => sum + r.on_hand_qty,
        0
      );

      await admin.from("gallon_inventory_logs").insert({
        owner_id: ownerId,
        cashier_id: cashierId,
        movement_type: "delivery_out",
        quantity_delta: 0,
        balance_after: onHandTotal,
        reference_id: delivery.id,
        notes: `Swap delivery to ${customerName} (${destination}): ${quantity} out / ${emptyGallonsReturned} empty in`,
        business_date: businessDate,
      });
    }
  }

  // Update patronizing customer's held-gallon balance if linked
  if (resolvedCustomerId && (newlyBorrowed > 0 || extraEmptiesReturned > 0)) {
    const { data: cust } = await admin
      .from("delivery_customers")
      .select("gallons_held")
      .eq("id", resolvedCustomerId)
      .eq("owner_id", ownerId)
      .maybeSingle();

    if (cust) {
      const nextHeld = Math.max(
        0,
        cust.gallons_held + newlyBorrowed - extraEmptiesReturned
      );
      await admin
        .from("delivery_customers")
        .update({ gallons_held: nextHeld })
        .eq("id", resolvedCustomerId)
        .eq("owner_id", ownerId);
    }
  }

  const totalCents = toCentavos(totalAmount);
  const isPaid = input.paymentStatus === "paid";
  await recordFinancialAuditEvent({
    ownerId,
    businessDate,
    actorId: cashierId,
    module: "delivery",
    eventType: "delivery.created",
    entityType: "delivery",
    entityId: delivery.id,
    referenceLabel: `${customerName} · ${destination}`,
    cashDeltaCentavos: isPaid && input.paymentMethod === "cash" ? totalCents : 0,
    digitalDeltaCentavos:
      isPaid && input.paymentMethod !== "cash" ? totalCents : 0,
    utangDeltaCentavos: !isPaid ? totalCents : 0,
    grossSalesDeltaCentavos: totalCents,
    summary: `Delivery (${quantity} gal) to ${customerName} (${destination}): ${formatCentavosPHP(totalCents)} [${input.paymentMethod.toUpperCase()} / ${input.paymentStatus.toUpperCase()}]`,
    afterSnapshot: {
      customer_name: customerName,
      destination,
      quantity,
      empty_gallons_returned: emptyGallonsReturned,
      unit_price: unitPrice,
      delivery_fee: deliveryFee,
      total_amount: totalAmount,
      payment_method: input.paymentMethod,
      payment_status: input.paymentStatus,
      delivery_status: "delivered",
    },
    metadata: {
      unit_price_centavos: toCentavos(unitPrice),
      delivery_fee_centavos: toCentavos(deliveryFee),
      gallons_out: quantity,
      empties_in: emptyGallonsReturned,
      delivered_by: input.deliveredBy?.trim() || null,
    },
  });

  return {
    ...delivery,
    unit_price: toNumber(delivery.unit_price),
    delivery_fee: toNumber(delivery.delivery_fee),
    total_amount: toNumber(delivery.total_amount),
    empty_gallons_returned: Number(delivery.empty_gallons_returned ?? 0),
  };
}

export async function updateDelivery(
  ownerId: string,
  deliveryId: string,
  patch: {
    paymentStatus?: DeliveryPaymentStatus;
    paymentMethod?: DeliveryPaymentMethod;
    cancelled?: boolean;
    notes?: string;
  },
  actorId?: string
): Promise<DeliveryRow> {
  const admin = createSupabaseAdminClient();
  const { data: before } = await admin
    .from("deliveries")
    .select("*")
    .eq("id", deliveryId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  const updateData: Database["public"]["Tables"]["deliveries"]["Update"] = {};

  if (patch.cancelled) {
    updateData.delivery_status = "cancelled";
  }
  if (patch.paymentStatus) {
    updateData.payment_status = patch.paymentStatus;
  }
  if (patch.paymentMethod) {
    updateData.payment_method = patch.paymentMethod;
  }
  if (patch.notes !== undefined) {
    updateData.notes = patch.notes;
  }

  const { data, error } = await admin
    .from("deliveries")
    .update(updateData)
    .eq("id", deliveryId)
    .eq("owner_id", ownerId)
    .select("*")
    .single();

  if (error || !data) {
    throw new AuthServiceError(error?.message ?? "Delivery not found", 404);
  }

  if (
    before &&
    before.payment_status === "unpaid" &&
    data.payment_status === "paid"
  ) {
    const totalCents = toCentavos(data.total_amount);
    await recordFinancialAuditEvent({
      ownerId,
      businessDate: data.business_date,
      actorId: actorId ?? data.cashier_id,
      module: "delivery",
      eventType: "delivery.payment_settled",
      entityType: "delivery",
      entityId: data.id,
      referenceLabel: `${data.customer_name} · ${data.destination}`,
      cashDeltaCentavos: data.payment_method === "cash" ? totalCents : 0,
      digitalDeltaCentavos: data.payment_method !== "cash" ? totalCents : 0,
      utangDeltaCentavos: -totalCents,
      grossSalesDeltaCentavos: 0,
      summary: `Settled unpaid delivery for ${data.customer_name}: ${formatCentavosPHP(totalCents)} via ${data.payment_method.toUpperCase()}`,
      beforeSnapshot: {
        payment_status: before.payment_status,
        payment_method: before.payment_method,
        total_amount: toNumber(before.total_amount),
      },
      afterSnapshot: {
        payment_status: data.payment_status,
        payment_method: data.payment_method,
        total_amount: toNumber(data.total_amount),
      },
    });
  }

  return {
    ...data,
    unit_price: toNumber(data.unit_price),
    delivery_fee: toNumber(data.delivery_fee),
    total_amount: toNumber(data.total_amount),
    empty_gallons_returned: Number(data.empty_gallons_returned ?? 0),
  };
}

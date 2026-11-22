import "server-only";

import { createSupabaseAdminClient } from "@/backend/db/supabase";
import type {
  Database,
  PosPaymentMethod,
} from "@/backend/db/types";
import { AuthServiceError } from "@/backend/services/auth";
import {
  formatCentavosPHP,
  recordFinancialAuditEvent,
  toCentavos,
} from "@/backend/services/audit-ledger";
import {
  adjustGallonStock,
  ensureStationDefaults,
  isMissingCashierSchemaError,
  roundMoney,
  sanitizeBusinessDate,
  toNumber,
} from "@/backend/services/cashier/shared";

export type PosProductRow = Database["public"]["Tables"]["pos_products"]["Row"];
export type PosSaleRow = Database["public"]["Tables"]["pos_sales"]["Row"];
export type PosSaleItemRow =
  Database["public"]["Tables"]["pos_sale_items"]["Row"];

export interface PosSaleWithItems extends PosSaleRow {
  items: PosSaleItemRow[];
}

export interface PosOverviewResult {
  businessDate: string;
  schemaMissing: boolean;
  products: PosProductRow[];
  sales: PosSaleWithItems[];
  summary: {
    completedCount: number;
    voidedCount: number;
    cashTotal: number;
    digitalTotal: number;
    utangTotal: number;
    grossTotal: number;
    gallonsSold: number;
  };
}

export async function listPosOverview(
  ownerId: string,
  businessDateInput?: string
): Promise<PosOverviewResult> {
  const businessDate = sanitizeBusinessDate(businessDateInput);
  const { schemaMissing } = await ensureStationDefaults(ownerId);

  if (schemaMissing) {
    return {
      businessDate,
      schemaMissing: true,
      products: [],
      sales: [],
      summary: {
        completedCount: 0,
        voidedCount: 0,
        cashTotal: 0,
        digitalTotal: 0,
        utangTotal: 0,
        grossTotal: 0,
        gallonsSold: 0,
      },
    };
  }

  const admin = createSupabaseAdminClient();
  const [productsRes, salesRes] = await Promise.all([
    admin
      .from("pos_products")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("is_active", true)
      .order("unit_price", { ascending: true })
      .order("name", { ascending: true }),
    admin
      .from("pos_sales")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("business_date", businessDate)
      .order("created_at", { ascending: false }),
  ]);

  if (
    isMissingCashierSchemaError(productsRes.error) ||
    isMissingCashierSchemaError(salesRes.error)
  ) {
    return {
      businessDate,
      schemaMissing: true,
      products: [],
      sales: [],
      summary: {
        completedCount: 0,
        voidedCount: 0,
        cashTotal: 0,
        digitalTotal: 0,
        utangTotal: 0,
        grossTotal: 0,
        gallonsSold: 0,
      },
    };
  }

  const salesRows = salesRes.data ?? [];
  const saleIds = salesRows.map((s) => s.id);
  const itemsBySale = new Map<string, PosSaleItemRow[]>();

  if (saleIds.length > 0) {
    const { data: itemsData } = await admin
      .from("pos_sale_items")
      .select("*")
      .in("sale_id", saleIds);

    for (const item of itemsData ?? []) {
      const list = itemsBySale.get(item.sale_id) ?? [];
      list.push(item);
      itemsBySale.set(item.sale_id, list);
    }
  }

  const sales: PosSaleWithItems[] = salesRows.map((s) => ({
    ...s,
    subtotal: toNumber(s.subtotal),
    discount: toNumber(s.discount),
    total_amount: toNumber(s.total_amount),
    amount_tendered: toNumber(s.amount_tendered),
    change_amount: toNumber(s.change_amount),
    items: (itemsBySale.get(s.id) ?? []).map((item) => ({
      ...item,
      unit_price: toNumber(item.unit_price),
      line_total: toNumber(item.line_total),
    })),
  }));

  let completedCount = 0;
  let voidedCount = 0;
  let cashTotal = 0;
  let digitalTotal = 0;
  let utangTotal = 0;
  let gallonsSold = 0;

  for (const sale of sales) {
    if (sale.status === "voided") {
      voidedCount += 1;
      continue;
    }
    completedCount += 1;
    if (sale.payment_method === "cash") {
      cashTotal += sale.total_amount;
    } else if (sale.payment_method === "utang") {
      utangTotal += sale.total_amount;
    } else {
      digitalTotal += sale.total_amount;
    }
    for (const item of sale.items) {
      if (item.category === "refill" || item.category === "container") {
        gallonsSold += item.quantity;
      }
    }
  }

  // Deduplicate active products by name (earliest row wins) as defense-in-depth
  const seenNames = new Set<string>();
  const uniqueProducts: PosProductRow[] = [];
  for (const p of productsRes.data ?? []) {
    const key = p.name.trim().toLowerCase();
    if (seenNames.has(key)) continue;
    seenNames.add(key);
    uniqueProducts.push({
      ...p,
      unit_price: toNumber(p.unit_price),
    });
  }

  return {
    businessDate,
    schemaMissing: false,
    products: uniqueProducts,
    sales,
    summary: {
      completedCount,
      voidedCount,
      cashTotal: roundMoney(cashTotal),
      digitalTotal: roundMoney(digitalTotal),
      utangTotal: roundMoney(utangTotal),
      grossTotal: roundMoney(cashTotal + digitalTotal + utangTotal),
      gallonsSold,
    },
  };
}

export interface CreateWalkInSaleInput {
  items: { productId: string; quantity: number }[];
  paymentMethod: PosPaymentMethod;
  amountTendered?: number;
  discount?: number;
  customerName?: string;
  notes?: string;
  businessDate?: string;
}

export async function createWalkInSale(
  cashierId: string,
  ownerId: string,
  input: CreateWalkInSaleInput
): Promise<PosSaleWithItems> {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new AuthServiceError("Add at least one item to complete a sale", 400);
  }

  const businessDate = sanitizeBusinessDate(input.businessDate);
  const admin = createSupabaseAdminClient();

  const productIds = Array.from(new Set(input.items.map((i) => i.productId)));
  const { data: products, error: prodErr } = await admin
    .from("pos_products")
    .select("*")
    .eq("owner_id", ownerId)
    .in("id", productIds);

  if (prodErr || !products || products.length === 0) {
    throw new AuthServiceError("Selected products were not found", 400);
  }

  const productMap = new Map(products.map((p) => [p.id, p]));
  const preparedItems: {
    product_id: string;
    product_name: string;
    category: PosProductRow["category"];
    gallon_type: null;
    quantity: number;
    unit_price: number;
    line_total: number;
  }[] = [];

  let subtotal = 0;

  for (const reqItem of input.items) {
    const qty = Math.floor(Number(reqItem.quantity));
    if (!Number.isFinite(qty) || qty <= 0 || qty > 500) {
      throw new AuthServiceError("Invalid item quantity", 400);
    }
    const product = productMap.get(reqItem.productId);
    if (!product) {
      throw new AuthServiceError("Invalid product in cart", 400);
    }
    const unitPrice = roundMoney(toNumber(product.unit_price));
    const lineTotal = roundMoney(unitPrice * qty);
    subtotal += lineTotal;

    preparedItems.push({
      product_id: product.id,
      product_name: product.name,
      category: product.category,
      gallon_type: null,
      quantity: qty,
      unit_price: unitPrice,
      line_total: lineTotal,
    });
  }

  subtotal = roundMoney(subtotal);
  const discount = roundMoney(Math.max(0, Number(input.discount ?? 0)));
  if (discount > subtotal) {
    throw new AuthServiceError("Discount cannot exceed subtotal", 400);
  }
  const totalAmount = roundMoney(subtotal - discount);

  const amountTendered =
    input.paymentMethod === "cash"
      ? roundMoney(Number(input.amountTendered ?? totalAmount))
      : input.paymentMethod === "utang"
        ? 0
        : totalAmount;

  if (input.paymentMethod === "cash" && amountTendered < totalAmount) {
    throw new AuthServiceError(
      `Amount tendered (₱${amountTendered.toFixed(2)}) is less than total (₱${totalAmount.toFixed(2)})`,
      400
    );
  }

  const changeAmount =
    input.paymentMethod === "cash"
      ? roundMoney(Math.max(0, amountTendered - totalAmount))
      : 0;

  const datePart = businessDate.replace(/-/g, "");
  const suffix = Math.floor(1000 + Math.random() * 9000);
  const receiptNo = `OR-${datePart}-${suffix}`;

  const { data: sale, error: saleErr } = await admin
    .from("pos_sales")
    .insert({
      owner_id: ownerId,
      cashier_id: cashierId,
      receipt_no: receiptNo,
      customer_name: input.customerName?.trim() || null,
      payment_method: input.paymentMethod,
      subtotal,
      discount,
      total_amount: totalAmount,
      amount_tendered: amountTendered,
      change_amount: changeAmount,
      status: "completed",
      notes: input.notes?.trim() || null,
      business_date: businessDate,
    })
    .select("*")
    .single();

  if (saleErr || !sale) {
    throw new AuthServiceError(
      saleErr?.message ?? "Failed to save walk-in sale",
      500
    );
  }

  const { data: insertedItems, error: itemsErr } = await admin
    .from("pos_sale_items")
    .insert(
      preparedItems.map((item) => ({
        sale_id: sale.id,
        ...item,
      }))
    )
    .select("*");

  if (itemsErr) {
    throw new AuthServiceError(itemsErr.message, 500);
  }

  // Deduct station container stock when selling new "Gallon Filled with Water" containers
  for (const item of preparedItems) {
    if (item.category === "container") {
      await adjustGallonStock({
        ownerId,
        cashierId,
        gallonType: "slim",
        movementType: "walkin_out",
        quantityDelta: -item.quantity,
        businessDate,
        referenceId: sale.id,
        notes: `Walk-in sale ${receiptNo} (${item.product_name})`,
      });
    }
  }

  const totalCents = toCentavos(totalAmount);
  const cashCents = input.paymentMethod === "cash" ? totalCents : 0;
  const digitalCents =
    input.paymentMethod === "gcash" || input.paymentMethod === "bank"
      ? totalCents
      : 0;
  const utangCents = input.paymentMethod === "utang" ? totalCents : 0;

  await recordFinancialAuditEvent({
    ownerId,
    businessDate,
    actorId: cashierId,
    module: "pos",
    eventType: "pos.sale.created",
    entityType: "pos_sale",
    entityId: sale.id,
    referenceLabel: `${receiptNo} · ${input.customerName?.trim() || "Walk-in"}`,
    cashDeltaCentavos: cashCents,
    digitalDeltaCentavos: digitalCents,
    utangDeltaCentavos: utangCents,
    grossSalesDeltaCentavos: totalCents,
    summary: `Walk-in ${input.paymentMethod.toUpperCase()} sale ${receiptNo}: ${formatCentavosPHP(totalCents)}${discount > 0 ? ` (discount ${formatCentavosPHP(toCentavos(discount))})` : ""}`,
    afterSnapshot: {
      receipt_no: receiptNo,
      customer_name: input.customerName?.trim() || null,
      payment_method: input.paymentMethod,
      subtotal,
      discount,
      total_amount: totalAmount,
      amount_tendered: amountTendered,
      change_amount: changeAmount,
      status: "completed",
    },
    metadata: {
      subtotal_centavos: toCentavos(subtotal),
      discount_centavos: toCentavos(discount),
      tendered_centavos: toCentavos(amountTendered),
      change_centavos: toCentavos(changeAmount),
      items: preparedItems.map((i) => ({
        name: i.product_name,
        qty: i.quantity,
        unit_price: i.unit_price,
        line_total: i.line_total,
      })),
    },
  });

  return {
    ...sale,
    subtotal: toNumber(sale.subtotal),
    discount: toNumber(sale.discount),
    total_amount: toNumber(sale.total_amount),
    amount_tendered: toNumber(sale.amount_tendered),
    change_amount: toNumber(sale.change_amount),
    items: (insertedItems ?? []).map((item) => ({
      ...item,
      unit_price: toNumber(item.unit_price),
      line_total: toNumber(item.line_total),
    })),
  };
}

export async function voidWalkInSale(
  ownerId: string,
  saleId: string,
  reason?: string,
  actorId?: string
): Promise<PosSaleRow> {
  const admin = createSupabaseAdminClient();
  const { data: existing, error: fetchErr } = await admin
    .from("pos_sales")
    .select("*")
    .eq("id", saleId)
    .eq("owner_id", ownerId)
    .single();

  if (fetchErr || !existing) {
    throw new AuthServiceError("Sale record not found", 404);
  }

  if (existing.status === "voided") {
    return existing;
  }

  const voidNote = reason?.trim()
    ? `${existing.notes ? `${existing.notes} | ` : ""}VOIDED: ${reason.trim()}`
    : existing.notes;

  const { data: updated, error: updErr } = await admin
    .from("pos_sales")
    .update({ status: "voided", notes: voidNote })
    .eq("id", saleId)
    .eq("owner_id", ownerId)
    .select("*")
    .single();

  if (updErr || !updated) {
    throw new AuthServiceError(updErr?.message ?? "Failed to void sale", 500);
  }

  const totalCents = toCentavos(existing.total_amount);
  await recordFinancialAuditEvent({
    ownerId,
    businessDate: existing.business_date,
    actorId: actorId ?? existing.cashier_id,
    module: "pos",
    eventType: "pos.sale.voided",
    entityType: "pos_sale",
    entityId: existing.id,
    referenceLabel: `${existing.receipt_no} · ${existing.customer_name || "Walk-in"}`,
    cashDeltaCentavos: existing.payment_method === "cash" ? -totalCents : 0,
    digitalDeltaCentavos:
      existing.payment_method === "gcash" || existing.payment_method === "bank"
        ? -totalCents
        : 0,
    utangDeltaCentavos: existing.payment_method === "utang" ? -totalCents : 0,
    grossSalesDeltaCentavos: -totalCents,
    summary: `Voided Walk-in ${existing.payment_method.toUpperCase()} sale ${existing.receipt_no} (-${formatCentavosPHP(totalCents)})${reason?.trim() ? ` · Reason: ${reason.trim()}` : ""}`,
    beforeSnapshot: {
      receipt_no: existing.receipt_no,
      payment_method: existing.payment_method,
      total_amount: toNumber(existing.total_amount),
      status: existing.status,
    },
    afterSnapshot: {
      receipt_no: updated.receipt_no,
      payment_method: updated.payment_method,
      total_amount: toNumber(updated.total_amount),
      status: "voided",
    },
    metadata: { reason: reason?.trim() || "Voided by cashier" },
  });

  return updated;
}

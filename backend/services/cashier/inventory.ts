import "server-only";

import { createSupabaseAdminClient } from "@/backend/db/supabase";
import type { Database, GallonMovementType } from "@/backend/db/types";
import { AuthServiceError } from "@/backend/services/auth";
import {
  formatCentavosPHP,
  recordFinancialAuditEvent,
  toCentavos,
} from "@/backend/services/audit-ledger";
import {
  adjustGallonStock,
  assertOperationalDateAllowed,
  ensureStationDefaults,
  isMissingCashierSchemaError,
  roundMoney,
  sanitizeBusinessDate,
  toNumber,
} from "@/backend/services/cashier/shared";

export type GallonStockRow =
  Database["public"]["Tables"]["gallon_stock"]["Row"];
export type GallonInventoryLogRow =
  Database["public"]["Tables"]["gallon_inventory_logs"]["Row"];
export type BorrowedGallonRow =
  Database["public"]["Tables"]["borrowed_gallons"]["Row"];

export interface InventoryOverviewResult {
  businessDate: string;
  schemaMissing: boolean;
  stock: GallonStockRow[];
  logs: GallonInventoryLogRow[];
  borrowedGallons: BorrowedGallonRow[];
  summary: {
    totalOnHand: number;
    totalDamaged: number;
    currentlyBorrowedOut: number;
    activeBorrowers: number;
  };
}

export async function getInventoryOverview(
  ownerId: string,
  businessDateInput?: string
): Promise<InventoryOverviewResult> {
  const businessDate = sanitizeBusinessDate(businessDateInput);
  const { schemaMissing } = await ensureStationDefaults(ownerId);

  if (schemaMissing) {
    return {
      businessDate,
      schemaMissing: true,
      stock: [],
      logs: [],
      borrowedGallons: [],
      summary: {
        totalOnHand: 0,
        totalDamaged: 0,
        currentlyBorrowedOut: 0,
        activeBorrowers: 0,
      },
    };
  }

  const admin = createSupabaseAdminClient();
  const [stockRes, logsRes, borrowedRes] = await Promise.all([
    admin.from("gallon_stock").select("*").eq("owner_id", ownerId),
    admin
      .from("gallon_inventory_logs")
      .select("*")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("borrowed_gallons")
      .select("*")
      .eq("owner_id", ownerId)
      .order("status", { ascending: true })
      .order("borrowed_date", { ascending: false })
      .limit(100),
  ]);

  if (
    isMissingCashierSchemaError(stockRes.error) ||
    isMissingCashierSchemaError(logsRes.error) ||
    isMissingCashierSchemaError(borrowedRes.error)
  ) {
    return {
      businessDate,
      schemaMissing: true,
      stock: [],
      logs: [],
      borrowedGallons: [],
      summary: {
        totalOnHand: 0,
        totalDamaged: 0,
        currentlyBorrowedOut: 0,
        activeBorrowers: 0,
      },
    };
  }

  const stock = stockRes.data ?? [];
  const borrowedGallons: BorrowedGallonRow[] = (borrowedRes.data ?? []).map(
    (b) => ({
      ...b,
      deposit_amount: toNumber(b.deposit_amount),
    })
  );

  const totalOnHand = stock.reduce((sum, s) => sum + s.on_hand_qty, 0);
  const totalDamaged = stock.reduce((sum, s) => sum + s.damaged_qty, 0);

  let currentlyBorrowedOut = 0;
  let activeBorrowers = 0;
  for (const b of borrowedGallons) {
    const remaining = Math.max(0, b.qty_borrowed - b.qty_returned);
    if (b.status !== "returned" && remaining > 0) {
      currentlyBorrowedOut += remaining;
      activeBorrowers += 1;
    }
  }

  return {
    businessDate,
    schemaMissing: false,
    stock,
    logs: logsRes.data ?? [],
    borrowedGallons,
    summary: {
      totalOnHand,
      totalDamaged,
      currentlyBorrowedOut,
      activeBorrowers,
    },
  };
}

export async function recordManualStockMovement(
  actorId: string,
  ownerId: string,
  input: {
    movementType: Extract<
      GallonMovementType,
      "restock" | "damaged" | "adjustment"
    >;
    quantity: number;
    notes?: string;
    businessDate?: string;
  }
) {
  const businessDate = assertOperationalDateAllowed(
    input.businessDate,
    7,
    "Stock date"
  );
  const rawQty = Math.trunc(Number(input.quantity));

  if (!Number.isFinite(rawQty) || rawQty === 0) {
    throw new AuthServiceError("Quantity must be a non-zero whole number", 400);
  }

  let quantityDelta = rawQty;
  let incrementDamaged = 0;

  if (input.movementType === "restock") {
    quantityDelta = Math.abs(rawQty);
  } else if (input.movementType === "damaged") {
    quantityDelta = -Math.abs(rawQty);
    incrementDamaged = Math.abs(rawQty);
  }

  return adjustGallonStock({
    ownerId,
    cashierId: actorId,
    movementType: input.movementType,
    quantityDelta,
    incrementDamaged,
    businessDate,
    notes: input.notes?.trim() || null,
  });
}

export async function createBorrowedGallonRecord(
  actorId: string,
  ownerId: string,
  input: {
    customerName: string;
    customerPhone?: string;
    customerAddress?: string;
    qtyBorrowed: number;
    depositAmount?: number;
    notes?: string;
    businessDate?: string;
  }
): Promise<BorrowedGallonRow> {
  const businessDate = assertOperationalDateAllowed(
    input.businessDate,
    7,
    "Borrow date"
  );
  const customerName = input.customerName.trim();
  const qtyBorrowed = Math.floor(Number(input.qtyBorrowed));

  if (!customerName) {
    throw new AuthServiceError("Customer name is required", 400);
  }
  if (!Number.isFinite(qtyBorrowed) || qtyBorrowed <= 0) {
    throw new AuthServiceError("Quantity borrowed must be at least 1", 400);
  }

  const depositAmount = roundMoney(Math.max(0, Number(input.depositAmount ?? 0)));
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("borrowed_gallons")
    .insert({
      owner_id: ownerId,
      cashier_id: actorId,
      customer_name: customerName,
      customer_phone: input.customerPhone?.trim() || null,
      customer_address: input.customerAddress?.trim() || null,
      qty_borrowed: qtyBorrowed,
      qty_returned: 0,
      deposit_amount: depositAmount,
      status: "borrowed",
      borrowed_date: businessDate,
      notes: input.notes?.trim() || null,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new AuthServiceError(
      error?.message ?? "Failed to record borrowed gallons",
      500
    );
  }

  await adjustGallonStock({
    ownerId,
    cashierId: actorId,
    movementType: "borrow_out",
    quantityDelta: -qtyBorrowed,
    businessDate,
    referenceId: data.id,
    notes: `Borrowed by ${customerName}${input.customerAddress ? ` (${input.customerAddress})` : ""}`,
  });

  if (depositAmount > 0) {
    const depCents = toCentavos(depositAmount);
    await recordFinancialAuditEvent({
      ownerId,
      businessDate,
      actorId,
      module: "inventory",
      eventType: "borrow.deposit_received",
      entityType: "borrowed_gallon",
      entityId: data.id,
      referenceLabel: `${customerName} (${qtyBorrowed} gal)`,
      summary: `Recorded ${formatCentavosPHP(depCents)} container deposit for ${qtyBorrowed} borrowed gallon(s) by ${customerName}`,
      afterSnapshot: {
        customer_name: customerName,
        qty_borrowed: qtyBorrowed,
        deposit_amount: depositAmount,
      },
      metadata: { deposit_centavos: depCents },
    });
  }

  return {
    ...data,
    deposit_amount: toNumber(data.deposit_amount),
  };
}

export async function returnBorrowedGallons(
  actorId: string,
  ownerId: string,
  borrowId: string,
  qtyToReturn: number,
  businessDateInput?: string
): Promise<BorrowedGallonRow> {
  const businessDate = assertOperationalDateAllowed(
    businessDateInput,
    7,
    "Return date"
  );
  const returnQty = Math.floor(Number(qtyToReturn));

  if (!Number.isFinite(returnQty) || returnQty <= 0) {
    throw new AuthServiceError("Return quantity must be at least 1", 400);
  }

  const admin = createSupabaseAdminClient();
  const { data: existing, error: fetchErr } = await admin
    .from("borrowed_gallons")
    .select("*")
    .eq("id", borrowId)
    .eq("owner_id", ownerId)
    .single();

  if (fetchErr || !existing) {
    throw new AuthServiceError("Borrowed gallon record not found", 404);
  }

  const remaining = existing.qty_borrowed - existing.qty_returned;
  if (remaining <= 0) {
    throw new AuthServiceError("All gallons have already been returned", 400);
  }
  if (returnQty > remaining) {
    throw new AuthServiceError(
      `Cannot return ${returnQty}; only ${remaining} gallon(s) remaining`,
      400
    );
  }

  const nextReturned = existing.qty_returned + returnQty;
  const isComplete = nextReturned >= existing.qty_borrowed;

  const { data: updated, error: updErr } = await admin
    .from("borrowed_gallons")
    .update({
      qty_returned: nextReturned,
      status: isComplete ? "returned" : "partial",
      returned_at: isComplete ? new Date().toISOString() : null,
    })
    .eq("id", borrowId)
    .eq("owner_id", ownerId)
    .select("*")
    .single();

  if (updErr || !updated) {
    throw new AuthServiceError(
      updErr?.message ?? "Failed to update borrowed gallon return",
      500
    );
  }

  await adjustGallonStock({
    ownerId,
    cashierId: actorId,
    movementType: "borrow_return",
    quantityDelta: returnQty,
    businessDate,
    referenceId: borrowId,
    notes: `Returned by ${existing.customer_name} (${nextReturned}/${existing.qty_borrowed})`,
  });

  return {
    ...updated,
    deposit_amount: toNumber(updated.deposit_amount),
  };
}

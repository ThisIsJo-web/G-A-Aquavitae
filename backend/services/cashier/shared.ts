import "server-only";

import { createSupabaseAdminClient } from "@/backend/db/supabase";
import type { GallonMovementType, GallonType } from "@/backend/db/types";

export const DEFAULT_REFILL_PRICE = 20;
export const DEFAULT_GALLON_WITH_WATER_PRICE = 160;

export function getTodayBusinessDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function sanitizeBusinessDate(input?: string | null): string {
  if (input && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return input;
  }
  return getTodayBusinessDate();
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function toNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function isMissingCashierSchemaError(
  error: { code?: string; message?: string } | null | undefined
): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    Boolean(
      error.message?.match(
        /pos_products|pos_sales|riders|delivery_customers|deliveries|empty_gallons_returned|vendo_collections|gallon_stock|borrowed_gallons|shift_closings/i
      )
    )
  );
}

const DEFAULT_PRODUCTS = [
  {
    name: "Refill",
    category: "refill" as const,
    unit_price: DEFAULT_REFILL_PRICE,
  },
  {
    name: "Gallon Filled with Water",
    category: "container" as const,
    unit_price: DEFAULT_GALLON_WITH_WATER_PRICE,
  },
];

// Deduplicate concurrent ensureStationDefaults() calls per owner within the same Node process
const inFlightDefaults = new Map<string, Promise<{ schemaMissing: boolean }>>();

/**
 * Lazily seeds default walk-in products (Refill ₱20, Gallon Filled with Water ₱160)
 * and initial stock rows for a station on first access, protected against
 * concurrent Promise.all race conditions.
 */
export function ensureStationDefaults(
  ownerId: string
): Promise<{ schemaMissing: boolean }> {
  const existing = inFlightDefaults.get(ownerId);
  if (existing) return existing;

  const task = runEnsureStationDefaults(ownerId).finally(() => {
    inFlightDefaults.delete(ownerId);
  });
  inFlightDefaults.set(ownerId, task);
  return task;
}

async function runEnsureStationDefaults(
  ownerId: string
): Promise<{ schemaMissing: boolean }> {
  const admin = createSupabaseAdminClient();

  const [productsRes, stockRes] = await Promise.all([
    admin
      .from("pos_products")
      .select("name")
      .eq("owner_id", ownerId),
    admin
      .from("gallon_stock")
      .select("gallon_type")
      .eq("owner_id", ownerId),
  ]);

  if (
    isMissingCashierSchemaError(productsRes.error) ||
    isMissingCashierSchemaError(stockRes.error)
  ) {
    return { schemaMissing: true };
  }

  const tasks: PromiseLike<unknown>[] = [];

  const existingNames = new Set(
    (productsRes.data ?? []).map((p) => p.name.trim().toLowerCase())
  );
  const missingProducts = DEFAULT_PRODUCTS.filter(
    (p) => !existingNames.has(p.name.toLowerCase())
  );

  if (missingProducts.length > 0) {
    tasks.push(
      (async () => {
        const rows = missingProducts.map((p) => ({
          owner_id: ownerId,
          ...p,
        }));
        const upsertRes = await admin
          .from("pos_products")
          .upsert(rows, { onConflict: "owner_id,name", ignoreDuplicates: true });

        // Fallback if uq_pos_products_owner_name constraint (Section 12f) hasn't been applied yet
        if (upsertRes.error?.code === "42P10") {
          await admin.from("pos_products").insert(rows);
        }
      })()
    );
  }

  const existingTypes = new Set((stockRes.data ?? []).map((r) => r.gallon_type));
  const missingStockTypes: GallonType[] = (["slim", "round"] as const).filter(
    (t) => !existingTypes.has(t)
  );

  if (missingStockTypes.length > 0) {
    tasks.push(
      admin.from("gallon_stock").upsert(
        missingStockTypes.map((gallon_type) => ({
          owner_id: ownerId,
          gallon_type,
          on_hand_qty: 0,
          damaged_qty: 0,
        })),
        { onConflict: "owner_id,gallon_type" }
      )
    );
  }

  if (tasks.length > 0) {
    await Promise.all(tasks);
  }

  return { schemaMissing: false };
}

/**
 * Updates gallon_stock for a station and appends an immutable movement audit row.
 */
export async function adjustGallonStock(params: {
  ownerId: string;
  cashierId: string;
  gallonType: GallonType;
  movementType: GallonMovementType;
  quantityDelta: number;
  businessDate: string;
  referenceId?: string | null;
  notes?: string | null;
  incrementDamaged?: number;
}): Promise<{ balanceAfter: number } | null> {
  if (params.quantityDelta === 0 && !params.incrementDamaged) {
    return null;
  }

  const admin = createSupabaseAdminClient();
  const { data: current } = await admin
    .from("gallon_stock")
    .select("on_hand_qty, damaged_qty")
    .eq("owner_id", params.ownerId)
    .eq("gallon_type", params.gallonType)
    .maybeSingle();

  const currentOnHand = current?.on_hand_qty ?? 0;
  const currentDamaged = current?.damaged_qty ?? 0;
  const nextOnHand = Math.max(0, currentOnHand + params.quantityDelta);
  const nextDamaged = Math.max(
    0,
    currentDamaged + (params.incrementDamaged ?? 0)
  );

  await admin.from("gallon_stock").upsert(
    {
      owner_id: params.ownerId,
      gallon_type: params.gallonType,
      on_hand_qty: nextOnHand,
      damaged_qty: nextDamaged,
    },
    { onConflict: "owner_id,gallon_type" }
  );

  await admin.from("gallon_inventory_logs").insert({
    owner_id: params.ownerId,
    cashier_id: params.cashierId,
    gallon_type: params.gallonType,
    movement_type: params.movementType,
    quantity_delta: params.quantityDelta,
    balance_after: nextOnHand,
    reference_id: params.referenceId ?? null,
    notes: params.notes ?? null,
    business_date: params.businessDate,
  });

  return { balanceAfter: nextOnHand };
}

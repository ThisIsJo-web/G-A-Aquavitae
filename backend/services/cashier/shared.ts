import "server-only";

import { createSupabaseAdminClient } from "@/backend/db/supabase";
import type { GallonMovementType } from "@/backend/db/types";
import { AuthServiceError } from "@/backend/services/auth";

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

export function addIsoDays(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

export function sanitizeBusinessDate(input?: string | null): string {
  if (input && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return input;
  }
  return getTodayBusinessDate();
}

/**
 * Clamps a date for read/filter queries (never future, never older than maxPastDays).
 */
export function clampDateToWindow(
  input: string | null | undefined,
  maxPastDays: number
): string {
  const today = getTodayBusinessDate();
  const minDate = addIsoDays(today, -maxPastDays);
  const clean = sanitizeBusinessDate(input);
  if (clean > today) return today;
  if (clean < minDate) return minDate;
  return clean;
}

/**
 * Strictly validates operational write dates: blocks all future dates and dates
 * older than `maxPastDays` (default 7 days for Cashier, 30 days for Owner expenses).
 */
export function assertOperationalDateAllowed(
  input: string | null | undefined,
  maxPastDays = 7,
  label = "Date"
): string {
  const today = getTodayBusinessDate();
  const minDate = addIsoDays(today, -maxPastDays);
  const date = sanitizeBusinessDate(input);

  if (date > today) {
    throw new AuthServiceError(
      `${label} cannot be in the future (latest allowed: ${today}).`,
      400
    );
  }
  if (date < minDate) {
    throw new AuthServiceError(
      `${label} cannot be older than ${maxPastDays} days (earliest allowed: ${minDate}).`,
      400
    );
  }

  return date;
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

// Cache verified stations in memory so repeated requests pay 0 DB queries
const seededOwners = new Set<string>();
const inFlightDefaults = new Map<string, Promise<{ schemaMissing: boolean }>>();

/**
 * Lazily seeds default walk-in products (Refill ₱20, Gallon Filled with Water ₱160)
 * and a single station stock row on first access, cached per-process.
 */
export function ensureStationDefaults(
  ownerId: string
): Promise<{ schemaMissing: boolean }> {
  if (seededOwners.has(ownerId)) {
    return Promise.resolve({ schemaMissing: false });
  }

  const existing = inFlightDefaults.get(ownerId);
  if (existing) return existing;

  const task = runEnsureStationDefaults(ownerId)
    .then((result) => {
      if (!result.schemaMissing) {
        seededOwners.add(ownerId);
      }
      return result;
    })
    .finally(() => {
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
    admin.from("pos_products").select("name").eq("owner_id", ownerId),
    admin.from("gallon_stock").select("id").eq("owner_id", ownerId).limit(1),
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

        if (upsertRes.error?.code === "42P10") {
          await admin.from("pos_products").insert(rows);
        }
      })()
    );
  }

  if ((stockRes.data ?? []).length === 0) {
    tasks.push(
      (async () => {
        const upsertRes = await admin.from("gallon_stock").upsert(
          {
            owner_id: ownerId,
            on_hand_qty: 0,
            damaged_qty: 0,
          },
          { onConflict: "owner_id" }
        );
        if (upsertRes.error?.code === "42P10") {
          await admin.from("gallon_stock").insert({
            owner_id: ownerId,
            on_hand_qty: 0,
            damaged_qty: 0,
          });
        }
      })()
    );
  }

  if (tasks.length > 0) {
    await Promise.all(tasks);
  }

  return { schemaMissing: false };
}

/**
 * Updates gallon_stock for a station (single row per owner) and appends a movement log row.
 */
export async function adjustGallonStock(params: {
  ownerId: string;
  cashierId: string;
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
  const { data: rows } = await admin
    .from("gallon_stock")
    .select("id, on_hand_qty, damaged_qty")
    .eq("owner_id", params.ownerId)
    .order("updated_at", { ascending: false })
    .limit(5);

  const currentOnHand = (rows ?? []).reduce((s, r) => s + r.on_hand_qty, 0);
  const currentDamaged = (rows ?? []).reduce((s, r) => s + r.damaged_qty, 0);
  const nextOnHand = Math.max(0, currentOnHand + params.quantityDelta);
  const nextDamaged = Math.max(
    0,
    currentDamaged + (params.incrementDamaged ?? 0)
  );

  const primaryRow = rows?.[0];
  if (primaryRow) {
    await admin
      .from("gallon_stock")
      .update({
        on_hand_qty: nextOnHand,
        damaged_qty: nextDamaged,
      })
      .eq("id", primaryRow.id);
  } else {
    const upsertRes = await admin.from("gallon_stock").upsert(
      {
        owner_id: params.ownerId,
        on_hand_qty: nextOnHand,
        damaged_qty: nextDamaged,
      },
      { onConflict: "owner_id" }
    );
    if (upsertRes.error?.code === "42P10") {
      await admin.from("gallon_stock").insert({
        owner_id: params.ownerId,
        on_hand_qty: nextOnHand,
        damaged_qty: nextDamaged,
      });
    }
  }

  await admin.from("gallon_inventory_logs").insert({
    owner_id: params.ownerId,
    cashier_id: params.cashierId,
    movement_type: params.movementType,
    quantity_delta: params.quantityDelta,
    balance_after: nextOnHand,
    reference_id: params.referenceId ?? null,
    notes: params.notes ?? null,
    business_date: params.businessDate,
  });

  return { balanceAfter: nextOnHand };
}

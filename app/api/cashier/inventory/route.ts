import { NextResponse } from "next/server";
import type { GallonType } from "@/backend/db/types";
import { handleApiError, parseJsonBody } from "@/backend/lib/http";
import { requireCashierAccess } from "@/backend/services/auth-guards";
import {
  getInventoryOverview,
  recordManualStockMovement,
} from "@/backend/services/cashier/inventory";

export async function GET(request: Request) {
  try {
    const { tenantOwnerId } = await requireCashierAccess();
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") ?? undefined;
    const overview = await getInventoryOverview(tenantOwnerId, date);

    return NextResponse.json(overview, {
      status: 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return handleApiError(error, { route: "/api/cashier/inventory" });
  }
}

interface StockMovementBody {
  gallonType?: unknown;
  movementType?: unknown;
  quantity?: unknown;
  notes?: unknown;
  businessDate?: unknown;
}

export async function POST(request: Request) {
  try {
    const { profile, tenantOwnerId } = await requireCashierAccess();
    const body = await parseJsonBody<StockMovementBody>(request);

    if (
      !body ||
      (body.movementType !== "restock" &&
        body.movementType !== "damaged" &&
        body.movementType !== "adjustment") ||
      !Number.isFinite(Number(body.quantity))
    ) {
      return NextResponse.json(
        {
          error:
            "Valid action (restock, damaged, or adjustment) and quantity are required",
        },
        { status: 400 }
      );
    }

    const gallonType: GallonType =
      body.gallonType === "round" ? "round" : "slim";

    const result = await recordManualStockMovement(profile.id, tenantOwnerId, {
      gallonType,
      movementType: body.movementType,
      quantity: Number(body.quantity),
      notes: typeof body.notes === "string" ? body.notes : undefined,
      businessDate:
        typeof body.businessDate === "string" ? body.businessDate : undefined,
    });

    return NextResponse.json(
      { result },
      { status: 201, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return handleApiError(error, { route: "/api/cashier/inventory" });
  }
}

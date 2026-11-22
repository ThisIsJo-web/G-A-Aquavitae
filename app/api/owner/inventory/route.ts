import { NextResponse } from "next/server";
import {
  extractRequestMeta,
  handleApiError,
  parseJsonBody,
} from "@/backend/lib/http";
import { scheduleActivityLog } from "@/backend/services/activity-logs";
import { requireOwnerAccess } from "@/backend/services/auth-guards";
import {
  getInventoryOverview,
  recordManualStockMovement,
} from "@/backend/services/cashier/inventory";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { tenantOwnerId } = await requireOwnerAccess(
      searchParams.get("station")
    );
    const date = searchParams.get("date") ?? undefined;
    const overview = await getInventoryOverview(tenantOwnerId, date);

    return NextResponse.json(overview, {
      status: 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return handleApiError(error, { route: "/api/owner/inventory" });
  }
}

interface StockMovementBody {
  movementType?: unknown;
  quantity?: unknown;
  notes?: unknown;
  businessDate?: unknown;
}

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { profile, tenantOwnerId } = await requireOwnerAccess(
      searchParams.get("station")
    );
    const body = await parseJsonBody<StockMovementBody>(request);

    if (
      !body ||
      (body.movementType !== "restock" &&
        body.movementType !== "damaged" &&
        body.movementType !== "adjustment") ||
      !Number.isFinite(Number(body.quantity))
    ) {
      return NextResponse.json(
        { error: "Valid action and whole number quantity are required." },
        { status: 400 }
      );
    }

    const result = await recordManualStockMovement(profile.id, tenantOwnerId, {
      movementType: body.movementType,
      quantity: Number(body.quantity),
      notes: typeof body.notes === "string" ? body.notes : undefined,
      businessDate:
        typeof body.businessDate === "string" ? body.businessDate : undefined,
    });

    const meta = extractRequestMeta(request);
    scheduleActivityLog({
      actor: {
        id: profile.id,
        name: profile.full_name || profile.email,
        email: profile.email,
        role: profile.role,
      },
      stationOwnerId: tenantOwnerId,
      module: "inventory",
      action: `Updated Gallon Stock (${body.movementType})`,
      controlLabel: "Update Stock",
      targetType: "gallon_stock",
      targetLabel: `${Number(body.quantity)} gallon(s)`,
      route: "/api/owner/inventory",
      details: {
        movementType: body.movementType,
        quantity: Number(body.quantity),
        balanceAfter: result?.balanceAfter ?? null,
      },
      ...meta,
    });

    return NextResponse.json(
      { result },
      { status: 201, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return handleApiError(error, { route: "/api/owner/inventory" });
  }
}

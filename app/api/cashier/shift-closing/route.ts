import { NextResponse } from "next/server";
import { handleApiError, parseJsonBody } from "@/backend/lib/http";
import { requireCashierAccess } from "@/backend/services/auth-guards";
import {
  closeDailyShift,
  getDailyShiftTally,
} from "@/backend/services/cashier/shift-closing";

export async function GET(request: Request) {
  try {
    const { tenantOwnerId } = await requireCashierAccess();
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") ?? undefined;
    const tally = await getDailyShiftTally(tenantOwnerId, date);

    return NextResponse.json(tally, {
      status: 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return handleApiError(error, { route: "/api/cashier/shift-closing" });
  }
}

interface CloseShiftBody {
  businessDate?: unknown;
  shiftLabel?: unknown;
  openingCash?: unknown;
  actualCash?: unknown;
  notes?: unknown;
}

export async function POST(request: Request) {
  try {
    const { profile, tenantOwnerId } = await requireCashierAccess();
    const body = await parseJsonBody<CloseShiftBody>(request);

    if (
      !body ||
      !Number.isFinite(Number(body.openingCash)) ||
      !Number.isFinite(Number(body.actualCash))
    ) {
      return NextResponse.json(
        { error: "Valid openingCash and actualCash amounts are required" },
        { status: 400 }
      );
    }

    const closing = await closeDailyShift(profile.id, tenantOwnerId, {
      businessDate:
        typeof body.businessDate === "string" ? body.businessDate : undefined,
      shiftLabel:
        typeof body.shiftLabel === "string" ? body.shiftLabel : undefined,
      openingCash: Number(body.openingCash),
      actualCash: Number(body.actualCash),
      notes: typeof body.notes === "string" ? body.notes : undefined,
    });

    return NextResponse.json(
      { closing },
      { status: 201, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return handleApiError(error, { route: "/api/cashier/shift-closing" });
  }
}

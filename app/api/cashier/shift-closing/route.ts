import { NextResponse } from "next/server";
import {
  extractRequestMeta,
  handleApiError,
  parseJsonBody,
} from "@/backend/lib/http";
import { scheduleActivityLog } from "@/backend/services/activity-logs";
import { requireCashierAccess } from "@/backend/services/auth-guards";
import {
  closeDailyShift,
  getDailyShiftTally,
} from "@/backend/services/cashier/shift-closing";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { tenantOwnerId } = await requireCashierAccess(
      searchParams.get("station")
    );
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
    const { searchParams } = new URL(request.url);
    const { profile, tenantOwnerId } = await requireCashierAccess(
      searchParams.get("station")
    );
    const body = await parseJsonBody<CloseShiftBody>(request);

    if (
      !body ||
      !Number.isFinite(Number(body.openingCash)) ||
      !Number.isFinite(Number(body.actualCash))
    ) {
      return NextResponse.json(
        { error: "Valid starting cash and counted cash amounts are required" },
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

    const meta = extractRequestMeta(request);
    scheduleActivityLog({
      actor: {
        id: profile.id,
        name: profile.full_name || profile.email,
        email: profile.email,
        role: profile.role,
      },
      stationOwnerId: tenantOwnerId,
      module: "shift",
      action: `Closed Shift "${closing.shift_label}" (Counted ₱${closing.actual_cash.toFixed(2)})`,
      controlLabel: "Close Shift & Save Tally",
      targetType: "shift_closing",
      targetId: closing.id,
      targetLabel: `${closing.business_date} · ${closing.shift_label}`,
      route: "/api/cashier/shift-closing",
      ...meta,
    });

    return NextResponse.json(
      { closing },
      { status: 201, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return handleApiError(error, { route: "/api/cashier/shift-closing" });
  }
}

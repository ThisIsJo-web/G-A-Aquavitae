import { NextResponse } from "next/server";
import { handleApiError } from "@/backend/lib/http";
import { requireCashierAccess } from "@/backend/services/auth-guards";
import { clampDateToWindow } from "@/backend/services/cashier/shared";
import { getCashierWorkspaceSnapshot } from "@/backend/services/cashier/shift-closing";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const stationId = searchParams.get("station");
    const { tenantOwnerId } = await requireCashierAccess(stationId);
    const date = clampDateToWindow(searchParams.get("date"), 7);

    const snapshot = await getCashierWorkspaceSnapshot(tenantOwnerId, date);
    return NextResponse.json(snapshot, {
      status: 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return handleApiError(error, { route: "/api/cashier/workspace" });
  }
}

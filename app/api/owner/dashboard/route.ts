import { NextResponse } from "next/server";
import { handleApiError } from "@/backend/lib/http";
import { requireOwnerAccess } from "@/backend/services/auth-guards";
import {
  getOwnerDashboardSnapshot,
  sanitizeRangeDays,
} from "@/backend/services/owner/dashboard";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { tenantOwnerId } = await requireOwnerAccess(
      searchParams.get("station")
    );
    const rangeDays = sanitizeRangeDays(searchParams.get("range"));

    const snapshot = await getOwnerDashboardSnapshot(tenantOwnerId, rangeDays);

    return NextResponse.json(snapshot, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return handleApiError(error, { route: "/api/owner/dashboard" });
  }
}

import { NextResponse } from "next/server";
import { handleApiError } from "@/backend/lib/http";
import { requireOwnerAccess } from "@/backend/services/auth-guards";
import { getOwnerPulse } from "@/backend/services/owner/dashboard";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { tenantOwnerId } = await requireOwnerAccess(
      searchParams.get("station")
    );
    const pulse = await getOwnerPulse(tenantOwnerId);

    return NextResponse.json(pulse, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return handleApiError(error, { route: "/api/owner/pulse" });
  }
}

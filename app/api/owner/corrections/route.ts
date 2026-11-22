import { NextResponse } from "next/server";
import { handleApiError } from "@/backend/lib/http";
import { requireOwnerAccess } from "@/backend/services/auth-guards";
import { listCorrectionRequests } from "@/backend/services/corrections";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { tenantOwnerId } = await requireOwnerAccess(
      searchParams.get("station")
    );
    const overview = await listCorrectionRequests(tenantOwnerId, 60);
    return NextResponse.json(overview, {
      status: 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return handleApiError(error, { route: "/api/owner/corrections" });
  }
}

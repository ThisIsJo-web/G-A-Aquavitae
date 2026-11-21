import { NextResponse } from "next/server";
import { handleApiError } from "@/backend/lib/http";
import { requireOwnerAccess } from "@/backend/services/auth-guards";
import { listCorrectionRequests } from "@/backend/services/corrections";

export async function GET() {
  try {
    const owner = await requireOwnerAccess();
    const overview = await listCorrectionRequests(owner.id, 60);
    return NextResponse.json(overview, {
      status: 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return handleApiError(error, { route: "/api/owner/corrections" });
  }
}

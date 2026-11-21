import { NextResponse } from "next/server";
import { handleApiError } from "@/backend/lib/http";
import { requireOwnerAccess } from "@/backend/services/auth-guards";
import { getOwnerPulse } from "@/backend/services/owner/dashboard";

export async function GET() {
  try {
    const owner = await requireOwnerAccess();
    const pulse = await getOwnerPulse(owner.id);

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

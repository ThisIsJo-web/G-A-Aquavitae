import { NextResponse } from "next/server";
import { handleApiError } from "@/backend/lib/http";
import { requireSuperadmin } from "@/backend/services/auth-guards";
import { getSystemHealthSnapshot } from "@/backend/services/system-health";

export async function GET() {
  try {
    await requireSuperadmin();
    const snapshot = await getSystemHealthSnapshot();

    return NextResponse.json(snapshot, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return handleApiError(error, { route: "/api/superadmin/health" });
  }
}

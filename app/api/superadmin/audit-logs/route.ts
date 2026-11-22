import { NextResponse } from "next/server";
import { handleApiError } from "@/backend/lib/http";
import { queryActivityLogs } from "@/backend/services/activity-logs";
import { requireSuperadmin } from "@/backend/services/auth-guards";
import { clampDateToWindow } from "@/backend/services/cashier/shared";

export async function GET(request: Request) {
  try {
    await requireSuperadmin();
    const { searchParams } = new URL(request.url);
    const rawFrom = searchParams.get("from");
    const rawTo = searchParams.get("to");

    const to = rawTo ? clampDateToWindow(rawTo, 365) : null;
    const fromRawClamped = rawFrom ? clampDateToWindow(rawFrom, 365) : null;
    const from =
      fromRawClamped && to && fromRawClamped > to ? to : fromRawClamped;

    const result = await queryActivityLogs({
      search: searchParams.get("q"),
      role: searchParams.get("role"),
      module: searchParams.get("module"),
      from,
      to,
      limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : 150,
    });

    return NextResponse.json(result, {
      status: 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return handleApiError(error, { route: "/api/superadmin/audit-logs" });
  }
}

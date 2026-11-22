import { NextResponse } from "next/server";
import { extractRequestMeta, handleApiError } from "@/backend/lib/http";
import {
  queryActivityLogs,
  scheduleActivityLog,
  serializeActivityLogs,
} from "@/backend/services/activity-logs";
import { requireSuperadmin } from "@/backend/services/auth-guards";
import { clampDateToWindow } from "@/backend/services/cashier/shared";

export async function GET(request: Request) {
  try {
    const actor = await requireSuperadmin();
    const { searchParams } = new URL(request.url);
    const rawFormat = (searchParams.get("format") ?? "csv").toLowerCase();
    const format: "csv" | "json" = rawFormat === "json" ? "json" : "csv";

    const rawFrom = searchParams.get("from");
    const rawTo = searchParams.get("to");
    const to = rawTo ? clampDateToWindow(rawTo, 365) : null;
    const from = rawFrom ? clampDateToWindow(rawFrom, 365) : null;

    const result = await queryActivityLogs({
      search: searchParams.get("q"),
      role: searchParams.get("role"),
      module: searchParams.get("module"),
      from: from && to && from > to ? to : from,
      to,
      limit: 500,
    });

    const meta = extractRequestMeta(request);
    scheduleActivityLog({
      actor: {
        id: actor.id,
        name: actor.full_name || actor.email,
        email: actor.email,
        role: actor.role,
      },
      module: "export",
      action: `Exported Superadmin Audit Logs (${format.toUpperCase()})`,
      controlLabel: `Export ${format.toUpperCase()}`,
      targetLabel: `${result.entries.length} entries`,
      route: "/api/superadmin/audit-logs/export",
      ...meta,
    });

    const file = serializeActivityLogs(result.entries, format);
    const filename = `aquavitae-activity-audit.${file.extension}`;

    return new NextResponse(file.body, {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return handleApiError(error, { route: "/api/superadmin/audit-logs/export" });
  }
}

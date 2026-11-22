import { NextResponse } from "next/server";
import { extractRequestMeta, handleApiError } from "@/backend/lib/http";
import { scheduleActivityLog } from "@/backend/services/activity-logs";
import { requireOwnerAccess } from "@/backend/services/auth-guards";
import {
  formatOwnerReportExport,
  getOwnerDashboardSnapshot,
  sanitizeRangeDays,
} from "@/backend/services/owner/dashboard";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { profile, tenantOwnerId } = await requireOwnerAccess(
      searchParams.get("station")
    );
    const rangeDays = sanitizeRangeDays(searchParams.get("range"));
    const rawFormat = (searchParams.get("format") ?? "csv").toLowerCase();
    const format: "csv" | "json" | "txt" =
      rawFormat === "json" ? "json" : rawFormat === "txt" ? "txt" : "csv";

    const snapshot = await getOwnerDashboardSnapshot(tenantOwnerId, rangeDays);
    const report = formatOwnerReportExport(snapshot, format);
    const filename = `aquavitae-owner-report-${snapshot.startDate}-to-${snapshot.endDate}.${report.extension}`;

    const meta = extractRequestMeta(request);
    scheduleActivityLog({
      actor: {
        id: profile.id,
        name: profile.full_name || profile.email,
        email: profile.email,
        role: profile.role,
      },
      stationOwnerId: tenantOwnerId,
      module: "export",
      action: `Exported Owner Sales Report (${format.toUpperCase()})`,
      controlLabel: `Export ${format.toUpperCase()}`,
      targetLabel: `${snapshot.startDate} to ${snapshot.endDate}`,
      route: "/api/owner/export",
      ...meta,
    });

    return new NextResponse(report.body, {
      status: 200,
      headers: {
        "Content-Type": report.contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return handleApiError(error, { route: "/api/owner/export" });
  }
}

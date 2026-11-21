import { NextResponse } from "next/server";
import { handleApiError } from "@/backend/lib/http";
import { requireOwnerAccess } from "@/backend/services/auth-guards";
import {
  formatOwnerReportExport,
  getOwnerDashboardSnapshot,
  sanitizeRangeDays,
} from "@/backend/services/owner/dashboard";

export async function GET(request: Request) {
  try {
    const owner = await requireOwnerAccess();
    const { searchParams } = new URL(request.url);
    const rangeDays = sanitizeRangeDays(searchParams.get("range"));
    const rawFormat = (searchParams.get("format") ?? "csv").toLowerCase();
    const format: "csv" | "json" | "txt" =
      rawFormat === "json" ? "json" : rawFormat === "txt" ? "txt" : "csv";

    const snapshot = await getOwnerDashboardSnapshot(owner.id, rangeDays);
    const report = formatOwnerReportExport(snapshot, format);
    const filename = `aquavitae-owner-report-${snapshot.startDate}-to-${snapshot.endDate}.${report.extension}`;

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

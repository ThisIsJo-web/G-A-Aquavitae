import { NextResponse } from "next/server";
import { handleApiError } from "@/backend/lib/http";
import { requireSuperadmin } from "@/backend/services/auth-guards";
import {
  getErrorLogsForExport,
  isValidErrorLayer,
  isValidErrorLevel,
  serializeErrorLogsJson,
  serializeErrorLogsLog,
  serializeErrorLogsTxt,
  type ErrorLogExportFormat,
  type ErrorLogGroupBy,
  type ResolvedFilter,
} from "@/backend/services/error-logs";

const FORMAT_SET = new Set<ErrorLogExportFormat>(["json", "txt", "log"]);

export async function GET(request: Request) {
  try {
    await requireSuperadmin();

    const { searchParams } = new URL(request.url);
    const formatParam = (searchParams.get("format") ?? "json").toLowerCase();
    const format: ErrorLogExportFormat = FORMAT_SET.has(
      formatParam as ErrorLogExportFormat
    )
      ? (formatParam as ErrorLogExportFormat)
      : "json";

    const groupBy: ErrorLogGroupBy =
      searchParams.get("groupBy") === "layer" ? "layer" : "severity";
    const section = searchParams.get("section") ?? "all";
    const levelParam = searchParams.get("level");
    const layerParam = searchParams.get("layer");
    const resolvedParam = searchParams.get("resolved");
    const resolved: ResolvedFilter =
      resolvedParam === "open" || resolvedParam === "resolved"
        ? resolvedParam
        : "all";
    const search = searchParams.get("search") ?? undefined;

    const logs = await getErrorLogsForExport({
      groupBy,
      section,
      level: isValidErrorLevel(levelParam) ? levelParam : "all",
      layer: isValidErrorLayer(layerParam) ? layerParam : "all",
      resolved,
      search,
    });

    const exportedAt = new Date().toISOString();
    const dateSlug = exportedAt.slice(0, 10);
    const safeSection = section.replace(/[^a-z0-9_-]/gi, "").toLowerCase() || "all";
    const filename = `aquavitae-error-logs-${safeSection}-${dateSlug}.${format}`;

    let body: string;
    let contentType: string;

    if (format === "json") {
      body = serializeErrorLogsJson(logs, {
        exportedAt,
        groupBy,
        section: safeSection,
        resolved,
      });
      contentType = "application/json; charset=utf-8";
    } else if (format === "txt") {
      body = serializeErrorLogsTxt(logs, {
        exportedAt,
        groupBy,
        section: safeSection,
        resolved,
      });
      contentType = "text/plain; charset=utf-8";
    } else {
      body = serializeErrorLogsLog(logs);
      contentType = "text/plain; charset=utf-8";
    }

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return handleApiError(error, { route: "/api/superadmin/logs/export" });
  }
}

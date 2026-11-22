import { NextResponse } from "next/server";
import { extractRequestMeta, handleApiError } from "@/backend/lib/http";
import { scheduleActivityLog } from "@/backend/services/activity-logs";
import {
  formatAuditLedgerExport,
  queryOwnerAuditLedger,
  type AuditBucketFilter,
} from "@/backend/services/audit-ledger";
import { requireOwnerAccess } from "@/backend/services/auth-guards";

const VALID_BUCKETS = new Set<AuditBucketFilter>([
  "all",
  "cash",
  "digital",
  "utang",
  "expense",
  "exceptions",
]);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { profile, tenantOwnerId } = await requireOwnerAccess(
      searchParams.get("station")
    );
    const rawBucket = searchParams.get("bucket") ?? "all";
    const bucket: AuditBucketFilter = VALID_BUCKETS.has(
      rawBucket as AuditBucketFilter
    )
      ? (rawBucket as AuditBucketFilter)
      : "all";
    const rawFormat = (searchParams.get("format") ?? "csv").toLowerCase();
    const format: "csv" | "json" | "txt" =
      rawFormat === "json" ? "json" : rawFormat === "txt" ? "txt" : "csv";

    const ledger = await queryOwnerAuditLedger(tenantOwnerId, {
      from: searchParams.get("from"),
      to: searchParams.get("to"),
      module: searchParams.get("module"),
      bucket,
      q: searchParams.get("q"),
      limit: 1000,
    });

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
      action: `Exported Financial Audit Trail (${format.toUpperCase()})`,
      controlLabel: `Export ${format.toUpperCase()}`,
      targetLabel: `${ledger.fromDate} to ${ledger.toDate}`,
      route: "/api/owner/audit/export",
      ...meta,
    });

    const report = formatAuditLedgerExport(ledger, format);
    const filename = `aquavitae-audit-ledger-${ledger.fromDate}-${ledger.toDate}.${report.extension}`;

    return new NextResponse(report.body, {
      status: 200,
      headers: {
        "Content-Type": report.contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return handleApiError(error, { route: "/api/owner/audit/export" });
  }
}

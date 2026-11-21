import { NextResponse } from "next/server";
import { handleApiError } from "@/backend/lib/http";
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
    const owner = await requireOwnerAccess();
    const { searchParams } = new URL(request.url);
    const rawBucket = searchParams.get("bucket") ?? "all";
    const bucket: AuditBucketFilter = VALID_BUCKETS.has(
      rawBucket as AuditBucketFilter
    )
      ? (rawBucket as AuditBucketFilter)
      : "all";
    const rawFormat = (searchParams.get("format") ?? "csv").toLowerCase();
    const format: "csv" | "json" | "txt" =
      rawFormat === "json" ? "json" : rawFormat === "txt" ? "txt" : "csv";

    const ledger = await queryOwnerAuditLedger(owner.id, {
      from: searchParams.get("from"),
      to: searchParams.get("to"),
      module: searchParams.get("module"),
      bucket,
      q: searchParams.get("q"),
      limit: 1000,
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

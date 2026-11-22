import { NextResponse } from "next/server";
import { extractRequestMeta, handleApiError } from "@/backend/lib/http";
import { scheduleActivityLog } from "@/backend/services/activity-logs";
import {
  backfillOwnerAuditLedger,
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
    const { tenantOwnerId } = await requireOwnerAccess(
      searchParams.get("station")
    );
    const rawBucket = searchParams.get("bucket") ?? "all";
    const bucket: AuditBucketFilter = VALID_BUCKETS.has(
      rawBucket as AuditBucketFilter
    )
      ? (rawBucket as AuditBucketFilter)
      : "all";

    const result = await queryOwnerAuditLedger(tenantOwnerId, {
      from: searchParams.get("from"),
      to: searchParams.get("to"),
      module: searchParams.get("module"),
      bucket,
      q: searchParams.get("q"),
      limit: searchParams.get("limit")
        ? Number(searchParams.get("limit"))
        : 200,
    });

    return NextResponse.json(result, {
      status: 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return handleApiError(error, { route: "/api/owner/audit" });
  }
}

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { profile, tenantOwnerId } = await requireOwnerAccess(
      searchParams.get("station")
    );
    const { importedCount } = await backfillOwnerAuditLedger(tenantOwnerId);
    const result = await queryOwnerAuditLedger(tenantOwnerId);

    const meta = extractRequestMeta(request);
    scheduleActivityLog({
      actor: {
        id: profile.id,
        name: profile.full_name || profile.email,
        email: profile.email,
        role: profile.role,
      },
      stationOwnerId: tenantOwnerId,
      module: "audit",
      action: `Synced ${importedCount} past record(s) into Financial Audit Trail`,
      controlLabel: "Sync Past Records",
      route: "/api/owner/audit",
      ...meta,
    });

    return NextResponse.json(
      { importedCount, ledger: result },
      { status: 200, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return handleApiError(error, { route: "/api/owner/audit" });
  }
}

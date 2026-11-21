import { NextResponse } from "next/server";
import { handleApiError } from "@/backend/lib/http";
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
    const owner = await requireOwnerAccess();
    const { searchParams } = new URL(request.url);
    const rawBucket = searchParams.get("bucket") ?? "all";
    const bucket: AuditBucketFilter = VALID_BUCKETS.has(
      rawBucket as AuditBucketFilter
    )
      ? (rawBucket as AuditBucketFilter)
      : "all";

    const result = await queryOwnerAuditLedger(owner.id, {
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

export async function POST() {
  try {
    const owner = await requireOwnerAccess();
    const { importedCount } = await backfillOwnerAuditLedger(owner.id);
    const result = await queryOwnerAuditLedger(owner.id);

    return NextResponse.json(
      { importedCount, ledger: result },
      { status: 200, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return handleApiError(error, { route: "/api/owner/audit" });
  }
}

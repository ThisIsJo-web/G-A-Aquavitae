import { NextResponse } from "next/server";
import { handleApiError, parseJsonBody } from "@/backend/lib/http";
import { requireCashierAccess } from "@/backend/services/auth-guards";
import {
  createCorrectionRequest,
  isValidCorrectionEntityType,
  isValidCorrectionType,
  listCorrectionRequests,
} from "@/backend/services/corrections";

export async function GET() {
  try {
    const ctx = await requireCashierAccess();
    const overview = await listCorrectionRequests(ctx.tenantOwnerId, 40);
    return NextResponse.json(overview, {
      status: 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return handleApiError(error, { route: "/api/cashier/corrections" });
  }
}

interface CreateCorrectionBody {
  entityType?: unknown;
  entityId?: unknown;
  correctionType?: unknown;
  reason?: unknown;
  proposedChanges?: unknown;
}

export async function POST(request: Request) {
  const body = await parseJsonBody<CreateCorrectionBody>(request);

  if (
    !body ||
    !isValidCorrectionEntityType(body.entityType) ||
    typeof body.entityId !== "string" ||
    !body.entityId.trim() ||
    !isValidCorrectionType(body.correctionType) ||
    typeof body.reason !== "string" ||
    !body.reason.trim()
  ) {
    return NextResponse.json(
      {
        error:
          "Valid entityType, entityId, correctionType, and reason are required.",
      },
      { status: 400 }
    );
  }

  try {
    const ctx = await requireCashierAccess();
    const created = await createCorrectionRequest({
      ownerId: ctx.tenantOwnerId,
      requestedBy: ctx.profile.id,
      requesterName: ctx.profile.full_name || ctx.profile.email,
      entityType: body.entityType,
      entityId: body.entityId.trim(),
      correctionType: body.correctionType,
      reason: body.reason,
      proposedChanges:
        body.proposedChanges && typeof body.proposedChanges === "object"
          ? (body.proposedChanges as Record<string, unknown>)
          : {},
    });

    return NextResponse.json({ request: created }, { status: 201 });
  } catch (error) {
    return handleApiError(error, { route: "/api/cashier/corrections" });
  }
}

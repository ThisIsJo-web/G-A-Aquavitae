import { NextResponse } from "next/server";
import {
  extractRequestMeta,
  handleApiError,
  parseJsonBody,
} from "@/backend/lib/http";
import { scheduleActivityLog } from "@/backend/services/activity-logs";
import { requireCashierAccess } from "@/backend/services/auth-guards";
import {
  createCorrectionRequest,
  isValidCorrectionEntityType,
  isValidCorrectionType,
  listCorrectionRequests,
} from "@/backend/services/corrections";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const ctx = await requireCashierAccess(searchParams.get("station"));
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
        error: "Valid record, correction type, and reason are required.",
      },
      { status: 400 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const ctx = await requireCashierAccess(searchParams.get("station"));
    const isElevatedActor =
      ctx.profile.role === "owner" || ctx.profile.role === "superadmin";

    const created = await createCorrectionRequest({
      ownerId: ctx.tenantOwnerId,
      requestedBy: ctx.profile.id,
      requesterName: ctx.profile.full_name || ctx.profile.email,
      actorRole:
        ctx.profile.role === "superadmin"
          ? "superadmin"
          : ctx.profile.role === "owner"
            ? "owner"
            : "cashier",
      autoApprove: isElevatedActor,
      entityType: body.entityType,
      entityId: body.entityId.trim(),
      correctionType: body.correctionType,
      reason: body.reason,
      proposedChanges:
        body.proposedChanges && typeof body.proposedChanges === "object"
          ? (body.proposedChanges as Record<string, unknown>)
          : {},
    });

    const meta = extractRequestMeta(request);
    scheduleActivityLog({
      actor: {
        id: ctx.profile.id,
        name: ctx.profile.full_name || ctx.profile.email,
        email: ctx.profile.email,
        role: ctx.profile.role,
      },
      stationOwnerId: ctx.tenantOwnerId,
      module: "supervision",
      action: isElevatedActor
        ? `Applied Direct Fix (${body.correctionType.replace(/_/g, " ")})`
        : `Requested Correction (${body.correctionType.replace(/_/g, " ")})`,
      controlLabel: isElevatedActor ? "Apply Fix Now" : "Send to Owner",
      targetType: created.entity_type,
      targetId: created.entity_id,
      targetLabel: created.entity_label,
      route: "/api/cashier/corrections",
      ...meta,
    });

    return NextResponse.json(
      { request: created, appliedDirectly: isElevatedActor },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error, { route: "/api/cashier/corrections" });
  }
}

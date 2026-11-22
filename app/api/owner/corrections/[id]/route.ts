import { NextResponse } from "next/server";
import {
  extractRequestMeta,
  handleApiError,
  parseJsonBody,
} from "@/backend/lib/http";
import { scheduleActivityLog } from "@/backend/services/activity-logs";
import { requireOwnerAccess } from "@/backend/services/auth-guards";
import { reviewCorrectionRequest } from "@/backend/services/corrections";

interface ReviewBody {
  decision?: unknown;
  reviewerNote?: unknown;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await parseJsonBody<ReviewBody>(request);

  if (
    !body ||
    (body.decision !== "approved" && body.decision !== "rejected")
  ) {
    return NextResponse.json(
      { error: "Decision must be approved or rejected." },
      { status: 400 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const { profile, tenantOwnerId } = await requireOwnerAccess(
      searchParams.get("station")
    );
    const updated = await reviewCorrectionRequest({
      ownerId: tenantOwnerId,
      reviewerId: profile.id,
      requestId: id,
      decision: body.decision,
      reviewerNote:
        typeof body.reviewerNote === "string" ? body.reviewerNote : undefined,
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
      module: "supervision",
      action:
        body.decision === "approved"
          ? `Approved Correction: ${updated.entity_label}`
          : `Rejected Correction: ${updated.entity_label}`,
      controlLabel: body.decision === "approved" ? "Approve & Apply" : "Reject",
      targetType: updated.entity_type,
      targetId: updated.entity_id,
      targetLabel: updated.entity_label,
      route: "/api/owner/corrections/[id]",
      ...meta,
    });

    return NextResponse.json({ request: updated }, { status: 200 });
  } catch (error) {
    return handleApiError(error, { route: "/api/owner/corrections/[id]" });
  }
}

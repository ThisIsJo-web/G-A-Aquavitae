import { NextResponse } from "next/server";
import { handleApiError, parseJsonBody } from "@/backend/lib/http";
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
      { error: "decision must be 'approved' or 'rejected'." },
      { status: 400 }
    );
  }

  try {
    const owner = await requireOwnerAccess();
    const updated = await reviewCorrectionRequest({
      ownerId: owner.id,
      reviewerId: owner.id,
      requestId: id,
      decision: body.decision,
      reviewerNote:
        typeof body.reviewerNote === "string" ? body.reviewerNote : undefined,
    });

    return NextResponse.json({ request: updated }, { status: 200 });
  } catch (error) {
    return handleApiError(error, { route: "/api/owner/corrections/[id]" });
  }
}

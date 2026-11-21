import { NextResponse } from "next/server";
import { handleApiError, parseJsonBody } from "@/backend/lib/http";
import { requireSuperadmin } from "@/backend/services/auth-guards";
import { setErrorLogResolved } from "@/backend/services/error-logs";

interface PatchLogBody {
  resolved?: unknown;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireSuperadmin();
    const { id } = await params;
    const body = await parseJsonBody<PatchLogBody>(request);

    if (!body || typeof body.resolved !== "boolean") {
      return NextResponse.json(
        { error: "Boolean 'resolved' field is required" },
        { status: 400 }
      );
    }

    const updated = await setErrorLogResolved(id, body.resolved, actor.id);

    return NextResponse.json(
      { log: updated },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store",
        },
      }
    );
  } catch (error) {
    return handleApiError(error, { route: "/api/superadmin/logs/[id]" });
  }
}

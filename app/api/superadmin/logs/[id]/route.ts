import { NextResponse } from "next/server";
import {
  extractRequestMeta,
  handleApiError,
  parseJsonBody,
} from "@/backend/lib/http";
import { scheduleActivityLog } from "@/backend/services/activity-logs";
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
        { error: "Resolved status is required" },
        { status: 400 }
      );
    }

    const updated = await setErrorLogResolved(id, body.resolved, actor.id);

    const meta = extractRequestMeta(request);
    scheduleActivityLog({
      actor: {
        id: actor.id,
        name: actor.full_name || actor.email,
        email: actor.email,
        role: actor.role,
      },
      module: "error_logs",
      action: body.resolved
        ? `Marked Error Log Resolved: ${updated.message}`
        : `Reopened Error Log: ${updated.message}`,
      controlLabel: body.resolved ? "Mark Resolved" : "Reopen Log",
      targetType: "error_log",
      targetId: updated.id,
      targetLabel: updated.code || updated.route || updated.id,
      route: "/api/superadmin/logs/[id]",
      ...meta,
    });

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

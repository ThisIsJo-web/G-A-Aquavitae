import { after, NextResponse } from "next/server";
import {
  extractRequestMeta,
  handleApiError,
  parseJsonBody,
} from "@/backend/lib/http";
import {
  recordActivityBatch,
  type RecordActivityInput,
} from "@/backend/services/activity-logs";
import { requireActiveProfile } from "@/backend/services/users";

interface ClientActivityEvent {
  module?: unknown;
  action?: unknown;
  controlLabel?: unknown;
  targetType?: unknown;
  targetId?: unknown;
  targetLabel?: unknown;
  route?: unknown;
  details?: unknown;
}

interface ActivityBatchBody {
  events?: unknown;
}

export async function POST(request: Request) {
  try {
    const profile = await requireActiveProfile();
    const body = await parseJsonBody<ActivityBatchBody>(request);
    if (!body || !Array.isArray(body.events) || body.events.length === 0) {
      return NextResponse.json({ accepted: 0 }, { status: 200 });
    }

    const { ipAddress, userAgent } = extractRequestMeta(request);
    const stationOwnerId =
      profile.role === "owner" ? profile.id : profile.owner_id;

    const entries: RecordActivityInput[] = [];
    for (const raw of body.events.slice(0, 30)) {
      if (!raw || typeof raw !== "object") continue;
      const ev = raw as ClientActivityEvent;
      if (typeof ev.action !== "string" || !ev.action.trim()) continue;

      entries.push({
        actor: {
          id: profile.id,
          name: profile.full_name || profile.email,
          email: profile.email,
          role: profile.role,
        },
        stationOwnerId,
        module:
          typeof ev.module === "string" && ev.module.trim()
            ? ev.module.trim()
            : "navigation",
        action: ev.action.trim(),
        controlLabel:
          typeof ev.controlLabel === "string" ? ev.controlLabel.trim() : null,
        targetType:
          typeof ev.targetType === "string" ? ev.targetType.trim() : null,
        targetId: typeof ev.targetId === "string" ? ev.targetId.trim() : null,
        targetLabel:
          typeof ev.targetLabel === "string" ? ev.targetLabel.trim() : null,
        route: typeof ev.route === "string" ? ev.route.trim() : null,
        status: "success",
        details:
          ev.details && typeof ev.details === "object"
            ? (ev.details as Record<string, unknown>)
            : {},
        ipAddress,
        userAgent,
      });
    }

    if (entries.length > 0) {
      after(() => recordActivityBatch(entries));
    }

    return NextResponse.json(
      { accepted: entries.length },
      { status: 202, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return handleApiError(error, { route: "/api/activity" });
  }
}

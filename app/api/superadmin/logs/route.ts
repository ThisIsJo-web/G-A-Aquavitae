import { NextResponse } from "next/server";
import { handleApiError, parseJsonBody } from "@/backend/lib/http";
import { requireSuperadmin } from "@/backend/services/auth-guards";
import {
  getGroupedErrorLogs,
  isValidErrorLayer,
  isValidErrorLevel,
  isValidErrorSource,
  logSystemError,
  resolveLayerFromSource,
  type ErrorLogGroupBy,
  type ResolvedFilter,
} from "@/backend/services/error-logs";

export async function GET(request: Request) {
  try {
    await requireSuperadmin();

    const { searchParams } = new URL(request.url);
    const groupByParam = searchParams.get("groupBy");
    const groupBy: ErrorLogGroupBy =
      groupByParam === "layer" ? "layer" : "severity";

    const levelParam = searchParams.get("level");
    const layerParam = searchParams.get("layer");
    const resolvedParam = searchParams.get("resolved");
    const search = searchParams.get("search") ?? undefined;
    const limitParam = Number(searchParams.get("limit") ?? "25");

    const resolved: ResolvedFilter =
      resolvedParam === "open" || resolvedParam === "resolved"
        ? resolvedParam
        : "all";

    const result = await getGroupedErrorLogs({
      groupBy,
      level: isValidErrorLevel(levelParam) ? levelParam : "all",
      layer: isValidErrorLayer(layerParam) ? layerParam : "all",
      resolved,
      search,
      limitPerSection: Number.isFinite(limitParam) ? limitParam : 25,
    });

    return NextResponse.json(result, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return handleApiError(error, { route: "/api/superadmin/logs" });
  }
}

interface CreateLogBody {
  level?: unknown;
  source?: unknown;
  layer?: unknown;
  message?: unknown;
  code?: unknown;
  route?: unknown;
  stack?: unknown;
  metadata?: unknown;
}

export async function POST(request: Request) {
  try {
    const actor = await requireSuperadmin();
    const body = await parseJsonBody<CreateLogBody>(request);

    if (
      !body ||
      !isValidErrorLevel(body.level) ||
      typeof body.message !== "string" ||
      !body.message.trim()
    ) {
      return NextResponse.json(
        {
          error:
            "Valid level (critical | error | warning) and non-empty message are required",
        },
        { status: 400 }
      );
    }

    const source = isValidErrorSource(body.source) ? body.source : "system";
    const layer = isValidErrorLayer(body.layer)
      ? body.layer
      : resolveLayerFromSource(source);

    const metadata =
      body.metadata &&
      typeof body.metadata === "object" &&
      !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : {};

    const created = await logSystemError({
      level: body.level,
      source,
      layer,
      message: body.message.trim(),
      code: typeof body.code === "string" ? body.code : null,
      route: typeof body.route === "string" ? body.route : "/superadmin/health",
      stack: typeof body.stack === "string" ? body.stack : null,
      metadata,
      userId: actor.id,
    });

    if (!created) {
      return NextResponse.json(
        {
          error:
            "Unable to write error log. Ensure system_error_logs table is created from backend/db/schema.sql.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { log: created },
      {
        status: 201,
        headers: {
          "Cache-Control": "private, no-store",
        },
      }
    );
  } catch (error) {
    return handleApiError(error, { route: "/api/superadmin/logs" });
  }
}

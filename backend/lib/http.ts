import "server-only";

import { NextResponse } from "next/server";
import type { ErrorLogSource } from "@/backend/db/types";
import { AuthServiceError } from "@/backend/services/auth";
import { logSystemError } from "@/backend/services/error-logs";

export async function parseJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export interface ApiErrorContext {
  route?: string;
  source?: ErrorLogSource;
  userId?: string | null;
}

export function handleApiError(error: unknown, context?: ApiErrorContext) {
  if (error instanceof AuthServiceError) {
    if (error.status >= 500) {
      void logSystemError({
        level: "error",
        source: context?.source ?? "api",
        message: error.message,
        code: `HTTP_${error.status}`,
        route: context?.route ?? null,
        stack: error.stack ?? null,
        userId: context?.userId ?? null,
      });
    }

    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  }

  const message =
    error instanceof Error ? error.message : "An unexpected server error occurred";
  const stack = error instanceof Error ? error.stack ?? null : null;

  void logSystemError({
    level: "critical",
    source: context?.source ?? "api",
    message,
    code: "UNHANDLED_500",
    route: context?.route ?? null,
    stack,
    userId: context?.userId ?? null,
  });

  return NextResponse.json(
    { error: "An unexpected server error occurred" },
    { status: 500 }
  );
}

/**
 * Ensures redirect paths stay relative to the current origin to prevent open redirects.
 */
export function sanitizeRedirectPath(path: string | null): string {
  if (!path || !path.startsWith("/") || path.startsWith("//")) {
    return "/";
  }
  return path;
}

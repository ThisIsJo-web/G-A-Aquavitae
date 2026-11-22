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

export function normalizeHttpStatus(
  status: number | undefined | null,
  fallback = 500
): number {
  if (typeof status === "number" && Number.isInteger(status) && status >= 200 && status <= 599) {
    return status;
  }
  return fallback;
}

export function extractRequestMeta(request?: Request): {
  ipAddress: string | null;
  userAgent: string | null;
} {
  if (!request) return { ipAddress: null, userAgent: null };
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const ipAddress =
    forwarded?.split(",")[0]?.trim() || realIp?.trim() || null;
  const userAgent = request.headers.get("user-agent")?.slice(0, 300) || null;
  return { ipAddress, userAgent };
}

export function handleApiError(error: unknown, context?: ApiErrorContext) {
  if (error instanceof AuthServiceError) {
    const safeStatus = normalizeHttpStatus(error.status, 500);
    if (safeStatus >= 500) {
      void logSystemError({
        level: "error",
        source: context?.source ?? "api",
        message: error.message,
        code: `HTTP_${safeStatus}`,
        route: context?.route ?? null,
        stack: error.stack ?? null,
        userId: context?.userId ?? null,
      });
    }

    return NextResponse.json(
      { error: error.message },
      { status: safeStatus }
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

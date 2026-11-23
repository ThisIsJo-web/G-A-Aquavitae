import "server-only";

import v8 from "node:v8";
import { getSupabaseEnv } from "@/backend/config/env";
import { createSupabaseAdminClient } from "@/backend/db/supabase";
import {
  isMissingLogsTableError,
  logSystemError,
} from "@/backend/services/error-logs";

export type ServiceStatus = "operational" | "degraded" | "down";
export type MemoryHealthStatus = "healthy" | "elevated" | "critical";

export interface ServiceProbe {
  id: string;
  name: string;
  description: string;
  status: ServiceStatus;
  latencyMs: number;
  detail: string;
}

export interface RuntimeTelemetry {
  nodeVersion: string;
  environment: string;
  uptimeSeconds: number;
  memory: {
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
    heapLimitMb: number;
    heapUsagePercent: number;
    status: MemoryHealthStatus;
  };
}

export interface AccountSummary {
  total: number;
  active: number;
  inactive: number;
  byRole: {
    superadmin: number;
    owner: number;
    cashier: number;
  };
}

export interface ErrorLogSummary {
  schemaMissing: boolean;
  total: number;
  unresolved: number;
  last24h: number;
  bySeverity: {
    critical: number;
    error: number;
    warning: number;
  };
  byLayer: {
    backend: number;
    database_auth: number;
    frontend: number;
  };
}

export interface SystemHealthSnapshot {
  overallStatus: ServiceStatus;
  checkedAt: string;
  probes: ServiceProbe[];
  runtime: RuntimeTelemetry;
  accounts: AccountSummary;
  errors: ErrorLogSummary;
}

const PROBE_TIMEOUT_MS = 4000;
const DEGRADED_LATENCY_MS = 800;
const HIGH_MEMORY_LOG_COOLDOWN_MS = 5 * 60 * 1000;

let lastHighMemoryAlertAt = 0;

async function runHttpProbe(params: {
  id: string;
  name: string;
  description: string;
  url: string;
  headers?: Record<string, string>;
}): Promise<ServiceProbe> {
  const start = performance.now();
  try {
    const response = await fetch(params.url, {
      headers: params.headers,
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const latencyMs = Math.round(performance.now() - start);
    // Explicitly cancel unread response stream to prevent lingering socket buffers
    await response.body?.cancel().catch(() => {});

    if (!response.ok) {
      return {
        id: params.id,
        name: params.name,
        description: params.description,
        status: "down",
        latencyMs,
        detail: `HTTP ${response.status}`,
      };
    }

    const status: ServiceStatus =
      latencyMs > DEGRADED_LATENCY_MS ? "degraded" : "operational";

    return {
      id: params.id,
      name: params.name,
      description: params.description,
      status,
      latencyMs,
      detail:
        status === "degraded"
          ? `Responding slowly (${latencyMs} ms)`
          : `Healthy (${latencyMs} ms)`,
    };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      id: params.id,
      name: params.name,
      description: params.description,
      status: "down",
      latencyMs,
      detail: error instanceof Error ? error.message : "Probe unreachable",
    };
  }
}

async function runPostgresQueryProbe(): Promise<ServiceProbe> {
  const start = performance.now();
  try {
    const admin = createSupabaseAdminClient();
    const { count, error } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true });
    const latencyMs = Math.round(performance.now() - start);

    if (error) {
      return {
        id: "postgres-query",
        name: "Database",
        description: "Live station records connectivity",
        status: "down",
        latencyMs,
        detail: error.message,
      };
    }

    const status: ServiceStatus =
      latencyMs > DEGRADED_LATENCY_MS ? "degraded" : "operational";

    return {
      id: "postgres-query",
      name: "Database",
      description: "Live station records connectivity",
      status,
      latencyMs,
      detail: `${count ?? 0} account(s) verified`,
    };
  } catch (error) {
    return {
      id: "postgres-query",
      name: "Database",
      description: "Live station records connectivity",
      status: "down",
      latencyMs: Math.round(performance.now() - start),
      detail: error instanceof Error ? error.message : "Database query failed",
    };
  }
}

async function getAccountSummary(): Promise<AccountSummary> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("role, is_active");

  const rows = data ?? [];
  const byRole = { superadmin: 0, owner: 0, cashier: 0 };
  let active = 0;
  let inactive = 0;

  for (const row of rows) {
    if (row.is_active) active += 1;
    else inactive += 1;
    if (row.role in byRole) {
      byRole[row.role as keyof typeof byRole] += 1;
    }
  }

  return {
    total: rows.length,
    active,
    inactive,
    byRole,
  };
}

async function getErrorLogSummary(): Promise<ErrorLogSummary> {
  const admin = createSupabaseAdminClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Single lightweight projection replaces 9 separate COUNT(*) round-trips
  const { data, error } = await admin
    .from("system_error_logs")
    .select("level, layer, resolved, created_at");

  if (isMissingLogsTableError(error)) {
    return {
      schemaMissing: true,
      total: 0,
      unresolved: 0,
      last24h: 0,
      bySeverity: { critical: 0, error: 0, warning: 0 },
      byLayer: { backend: 0, database_auth: 0, frontend: 0 },
    };
  }

  const rows = data ?? [];
  let unresolved = 0;
  let last24h = 0;
  const bySeverity = { critical: 0, error: 0, warning: 0 };
  const byLayer = { backend: 0, database_auth: 0, frontend: 0 };

  for (const row of rows) {
    if (row.created_at >= since24h) last24h += 1;
    if (!row.resolved) {
      unresolved += 1;
      if (row.level in bySeverity) {
        bySeverity[row.level as keyof typeof bySeverity] += 1;
      }
      if (row.layer in byLayer) {
        byLayer[row.layer as keyof typeof byLayer] += 1;
      }
    }
  }

  return {
    schemaMissing: false,
    total: rows.length,
    unresolved,
    last24h,
    bySeverity,
    byLayer,
  };
}

function getRuntimeTelemetry(): RuntimeTelemetry {
  const mem = process.memoryUsage();
  const { heap_size_limit } = v8.getHeapStatistics();

  const rssMb = Math.round((mem.rss / 1024 / 1024) * 10) / 10;
  const heapUsedMb = Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10;
  const heapTotalMb = Math.round((mem.heapTotal / 1024 / 1024) * 10) / 10;
  const heapLimitMb = Math.round((heap_size_limit / 1024 / 1024) * 10) / 10;

  // Measure against V8's actual max heap limit rather than the dynamic heapTotal slice
  const heapUsagePercent =
    heapLimitMb > 0
      ? Math.min(100, Math.round((heapUsedMb / heapLimitMb) * 1000) / 10)
      : 0;

  const status: MemoryHealthStatus =
    heapUsagePercent >= 80
      ? "critical"
      : heapUsagePercent >= 60
        ? "elevated"
        : "healthy";

  return {
    nodeVersion: process.version,
    environment: process.env.NODE_ENV ?? "development",
    uptimeSeconds: Math.floor(process.uptime()),
    memory: {
      rssMb,
      heapUsedMb,
      heapTotalMb,
      heapLimitMb,
      heapUsagePercent,
      status,
    },
  };
}

/**
 * Collects a full Eagle's Eye snapshot of system health, runtime metrics,
 * account counts, and error summaries concurrently.
 */
export async function getSystemHealthSnapshot(): Promise<SystemHealthSnapshot> {
  const { url, publishableKey, secretKey, jwksUrl } = getSupabaseEnv();

  const [restProbe, authProbe, jwksProbe, pgProbe, accounts, errors] =
    await Promise.all([
      runHttpProbe({
        id: "supabase-rest",
        name: "Data Service",
        description: "Records gateway & availability",
        url: `${url}/rest/v1/`,
        headers: { apikey: secretKey },
      }),
      runHttpProbe({
        id: "supabase-auth",
        name: "Sign-In Service",
        description: "Account login & session verification",
        url: `${url}/auth/v1/health`,
        headers: { apikey: publishableKey },
      }),
      runHttpProbe({
        id: "supabase-jwks",
        name: "Security Keys",
        description: "Active session verification keys",
        url: jwksUrl,
      }),
      runPostgresQueryProbe(),
      getAccountSummary(),
      getErrorLogSummary(),
    ]);

  const probes = [restProbe, pgProbe, authProbe, jwksProbe];
  const runtime = getRuntimeTelemetry();

  // Emit a cooldown-throttled warning if V8 heap genuinely nears its max limit (>= 80%)
  if (
    runtime.memory.status === "critical" &&
    Date.now() - lastHighMemoryAlertAt > HIGH_MEMORY_LOG_COOLDOWN_MS
  ) {
    lastHighMemoryAlertAt = Date.now();
    void logSystemError({
      level: "warning",
      source: "system",
      layer: "backend",
      code: "HIGH_HEAP_USAGE",
      route: "/api/superadmin/health",
      message: `Node.js heap usage reached ${runtime.memory.heapUsagePercent}% (${runtime.memory.heapUsedMb} / ${runtime.memory.heapLimitMb} MB)`,
      metadata: {
        rssMb: runtime.memory.rssMb,
        heapUsedMb: runtime.memory.heapUsedMb,
        heapTotalMb: runtime.memory.heapTotalMb,
        heapLimitMb: runtime.memory.heapLimitMb,
      },
    });
  }

  let overallStatus: ServiceStatus = "operational";
  if (probes.some((p) => p.status === "down") || errors.bySeverity.critical > 0) {
    overallStatus = "down";
  } else if (
    probes.some((p) => p.status === "degraded") ||
    errors.bySeverity.error > 0 ||
    runtime.memory.status === "critical"
  ) {
    overallStatus = "degraded";
  }

  return {
    overallStatus,
    checkedAt: new Date().toISOString(),
    probes,
    runtime,
    accounts,
    errors,
  };
}

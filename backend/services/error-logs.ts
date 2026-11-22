import "server-only";

import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/backend/db/supabase";
import type {
  Database,
  ErrorLogLayer,
  ErrorLogLevel,
  ErrorLogSource,
  Json,
} from "@/backend/db/types";
import { AuthServiceError } from "@/backend/services/auth";

export type SystemErrorLog =
  Database["public"]["Tables"]["system_error_logs"]["Row"];

export type ErrorLogGroupBy = "severity" | "layer";
export type ErrorLogExportFormat = "json" | "txt" | "log";
export type ResolvedFilter = "all" | "open" | "resolved";

export interface ErrorLogSection {
  key: ErrorLogLevel | ErrorLogLayer;
  title: string;
  description: string;
  total: number;
  items: SystemErrorLog[];
}

export interface GroupedErrorLogsResult {
  groupBy: ErrorLogGroupBy;
  sections: ErrorLogSection[];
  totalCount: number;
  schemaMissing: boolean;
}

const SENSITIVE_KEY_PATTERN =
  /(password|secret|token|authorization|cookie|apikey|api_key|credential)/i;

const LEVEL_SET = new Set<ErrorLogLevel>(["critical", "error", "warning"]);
const LAYER_SET = new Set<ErrorLogLayer>([
  "backend",
  "database_auth",
  "frontend",
]);
const SOURCE_SET = new Set<ErrorLogSource>([
  "api",
  "database",
  "auth",
  "client",
  "system",
]);

export function isValidErrorLevel(value: unknown): value is ErrorLogLevel {
  return typeof value === "string" && LEVEL_SET.has(value as ErrorLogLevel);
}

export function isValidErrorLayer(value: unknown): value is ErrorLogLayer {
  return typeof value === "string" && LAYER_SET.has(value as ErrorLogLayer);
}

export function isValidErrorSource(value: unknown): value is ErrorLogSource {
  return typeof value === "string" && SOURCE_SET.has(value as ErrorLogSource);
}

export function resolveLayerFromSource(source: ErrorLogSource): ErrorLogLayer {
  switch (source) {
    case "database":
    case "auth":
      return "database_auth";
    case "client":
      return "frontend";
    case "api":
    case "system":
    default:
      return "backend";
  }
}

export function isMissingLogsTableError(
  error: { code?: string; message?: string } | null | undefined
): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    Boolean(error.message?.includes("system_error_logs"))
  );
}

function redactMetadata(value: unknown, depth = 0): Json {
  if (depth > 4) return "[Truncated]";
  if (value === null || value === undefined) return null;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 25).map((item) => redactMetadata(item, depth + 1));
  }
  if (typeof value === "object") {
    const output: Record<string, Json> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        output[key] = "[REDACTED]";
      } else {
        output[key] = redactMetadata(val, depth + 1);
      }
    }
    return output;
  }
  return String(value);
}

export interface LogSystemErrorInput {
  level: ErrorLogLevel;
  source?: ErrorLogSource;
  layer?: ErrorLogLayer;
  message: string;
  code?: string | null;
  route?: string | null;
  stack?: string | null;
  metadata?: Record<string, unknown>;
  userId?: string | null;
}

/**
 * Persists a system error log via the server admin client.
 * Never throws so logging failures never crash request handlers.
 */
export async function logSystemError(
  input: LogSystemErrorInput
): Promise<SystemErrorLog | null> {
  try {
    const source: ErrorLogSource = input.source ?? "api";
    const layer: ErrorLogLayer = input.layer ?? resolveLayerFromSource(source);
    const admin = createSupabaseAdminClient();

    const { data, error } = await admin
      .from("system_error_logs")
      .insert({
        level: input.level,
        layer,
        source,
        message: input.message.slice(0, 2000),
        code: input.code?.slice(0, 120) ?? null,
        route: input.route?.slice(0, 300) ?? null,
        stack: input.stack?.slice(0, 8000) ?? null,
        metadata: input.metadata ? redactMetadata(input.metadata) : {},
        user_id: input.userId ?? null,
      })
      .select("*")
      .single();

    if (error) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

export interface ErrorLogsQueryFilters {
  groupBy?: ErrorLogGroupBy;
  search?: string;
  level?: ErrorLogLevel | "all";
  layer?: ErrorLogLayer | "all";
  resolved?: ResolvedFilter;
  limitPerSection?: number;
}

const SEVERITY_SECTION_META: {
  key: ErrorLogLevel;
  title: string;
  description: string;
}[] = [
  {
    key: "critical",
    title: "Critical Priority",
    description: "Service outages and major failures that need immediate attention",
  },
  {
    key: "error",
    title: "Error Priority",
    description: "Failed actions and system errors that should be reviewed soon",
  },
  {
    key: "warning",
    title: "Needs Attention",
    description: "Slow responses, login notices, and minor alerts",
  },
];

const LAYER_SECTION_META: {
  key: ErrorLogLayer;
  title: string;
  description: string;
}[] = [
  {
    key: "backend",
    title: "Server",
    description: "Background station services and request handling",
  },
  {
    key: "database_auth",
    title: "Database & Sign-In",
    description: "Data storage, account access, and active sessions",
  },
  {
    key: "frontend",
    title: "App Screen",
    description: "Display issues, button actions, and connection drops",
  },
];

function sanitizeSearchTerm(term: string): string {
  return term.replace(/[%_,()]/g, " ").trim().slice(0, 100);
}

/**
 * Fetches error logs organized into 3 sections (by Severity OR by Layer)
 * using 3 concurrent indexed queries for predictable low-latency performance.
 */
export async function getGroupedErrorLogs(
  filters: ErrorLogsQueryFilters = {}
): Promise<GroupedErrorLogsResult> {
  const groupBy: ErrorLogGroupBy =
    filters.groupBy === "layer" ? "layer" : "severity";
  const limit = Math.min(Math.max(filters.limitPerSection ?? 25, 1), 100);
  const search = filters.search ? sanitizeSearchTerm(filters.search) : "";
  const resolved = filters.resolved ?? "all";

  const supabase = await createSupabaseServerClient();
  const defs =
    groupBy === "layer" ? LAYER_SECTION_META : SEVERITY_SECTION_META;

  const sectionResults = await Promise.all(
    defs.map(async (def) => {
      let query = supabase
        .from("system_error_logs")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(limit);

      if (groupBy === "severity") {
        query = query.eq("level", def.key as ErrorLogLevel);
        if (filters.layer && filters.layer !== "all") {
          query = query.eq("layer", filters.layer);
        }
      } else {
        query = query.eq("layer", def.key as ErrorLogLayer);
        if (filters.level && filters.level !== "all") {
          query = query.eq("level", filters.level);
        }
      }

      if (resolved === "open") {
        query = query.eq("resolved", false);
      } else if (resolved === "resolved") {
        query = query.eq("resolved", true);
      }

      if (search) {
        query = query.or(
          `message.ilike.%${search}%,route.ilike.%${search}%,code.ilike.%${search}%`
        );
      }

      const { data, count, error } = await query;

      if (error) {
        if (isMissingLogsTableError(error)) {
          return {
            schemaMissing: true as const,
            section: {
              key: def.key,
              title: def.title,
              description: def.description,
              total: 0,
              items: [] as SystemErrorLog[],
            },
          };
        }
        throw new AuthServiceError(error.message, 500);
      }

      return {
        schemaMissing: false as const,
        section: {
          key: def.key,
          title: def.title,
          description: def.description,
          total: count ?? data?.length ?? 0,
          items: data ?? [],
        },
      };
    })
  );

  const schemaMissing = sectionResults.some((r) => r.schemaMissing);
  const sections = sectionResults.map((r) => r.section);
  const totalCount = sections.reduce((sum, s) => sum + s.total, 0);

  return {
    groupBy,
    sections,
    totalCount,
    schemaMissing,
  };
}

export async function setErrorLogResolved(
  id: string,
  resolved: boolean,
  actorId: string
): Promise<SystemErrorLog> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("system_error_logs")
    .update({
      resolved,
      resolved_at: resolved ? new Date().toISOString() : null,
      resolved_by: resolved ? actorId : null,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    if (isMissingLogsTableError(error)) {
      throw new AuthServiceError(
        "system_error_logs table is not created yet. Run backend/db/schema.sql in Supabase SQL Editor.",
        503
      );
    }
    throw new AuthServiceError(
      error?.message ?? "Error log not found",
      error?.code === "PGRST116" ? 404 : 500
    );
  }

  return data;
}

export interface ExportLogsFilter {
  groupBy: ErrorLogGroupBy;
  section?: string;
  level?: ErrorLogLevel | "all";
  layer?: ErrorLogLayer | "all";
  resolved?: ResolvedFilter;
  search?: string;
}

const MAX_EXPORT_ROWS = 5000;

export async function getErrorLogsForExport(
  filters: ExportLogsFilter
): Promise<SystemErrorLog[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("system_error_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(MAX_EXPORT_ROWS);

  if (filters.section && filters.section !== "all") {
    if (filters.groupBy === "severity" && isValidErrorLevel(filters.section)) {
      query = query.eq("level", filters.section);
    } else if (
      filters.groupBy === "layer" &&
      isValidErrorLayer(filters.section)
    ) {
      query = query.eq("layer", filters.section);
    }
  }

  if (filters.level && filters.level !== "all") {
    query = query.eq("level", filters.level);
  }

  if (filters.layer && filters.layer !== "all") {
    query = query.eq("layer", filters.layer);
  }

  if (filters.resolved === "open") {
    query = query.eq("resolved", false);
  } else if (filters.resolved === "resolved") {
    query = query.eq("resolved", true);
  }

  if (filters.search) {
    const clean = sanitizeSearchTerm(filters.search);
    if (clean) {
      query = query.or(
        `message.ilike.%${clean}%,route.ilike.%${clean}%,code.ilike.%${clean}%`
      );
    }
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingLogsTableError(error)) {
      return [];
    }
    throw new AuthServiceError(error.message, 500);
  }

  return data ?? [];
}

export function serializeErrorLogsJson(
  logs: SystemErrorLog[],
  meta: {
    exportedAt: string;
    groupBy: ErrorLogGroupBy;
    section: string;
    resolved: ResolvedFilter;
  }
): string {
  return JSON.stringify(
    {
      application: "G & A Aqua Vitae",
      exportedAt: meta.exportedAt,
      groupBy: meta.groupBy,
      section: meta.section,
      resolvedFilter: meta.resolved,
      totalRecords: logs.length,
      logs,
    },
    null,
    2
  );
}

export function serializeErrorLogsTxt(
  logs: SystemErrorLog[],
  meta: {
    exportedAt: string;
    groupBy: ErrorLogGroupBy;
    section: string;
    resolved: ResolvedFilter;
  }
): string {
  const divider = "=".repeat(72);
  const subDivider = "-".repeat(72);
  const lines: string[] = [
    divider,
    "G & A AQUA VITAE SYSTEM ERROR LOGS REPORT",
    divider,
    `Exported At : ${meta.exportedAt}`,
    `Group Mode  : ${meta.groupBy}`,
    `Section     : ${meta.section}`,
    `Status      : ${meta.resolved}`,
    `Total Logs  : ${logs.length}`,
    divider,
    "",
  ];

  if (logs.length === 0) {
    lines.push("No error logs matched the selected filters.");
    return lines.join("\n");
  }

  for (const log of logs) {
    lines.push(`[${log.created_at}] ${log.level.toUpperCase()} (${log.layer} / ${log.source})`);
    lines.push(`ID       : ${log.id}`);
    lines.push(`Status   : ${log.resolved ? `Resolved (${log.resolved_at ?? "unknown"})` : "Open"}`);
    if (log.code) lines.push(`Code     : ${log.code}`);
    if (log.route) lines.push(`Route    : ${log.route}`);
    lines.push(`Message  : ${log.message}`);
    if (log.metadata && Object.keys(log.metadata as Record<string, unknown>).length > 0) {
      lines.push(`Metadata : ${JSON.stringify(log.metadata)}`);
    }
    if (log.stack) {
      lines.push("Stack    :");
      lines.push(
        log.stack
          .split("\n")
          .map((s) => `  ${s}`)
          .join("\n")
      );
    }
    lines.push(subDivider);
  }

  return lines.join("\n");
}

export function serializeErrorLogsLog(logs: SystemErrorLog[]): string {
  if (logs.length === 0) {
    return `# G & A Aqua Vitae Error Log Stream — 0 matching entries (${new Date().toISOString()})\n`;
  }

  const lines: string[] = [];

  for (const log of logs) {
    const level = log.level.toUpperCase().padEnd(8, " ");
    const layer = `${log.layer}/${log.source}`;
    const route = log.route ?? "-";
    const code = log.code ?? "-";
    const status = log.resolved ? "RESOLVED" : "OPEN";
    const safeMsg = log.message.replace(/\r?\n/g, " ");

    lines.push(
      `[${log.created_at}] [${level.trim()}] [${layer}] [route=${route}] [code=${code}] [status=${status}] [id=${log.id}] ${safeMsg}`
    );

    if (log.metadata && Object.keys(log.metadata as Record<string, unknown>).length > 0) {
      lines.push(`  meta=${JSON.stringify(log.metadata)}`);
    }

    if (log.stack) {
      for (const stackLine of log.stack.split("\n")) {
        lines.push(`  ${stackLine}`);
      }
    }
  }

  return `${lines.join("\n")}\n`;
}

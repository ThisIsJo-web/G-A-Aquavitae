import "server-only";

import { after } from "next/server";
import { createSupabaseAdminClient } from "@/backend/db/supabase";
import type {
  ActivityActorRole,
  ActivityStatus,
  Database,
  Json,
} from "@/backend/db/types";
import { AuthServiceError } from "@/backend/services/auth";

export type SystemActivityLogRow =
  Database["public"]["Tables"]["system_activity_logs"]["Row"];

export interface ActivityActorInput {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  role?: ActivityActorRole | string | null;
}

export interface RecordActivityInput {
  actor?: ActivityActorInput | null;
  stationOwnerId?: string | null;
  module: string;
  action: string;
  controlLabel?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  route?: string | null;
  status?: ActivityStatus;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

const SENSITIVE_KEYS =
  /(password|secret|token|authorization|cookie|apikey|api_key|credential)/i;

function sanitizeDetails(value: unknown, depth = 0): Json {
  if (depth > 3) return "[Truncated]";
  if (value === null || value === undefined) return null;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return typeof value === "string" ? value.slice(0, 500) : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeDetails(item, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, Json> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.test(k)
        ? "[Hidden]"
        : sanitizeDetails(v, depth + 1);
    }
    return out;
  }
  return String(value).slice(0, 300);
}

function normalizeRole(role?: string | null): ActivityActorRole {
  if (role === "superadmin" || role === "owner" || role === "cashier") {
    return role;
  }
  return "anonymous";
}

export function isMissingActivityTableError(
  error: { code?: string; message?: string } | null | undefined
): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    Boolean(error.message?.match(/system_activity_logs/i))
  );
}

/**
 * Inserts a single activity log entry. Never throws so user actions are never disrupted.
 */
export async function recordActivityLog(
  input: RecordActivityInput
): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    const actorEmail = input.actor?.email?.trim() || "unknown";
    const actorName = input.actor?.name?.trim() || actorEmail;
    const actorRole = normalizeRole(input.actor?.role);

    await admin.from("system_activity_logs").insert({
      actor_id: input.actor?.id ?? null,
      actor_name: actorName.slice(0, 160),
      actor_email: actorEmail.slice(0, 200),
      actor_role: actorRole,
      station_owner_id: input.stationOwnerId ?? null,
      module: input.module.slice(0, 60),
      action: input.action.slice(0, 240),
      control_label: input.controlLabel?.slice(0, 120) ?? null,
      target_type: input.targetType?.slice(0, 80) ?? null,
      target_id: input.targetId?.slice(0, 120) ?? null,
      target_label: input.targetLabel?.slice(0, 200) ?? null,
      route: input.route?.slice(0, 240) ?? null,
      status: input.status ?? "success",
      details: input.details ? sanitizeDetails(input.details) : {},
      ip_address: input.ipAddress?.slice(0, 80) ?? null,
      user_agent: input.userAgent?.slice(0, 300) ?? null,
    });
  } catch {
    // Non-blocking audit logging: never fail caller requests
  }
}

/**
 * Inserts a batch of client UI activity entries in a single DB round-trip.
 */
export async function recordActivityBatch(
  entries: RecordActivityInput[]
): Promise<void> {
  if (entries.length === 0) return;
  try {
    const admin = createSupabaseAdminClient();
    const rows = entries.slice(0, 30).map((input) => {
      const actorEmail = input.actor?.email?.trim() || "unknown";
      const actorName = input.actor?.name?.trim() || actorEmail;
      return {
        actor_id: input.actor?.id ?? null,
        actor_name: actorName.slice(0, 160),
        actor_email: actorEmail.slice(0, 200),
        actor_role: normalizeRole(input.actor?.role),
        station_owner_id: input.stationOwnerId ?? null,
        module: input.module.slice(0, 60),
        action: input.action.slice(0, 240),
        control_label: input.controlLabel?.slice(0, 120) ?? null,
        target_type: input.targetType?.slice(0, 80) ?? null,
        target_id: input.targetId?.slice(0, 120) ?? null,
        target_label: input.targetLabel?.slice(0, 200) ?? null,
        route: input.route?.slice(0, 240) ?? null,
        status: input.status ?? "success",
        details: input.details ? sanitizeDetails(input.details) : {},
        ip_address: input.ipAddress?.slice(0, 80) ?? null,
        user_agent: input.userAgent?.slice(0, 300) ?? null,
      };
    });

    await admin.from("system_activity_logs").insert(rows);
  } catch {
    // Non-blocking
  }
}

/**
 * Schedules activity logging using Next.js `after()` so it adds 0ms to API response latency.
 */
export function scheduleActivityLog(input: RecordActivityInput): void {
  try {
    after(() => recordActivityLog(input));
  } catch {
    void recordActivityLog(input);
  }
}

export interface ActivityLogsQuery {
  search?: string | null;
  role?: string | null;
  module?: string | null;
  from?: string | null;
  to?: string | null;
  limit?: number;
}

export interface ActivityLogsResult {
  schemaMissing: boolean;
  totalMatching: number;
  entries: SystemActivityLogRow[];
  summary: {
    todayTotal: number;
    activeActorsToday: number;
    ownerActions: number;
    cashierActions: number;
    superadminActions: number;
  };
}

function getManilaTodayStartIso(): string {
  const todayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return `${todayStr}T00:00:00+08:00`;
}

export async function queryActivityLogs(
  filters: ActivityLogsQuery = {}
): Promise<ActivityLogsResult> {
  const admin = createSupabaseAdminClient();
  const limit = Math.min(Math.max(filters.limit ?? 150, 10), 500);
  const search = filters.search
    ? filters.search.replace(/[%_,()]/g, " ").trim().slice(0, 100)
    : "";

  let query = admin
    .from("system_activity_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters.role && filters.role !== "all") {
    query = query.eq("actor_role", filters.role as ActivityActorRole);
  }
  if (filters.module && filters.module !== "all") {
    query = query.eq("module", filters.module);
  }
  if (filters.from && /^\d{4}-\d{2}-\d{2}$/.test(filters.from)) {
    query = query.gte("created_at", `${filters.from}T00:00:00+08:00`);
  }
  if (filters.to && /^\d{4}-\d{2}-\d{2}$/.test(filters.to)) {
    query = query.lte("created_at", `${filters.to}T23:59:59.999+08:00`);
  }
  if (search) {
    query = query.or(
      `actor_name.ilike.%${search}%,actor_email.ilike.%${search}%,action.ilike.%${search}%,control_label.ilike.%${search}%,target_label.ilike.%${search}%`
    );
  }

  const todayStartIso = getManilaTodayStartIso();
  const [listRes, todayRes] = await Promise.all([
    query,
    admin
      .from("system_activity_logs")
      .select("actor_email, actor_role")
      .gte("created_at", todayStartIso)
      .limit(2000),
  ]);

  if (isMissingActivityTableError(listRes.error)) {
    return {
      schemaMissing: true,
      totalMatching: 0,
      entries: [],
      summary: {
        todayTotal: 0,
        activeActorsToday: 0,
        ownerActions: 0,
        cashierActions: 0,
        superadminActions: 0,
      },
    };
  }

  if (listRes.error) {
    throw new AuthServiceError(listRes.error.message, 500);
  }

  const todayRows = todayRes.data ?? [];
  const uniqueActors = new Set<string>();
  let ownerActions = 0;
  let cashierActions = 0;
  let superadminActions = 0;

  for (const row of todayRows) {
    if (row.actor_email) uniqueActors.add(row.actor_email);
    if (row.actor_role === "owner") ownerActions += 1;
    else if (row.actor_role === "cashier") cashierActions += 1;
    else if (row.actor_role === "superadmin") superadminActions += 1;
  }

  return {
    schemaMissing: false,
    totalMatching: listRes.count ?? listRes.data?.length ?? 0,
    entries: listRes.data ?? [],
    summary: {
      todayTotal: todayRows.length,
      activeActorsToday: uniqueActors.size,
      ownerActions,
      cashierActions,
      superadminActions,
    },
  };
}

function escapeCsv(val: unknown): string {
  const s = String(val ?? "");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function serializeActivityLogs(
  entries: SystemActivityLogRow[],
  format: "csv" | "json"
): { contentType: string; extension: string; body: string } {
  if (format === "json") {
    return {
      contentType: "application/json; charset=utf-8",
      extension: "json",
      body: JSON.stringify(
        {
          application: "G & A Aqua Vitae",
          exportedAt: new Date().toISOString(),
          totalRecords: entries.length,
          entries,
        },
        null,
        2
      ),
    };
  }

  const header =
    "Timestamp,User Name,Email,Role,Module,Action,Button / Control,Target,Status";
  const rows = entries.map((e) =>
    [
      e.created_at,
      e.actor_name,
      e.actor_email,
      e.actor_role,
      e.module,
      e.action,
      e.control_label ?? "",
      e.target_label ?? "",
      e.status,
    ]
      .map(escapeCsv)
      .join(",")
  );

  return {
    contentType: "text/csv; charset=utf-8",
    extension: "csv",
    body: [header, ...rows].join("\n"),
  };
}

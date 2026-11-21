import type {
  ErrorLogLayer,
  ErrorLogLevel,
  ErrorLogSource,
  Json,
  UserRole,
} from "@/backend/db/types";

export type { ErrorLogLayer, ErrorLogLevel, ErrorLogSource, Json, UserRole };

export type ServiceStatus = "operational" | "degraded" | "down";
export type MemoryHealthStatus = "healthy" | "elevated" | "critical";
export type ErrorLogGroupBy = "severity" | "layer";
export type ErrorLogExportFormat = "json" | "txt" | "log";
export type ResolvedFilter = "all" | "open" | "resolved";

export interface ServiceProbeDTO {
  id: string;
  name: string;
  description: string;
  status: ServiceStatus;
  latencyMs: number;
  detail: string;
}

export interface RuntimeTelemetryDTO {
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

export interface AccountSummaryDTO {
  total: number;
  active: number;
  inactive: number;
  byRole: {
    superadmin: number;
    owner: number;
    cashier: number;
    staff: number;
  };
}

export interface ErrorLogSummaryDTO {
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

export interface SystemHealthSnapshotDTO {
  overallStatus: ServiceStatus;
  checkedAt: string;
  probes: ServiceProbeDTO[];
  runtime: RuntimeTelemetryDTO;
  accounts: AccountSummaryDTO;
  errors: ErrorLogSummaryDTO;
}

export interface SystemErrorLogDTO {
  id: string;
  level: ErrorLogLevel;
  layer: ErrorLogLayer;
  source: ErrorLogSource;
  message: string;
  code: string | null;
  route: string | null;
  stack: string | null;
  metadata: Json;
  user_id: string | null;
  resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}

export interface ErrorLogSectionDTO {
  key: ErrorLogLevel | ErrorLogLayer;
  title: string;
  description: string;
  total: number;
  items: SystemErrorLogDTO[];
}

export interface GroupedErrorLogsDTO {
  groupBy: ErrorLogGroupBy;
  sections: ErrorLogSectionDTO[];
  totalCount: number;
  schemaMissing: boolean;
}

export interface ManagedUserDTO {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  is_active: boolean;
  owner_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

"use client";

import { AlertTriangle, CheckCircle2, Download, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { trackAction } from "@/app/_components/activity-tracker";
import {
  EmptyState,
  NoticeBanner,
  RowActionMenu,
  StatusChip,
} from "@/app/_components/ui/monochrome-controls";
import type {
  ErrorLogExportFormat,
  ErrorLogGroupBy,
  ErrorLogLayer,
  ErrorLogLevel,
  GroupedErrorLogsDTO,
  ResolvedFilter,
  SystemErrorLogDTO,
} from "./types";

interface ErrorLogsBoardProps {
  initialLogs: GroupedErrorLogsDTO;
  refreshSignal: number;
  onLogsMutated: () => Promise<void> | void;
}

const LAYER_LABELS: Record<ErrorLogLayer, string> = {
  backend: "Server",
  database_auth: "Database & Sign-In",
  frontend: "Screen & Controls",
};

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * Semantic handling colors:
 * - Green  = Operational (Resolved / No open issues)
 * - Yellow = Needs Attention (Warning)
 * - Red    = Priority (Critical / Error)
 */
function getLogSemantic(log: SystemErrorLogDTO): {
  tone: "green" | "yellow" | "red";
  badgeLabel: string;
  cardClass: string;
} {
  if (log.resolved) {
    return {
      tone: "green",
      badgeLabel: "Operational (Resolved)",
      cardClass:
        "border-l-4 border-l-emerald-500 bg-emerald-500/8 hover:bg-emerald-500/12",
    };
  }
  if (log.level === "warning") {
    return {
      tone: "yellow",
      badgeLabel: "Needs Attention",
      cardClass:
        "border-l-4 border-l-amber-500 bg-amber-500/10 hover:bg-amber-500/15",
    };
  }
  return {
    tone: "red",
    badgeLabel: log.level === "critical" ? "Priority · Critical" : "Priority · Error",
    cardClass:
      "border-l-4 border-l-red-500 bg-red-500/10 hover:bg-red-500/15",
  };
}

function getSectionAccent(
  key: ErrorLogLevel | ErrorLogLayer,
  items: SystemErrorLogDTO[]
): {
  headerBorderClass: string;
  badgeClass: string;
  statusLabel: string;
  statusTone: "green" | "yellow" | "red";
} {
  const openItems = items.filter((item) => !item.resolved);
  const hasPriority = openItems.some(
    (item) => item.level === "critical" || item.level === "error"
  );
  const hasAttention = openItems.some((item) => item.level === "warning");

  if (key === "critical" || key === "error") {
    if (openItems.length === 0) {
      return {
        headerBorderClass: "border-t-4 border-t-emerald-500",
        badgeClass:
          "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30",
        statusLabel: "Operational",
        statusTone: "green",
      };
    }
    return {
      headerBorderClass: "border-t-4 border-t-red-500",
      badgeClass:
        "bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500/35",
      statusLabel: "Priority",
      statusTone: "red",
    };
  }

  if (key === "warning") {
    if (openItems.length === 0) {
      return {
        headerBorderClass: "border-t-4 border-t-emerald-500",
        badgeClass:
          "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30",
        statusLabel: "Operational",
        statusTone: "green",
      };
    }
    return {
      headerBorderClass: "border-t-4 border-t-amber-500",
      badgeClass:
        "bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/35",
      statusLabel: "Needs Attention",
      statusTone: "yellow",
    };
  }

  // Grouped by Area (backend / database_auth / frontend)
  if (hasPriority) {
    return {
      headerBorderClass: "border-t-4 border-t-red-500",
      badgeClass:
        "bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500/35",
      statusLabel: "Priority",
      statusTone: "red",
    };
  }
  if (hasAttention) {
    return {
      headerBorderClass: "border-t-4 border-t-amber-500",
      badgeClass:
        "bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/35",
      statusLabel: "Needs Attention",
      statusTone: "yellow",
    };
  }
  return {
    headerBorderClass: "border-t-4 border-t-emerald-500",
    badgeClass:
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30",
    statusLabel: "Operational",
    statusTone: "green",
  };
}

export function ErrorLogsBoard({
  initialLogs,
  refreshSignal,
  onLogsMutated,
}: ErrorLogsBoardProps) {
  const [logsData, setLogsData] = useState<GroupedErrorLogsDTO>(initialLogs);
  const [groupBy, setGroupBy] = useState<ErrorLogGroupBy>(initialLogs.groupBy);
  const [resolvedFilter, setResolvedFilter] = useState<ResolvedFilter>("all");
  const [crossLevel, setCrossLevel] = useState<ErrorLogLevel | "all">("all");
  const [crossLayer, setCrossLayer] = useState<ErrorLogLayer | "all">("all");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [emittingTest, setEmittingTest] = useState(false);

  const isFirstRender = useRef(true);
  const fetchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      fetchAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchLogs = useCallback(async () => {
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    setLoading(true);
    setActionError(null);
    try {
      const params = new URLSearchParams({
        groupBy,
        resolved: resolvedFilter,
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (groupBy === "severity" && crossLayer !== "all") {
        params.set("layer", crossLayer);
      }
      if (groupBy === "layer" && crossLevel !== "all") {
        params.set("level", crossLevel);
      }

      const res = await fetch(`/api/superadmin/logs?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      });

      const payload = (await res.json()) as GroupedErrorLogsDTO & {
        error?: string;
      };

      if (!res.ok) {
        setActionError(payload.error ?? "Unable to load error logs.");
        return;
      }

      setLogsData(payload);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setActionError("Connection problem while loading error logs.");
    } finally {
      if (fetchAbortRef.current === controller) {
        setLoading(false);
      }
    }
  }, [groupBy, resolvedFilter, debouncedSearch, crossLayer, crossLevel]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    void fetchLogs();
  }, [fetchLogs, refreshSignal]);

  function buildExportUrl(
    format: ErrorLogExportFormat,
    section: string = "all"
  ): string {
    const params = new URLSearchParams({
      format,
      groupBy,
      section,
      resolved: resolvedFilter,
    });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (groupBy === "severity" && crossLayer !== "all") {
      params.set("layer", crossLayer);
    }
    if (groupBy === "layer" && crossLevel !== "all") {
      params.set("level", crossLevel);
    }
    return `/api/superadmin/logs/export?${params.toString()}`;
  }

  async function handleToggleResolved(log: SystemErrorLogDTO) {
    setTogglingId(log.id);
    setActionError(null);
    trackAction({
      module: "error-logs",
      action: log.resolved ? "Reopened error log" : "Marked error log as resolved",
      controlLabel: log.resolved ? "Reopen Log" : "Mark Resolved",
      targetLabel: log.message.slice(0, 80),
    });
    try {
      const res = await fetch(`/api/superadmin/logs/${log.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved: !log.resolved }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setActionError(data.error ?? "Unable to update log status.");
        return;
      }
      await Promise.all([fetchLogs(), Promise.resolve(onLogsMutated())]);
    } catch {
      setActionError("Connection problem while updating log status.");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleEmitDiagnosticLogs() {
    setEmittingTest(true);
    setActionError(null);
    trackAction({
      module: "error-logs",
      action: "Created sample diagnostic error logs",
      controlLabel: "Test Logs",
    });
    try {
      const samples = [
        {
          level: "critical",
          source: "database",
          layer: "database_auth",
          code: "DB_BUSY",
          route: "/superadmin/health",
          message: "Sample priority alert: database connection traffic near limit",
          metadata: { sample: true, activeConnections: 98, limit: 100 },
        },
        {
          level: "error",
          source: "api",
          layer: "backend",
          code: "SERVER_ERROR",
          route: "/api/users",
          message: "Sample priority alert: server request failed to complete",
          metadata: { sample: true, retrySuggested: true },
        },
        {
          level: "warning",
          source: "client",
          layer: "frontend",
          code: "SLOW_SCREEN",
          route: "/superadmin/health",
          message: "Sample attention alert: screen took longer than usual to load",
          metadata: { sample: true, loadTimeMs: 1240 },
        },
      ];

      for (const sample of samples) {
        const res = await fetch("/api/superadmin/logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sample),
        });
        if (!res.ok) {
          const err = (await res.json()) as { error?: string };
          setActionError(err.error ?? "Unable to create sample log.");
          return;
        }
      }

      await Promise.all([fetchLogs(), Promise.resolve(onLogsMutated())]);
    } catch {
      setActionError("Connection problem while creating sample logs.");
    } finally {
      setEmittingTest(false);
    }
  }

  return (
    <section aria-label="System Error Logs" className="space-y-6">
      {logsData.schemaMissing && (
        <NoticeBanner
          tone="info"
          message="The error logs table is not set up yet. Run the database setup script to activate error tracking."
        />
      )}

      {/* Control Bar + Color Legend */}
      <div className="av-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-[var(--av-ink)]">
              Error Logs ({logsData.totalCount})
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusChip label="Green: Operational" tone="green" dot />
              <StatusChip label="Yellow: Needs Attention" tone="yellow" dot />
              <StatusChip label="Red: Priority" tone="red" dot />
            </div>
          </div>

          {/* Group-By Switcher */}
          <div className="inline-flex rounded-full bg-[var(--av-surface-subtle)] p-1">
            <button
              type="button"
              onClick={() => {
                setGroupBy("severity");
                setCrossLevel("all");
                trackAction({
                  module: "error-logs",
                  action: "Grouped error logs by priority",
                  controlLabel: "By Priority",
                });
              }}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                groupBy === "severity"
                  ? "bg-[var(--av-accent)] text-[var(--av-accent-ink)]"
                  : "text-[var(--av-muted)] hover:text-[var(--av-ink)]"
              }`}
            >
              By Priority
            </button>
            <button
              type="button"
              onClick={() => {
                setGroupBy("layer");
                setCrossLayer("all");
                trackAction({
                  module: "error-logs",
                  action: "Grouped error logs by area",
                  controlLabel: "By Area",
                });
              }}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                groupBy === "layer"
                  ? "bg-[var(--av-accent)] text-[var(--av-accent-ink)]"
                  : "text-[var(--av-muted)] hover:text-[var(--av-ink)]"
              }`}
            >
              By Area
            </button>
          </div>
        </div>

        {/* Filters & Export Pills */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--av-border)] pt-5">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="relative min-w-[210px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 h-3.5 w-3.5 -translate-y-1/2 text-[var(--av-muted)]" />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search message, page, or code..."
                className="av-input w-full rounded-full py-2 pr-3.5 pl-9 text-xs"
              />
            </div>

            <select
              value={resolvedFilter}
              onChange={(e) =>
                setResolvedFilter(e.target.value as ResolvedFilter)
              }
              aria-label="Filter by status"
              className="av-input rounded-full px-3.5 py-2 text-xs font-semibold"
            >
              <option value="all">All Statuses</option>
              <option value="open">Open Only</option>
              <option value="resolved">Resolved (Operational)</option>
            </select>

            {groupBy === "severity" ? (
              <select
                value={crossLayer}
                onChange={(e) =>
                  setCrossLayer(e.target.value as ErrorLogLayer | "all")
                }
                aria-label="Filter by area"
                className="av-input rounded-full px-3.5 py-2 text-xs font-semibold"
              >
                <option value="all">All Areas</option>
                <option value="backend">Server</option>
                <option value="database_auth">Database &amp; Sign-In</option>
                <option value="frontend">Screen &amp; Controls</option>
              </select>
            ) : (
              <select
                value={crossLevel}
                onChange={(e) =>
                  setCrossLevel(e.target.value as ErrorLogLevel | "all")
                }
                aria-label="Filter by priority"
                className="av-input rounded-full px-3.5 py-2 text-xs font-semibold"
              >
                <option value="all">All Priorities</option>
                <option value="critical">Priority · Critical</option>
                <option value="error">Priority · Error</option>
                <option value="warning">Needs Attention · Warning</option>
              </select>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleEmitDiagnosticLogs}
              disabled={emittingTest || logsData.schemaMissing}
              className="av-btn-outline inline-flex items-center gap-1.5 px-3.5 py-2 text-xs disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
              {emittingTest ? "Logging..." : "Test Logs"}
            </button>

            <div className="inline-flex items-center gap-1 rounded-full bg-[var(--av-surface-subtle)] p-1 pl-3">
              <Download className="h-3.5 w-3.5 text-[var(--av-muted)]" />
              <span className="mr-1 text-[11px] font-semibold text-[var(--av-muted)]">
                Export
              </span>
              {(["json", "txt", "log"] as ErrorLogExportFormat[]).map((fmt) => (
                <a
                  key={fmt}
                  href={buildExportUrl(fmt, "all")}
                  download
                  onClick={() =>
                    trackAction({
                      module: "error-logs",
                      action: `Exported error logs as .${fmt}`,
                      controlLabel: `Export .${fmt.toUpperCase()}`,
                    })
                  }
                  className="rounded-full border border-[var(--av-border-strong)] bg-[var(--av-surface)] px-2.5 py-1 text-[11px] font-semibold uppercase text-[var(--av-ink)] transition hover:bg-[var(--av-accent)] hover:text-[var(--av-accent-ink)]"
                >
                  .{fmt}
                </a>
              ))}
            </div>
          </div>
        </div>

        {actionError && (
          <div className="mt-4">
            <NoticeBanner
              tone="error"
              message={actionError}
              onDismiss={() => setActionError(null)}
            />
          </div>
        )}
      </div>

      {/* 3 Color-Coded Sections */}
      <div
        className={`grid gap-4 lg:grid-cols-3 ${loading ? "opacity-65" : ""}`}
      >
        {logsData.sections.map((section) => {
          const accent = getSectionAccent(section.key, section.items);

          return (
            <div
              key={section.key}
              className={`av-card flex flex-col overflow-hidden ${accent.headerBorderClass}`}
            >
              {/* Section Header */}
              <div className="border-b border-[var(--av-border)] px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[var(--av-ink)]">
                      {section.title}
                    </h3>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${accent.badgeClass}`}
                    >
                      {section.total}
                    </span>
                  </div>

                  <StatusChip
                    label={accent.statusLabel}
                    tone={accent.statusTone}
                    dot
                  />
                </div>
                <p className="mt-1.5 text-xs font-normal text-[var(--av-muted)]">
                  {section.description}
                </p>
                <div className="mt-2.5 flex items-center gap-1">
                  {(["json", "txt", "log"] as ErrorLogExportFormat[]).map(
                    (fmt) => (
                      <a
                        key={fmt}
                        href={buildExportUrl(fmt, section.key)}
                        download
                        title={`Download ${section.title} logs as .${fmt}`}
                        className="rounded-full border border-[var(--av-border-strong)] bg-[var(--av-surface)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--av-ink-secondary)] transition hover:bg-[var(--av-accent)] hover:text-[var(--av-accent-ink)]"
                      >
                        .{fmt}
                      </a>
                    )
                  )}
                </div>
              </div>

              {/* Color-Coded Row Entries */}
              <div className="max-h-[540px] flex-1 space-y-2.5 overflow-y-auto p-4">
                {section.items.length === 0 ? (
                  <EmptyState
                    icon={<CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
                    title="Operational — All Clear"
                    description="No open issues recorded in this section."
                  />
                ) : (
                  section.items.map((log) => {
                    const isExpanded = expandedId === log.id;
                    const semantic = getLogSemantic(log);
                    const hasDetails = Boolean(
                      log.stack ||
                        (log.metadata &&
                          Object.keys(log.metadata as Record<string, unknown>)
                            .length > 0)
                    );

                    return (
                      <div
                        key={log.id}
                        className={`rounded-2xl p-3.5 transition ${semantic.cardClass} ${
                          log.resolved ? "opacity-80" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <StatusChip
                              label={semantic.badgeLabel}
                              tone={semantic.tone}
                              dot
                            />
                            <StatusChip
                              label={LAYER_LABELS[log.layer]}
                              tone="soft"
                            />
                          </div>

                          <RowActionMenu
                            ariaLabel={`Actions for log ${log.id}`}
                            actions={[
                              {
                                label:
                                  togglingId === log.id
                                    ? "Updating..."
                                    : log.resolved
                                      ? "Reopen Issue"
                                      : "Mark Resolved (Operational)",
                                disabled: togglingId === log.id,
                                onClick: () => void handleToggleResolved(log),
                              },
                              ...(hasDetails
                                ? [
                                    {
                                      label: isExpanded
                                        ? "Hide Details"
                                        : "Inspect Details",
                                      onClick: () =>
                                        setExpandedId(isExpanded ? null : log.id),
                                    },
                                  ]
                                : []),
                            ]}
                          />
                        </div>

                        <p className="mt-2.5 text-xs font-semibold text-[var(--av-ink)]">
                          {log.message}
                        </p>

                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium text-[var(--av-muted)]">
                          <span className="truncate">{log.route ?? "—"}</span>
                          <span className="tabular-nums">
                            {formatTimestamp(log.created_at)}
                          </span>
                        </div>

                        {isExpanded && hasDetails && (
                          <div className="mt-3 space-y-2 rounded-2xl border border-[var(--av-border-strong)] bg-[var(--av-surface)] p-3 font-mono text-[11px] text-[var(--av-ink)]">
                            {log.metadata &&
                              Object.keys(
                                log.metadata as Record<string, unknown>
                              ).length > 0 && (
                                <div>
                                  <div className="text-[10px] font-semibold uppercase text-[var(--av-muted)]">
                                    Details
                                  </div>
                                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap">
                                    {JSON.stringify(log.metadata, null, 2)}
                                  </pre>
                                </div>
                              )}
                            {log.stack && (
                              <div>
                                <div className="text-[10px] font-semibold uppercase text-[var(--av-muted)]">
                                  Technical Trace
                                </div>
                                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-[var(--av-muted)]">
                                  {log.stack}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Unused icon safety guard not needed, keep AlertTriangle available for screen readers if needed */}
      <span className="sr-only">
        <AlertTriangle className="h-3 w-3" />
      </span>
    </section>
  );
}

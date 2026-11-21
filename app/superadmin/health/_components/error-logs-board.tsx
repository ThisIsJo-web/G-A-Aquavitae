"use client";

import { AlertTriangle, Download, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
  backend: "Backend & API",
  database_auth: "Database & Auth",
  frontend: "Frontend & Client",
};

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
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
        setActionError(payload.error ?? "Failed to load error logs");
        return;
      }

      setLogsData(payload);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setActionError("Network error while fetching error logs");
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
    try {
      const res = await fetch(`/api/superadmin/logs/${log.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved: !log.resolved }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setActionError(data.error ?? "Failed to update log status");
        return;
      }
      await Promise.all([fetchLogs(), Promise.resolve(onLogsMutated())]);
    } catch {
      setActionError("Network error while updating log status");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleEmitDiagnosticLogs() {
    setEmittingTest(true);
    setActionError(null);
    try {
      const samples = [
        {
          level: "critical",
          source: "database",
          layer: "database_auth",
          code: "DB_CONN_SPIKE",
          route: "/api/superadmin/health",
          message: "Simulated critical database pool saturation event",
          metadata: { diagnostic: true, activeConnections: 98, maxPool: 100 },
        },
        {
          level: "error",
          source: "api",
          layer: "backend",
          code: "API_UPSTREAM_502",
          route: "/api/users",
          message: "Simulated backend route execution error",
          metadata: { diagnostic: true, retryable: true },
        },
        {
          level: "warning",
          source: "client",
          layer: "frontend",
          code: "UI_SLOW_RENDER",
          route: "/superadmin/health",
          message: "Simulated frontend slow hydration warning",
          metadata: { diagnostic: true, durationMs: 1240 },
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
          setActionError(err.error ?? "Failed to write diagnostic log");
          return;
        }
      }

      await Promise.all([fetchLogs(), Promise.resolve(onLogsMutated())]);
    } catch {
      setActionError("Network error while creating diagnostic logs");
    } finally {
      setEmittingTest(false);
    }
  }

  return (
    <section aria-label="System Error Logs" className="space-y-6">
      {logsData.schemaMissing && (
        <NoticeBanner
          tone="info"
          message="Run backend/db/schema.sql in Supabase SQL Editor to create the system_error_logs table."
        />
      )}

      {/* Control Bar */}
      <div className="av-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-[#111111]">
              Error Logs ({logsData.totalCount})
            </h2>
            <p className="mt-0.5 text-xs font-normal text-[#71717A]">
              Organized into 3 sections by Severity or Layer with downloadable
              JSON, TXT, and LOG exports.
            </p>
          </div>

          {/* Monochrome Pill Group-By Switcher */}
          <div className="inline-flex rounded-full bg-[#F2F2F4] p-1">
            <button
              type="button"
              onClick={() => {
                setGroupBy("severity");
                setCrossLevel("all");
              }}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                groupBy === "severity"
                  ? "bg-[#111111] text-white"
                  : "text-[#52525B] hover:text-[#111111]"
              }`}
            >
              By Severity
            </button>
            <button
              type="button"
              onClick={() => {
                setGroupBy("layer");
                setCrossLayer("all");
              }}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                groupBy === "layer"
                  ? "bg-[#111111] text-white"
                  : "text-[#52525B] hover:text-[#111111]"
              }`}
            >
              By Layer
            </button>
          </div>
        </div>

        {/* Filters & Export Pills */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#EFEFF2] pt-5">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 h-3.5 w-3.5 -translate-y-1/2 text-[#A1A1AA]" />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search message, route, code..."
                className="w-full rounded-full border border-[#E4E4E7] bg-[#F8F8FA] py-2 pr-3.5 pl-9 text-xs text-[#111111] placeholder:text-[#A1A1AA] focus:border-[#111111] focus:bg-white focus:outline-none"
              />
            </div>

            <select
              value={resolvedFilter}
              onChange={(e) =>
                setResolvedFilter(e.target.value as ResolvedFilter)
              }
              aria-label="Filter by status"
              className="rounded-full border border-[#E4E4E7] bg-white px-3.5 py-2 text-xs font-semibold text-[#111111] focus:border-[#111111] focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="open">Open Only</option>
              <option value="resolved">Resolved Only</option>
            </select>

            {groupBy === "severity" ? (
              <select
                value={crossLayer}
                onChange={(e) =>
                  setCrossLayer(e.target.value as ErrorLogLayer | "all")
                }
                aria-label="Filter by layer"
                className="rounded-full border border-[#E4E4E7] bg-white px-3.5 py-2 text-xs font-semibold text-[#111111] focus:border-[#111111] focus:outline-none"
              >
                <option value="all">All Layers</option>
                <option value="backend">Backend &amp; API</option>
                <option value="database_auth">Database &amp; Auth</option>
                <option value="frontend">Frontend &amp; Client</option>
              </select>
            ) : (
              <select
                value={crossLevel}
                onChange={(e) =>
                  setCrossLevel(e.target.value as ErrorLogLevel | "all")
                }
                aria-label="Filter by severity"
                className="rounded-full border border-[#E4E4E7] bg-white px-3.5 py-2 text-xs font-semibold text-[#111111] focus:border-[#111111] focus:outline-none"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="error">Error</option>
                <option value="warning">Warning</option>
              </select>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleEmitDiagnosticLogs}
              disabled={emittingTest || logsData.schemaMissing}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#D4D4D8] bg-white px-3.5 py-2 text-xs font-semibold text-[#111111] transition hover:bg-[#F4F4F6] disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
              {emittingTest ? "Logging..." : "Test Logs"}
            </button>

            <div className="inline-flex items-center gap-1 rounded-full bg-[#F4F4F6] p-1 pl-3">
              <Download className="h-3.5 w-3.5 text-[#71717A]" />
              <span className="mr-1 text-[11px] font-semibold text-[#71717A]">
                Export
              </span>
              {(["json", "txt", "log"] as ErrorLogExportFormat[]).map((fmt) => (
                <a
                  key={fmt}
                  href={buildExportUrl(fmt, "all")}
                  download
                  className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase text-[#111111] ring-1 ring-[#E4E4E7] transition hover:bg-[#111111] hover:text-white"
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

      {/* 3 Monochrome Sections */}
      <div
        className={`grid gap-4 lg:grid-cols-3 ${loading ? "opacity-65" : ""}`}
      >
        {logsData.sections.map((section, idx) => (
          <div
            key={section.key}
            className="av-card flex flex-col overflow-hidden"
          >
            {/* Section Header */}
            <div className="border-b border-[#EFEFF2] px-5 py-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <h3 className="text-sm font-bold text-[#111111]">
                    {section.title}
                  </h3>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${
                      idx === 0
                        ? "bg-[#111111] text-white"
                        : "bg-[#EFEFF2] text-[#111111]"
                    }`}
                  >
                    {section.total}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  {(["json", "txt", "log"] as ErrorLogExportFormat[]).map(
                    (fmt) => (
                      <a
                        key={fmt}
                        href={buildExportUrl(fmt, section.key)}
                        download
                        title={`Download ${section.title} logs as .${fmt}`}
                        className="rounded-full border border-[#E4E4E7] bg-white px-2 py-0.5 text-[10px] font-semibold uppercase text-[#52525B] transition hover:border-[#111111] hover:bg-[#111111] hover:text-white"
                      >
                        .{fmt}
                      </a>
                    )
                  )}
                </div>
              </div>
              <p className="mt-1 text-xs font-normal text-[#71717A]">
                {section.description}
              </p>
            </div>

            {/* Rounded Row Entries */}
            <div className="max-h-[540px] flex-1 space-y-2.5 overflow-y-auto p-4">
              {section.items.length === 0 ? (
                <EmptyState
                  icon={<AlertTriangle className="h-4 w-4" />}
                  title="No logs here"
                  description="Everything is clear in this section."
                />
              ) : (
                section.items.map((log) => {
                  const isExpanded = expandedId === log.id;
                  const hasDetails = Boolean(
                    log.stack ||
                      (log.metadata &&
                        Object.keys(log.metadata as Record<string, unknown>)
                          .length > 0)
                  );

                  return (
                    <div
                      key={log.id}
                      className={`rounded-2xl bg-[#F7F7F9] p-3.5 transition hover:bg-[#F1F1F4] ${
                        log.resolved ? "opacity-60" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusChip
                            label={log.level.toUpperCase()}
                            tone={log.level === "critical" ? "solid" : "outline"}
                          />
                          <StatusChip
                            label={LAYER_LABELS[log.layer]}
                            tone="soft"
                          />
                          {log.resolved && (
                            <StatusChip label="Resolved" tone="outline" />
                          )}
                        </div>

                        <RowActionMenu
                          ariaLabel={`Actions for log ${log.id}`}
                          actions={[
                            {
                              label:
                                togglingId === log.id
                                  ? "Updating..."
                                  : log.resolved
                                    ? "Reopen Log"
                                    : "Mark Resolved",
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

                      <p className="mt-2.5 text-xs font-semibold text-[#111111]">
                        {log.message}
                      </p>

                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium text-[#71717A]">
                        <span className="truncate">{log.route ?? "—"}</span>
                        <span className="tabular-nums">
                          {formatTimestamp(log.created_at)}
                        </span>
                      </div>

                      {isExpanded && hasDetails && (
                        <div className="mt-3 space-y-2 rounded-2xl bg-[#111111] p-3 font-mono text-[11px] text-white/90">
                          {log.metadata &&
                            Object.keys(log.metadata as Record<string, unknown>)
                              .length > 0 && (
                              <div>
                                <div className="text-[10px] font-semibold uppercase text-white/50">
                                  Metadata
                                </div>
                                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap">
                                  {JSON.stringify(log.metadata, null, 2)}
                                </pre>
                              </div>
                            )}
                          {log.stack && (
                            <div>
                              <div className="text-[10px] font-semibold uppercase text-white/50">
                                Stack Trace
                              </div>
                              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-white/75">
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
        ))}
      </div>
    </section>
  );
}

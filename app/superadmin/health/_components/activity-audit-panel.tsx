"use client";

import {
  Activity,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Download,
  Search,
  Shield,
  Store,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { trackAction } from "@/app/_components/activity-tracker";
import {
  addIsoDaysClient,
  clampIsoDate,
  getTodayManilaIso,
} from "@/app/_components/ui/input-validation";
import {
  EmptyState,
  NoticeBanner,
  StatusChip,
} from "@/app/_components/ui/monochrome-controls";
import { QuickStatCard } from "@/app/_components/ui/quick-stat-card";
import type { ActivityLogsResult, SystemActivityLogRow } from "@/backend/services/activity-logs";

interface ActivityAuditPanelProps {
  refreshSignal: number;
}

const MODULE_LABELS: Record<string, string> = {
  auth: "Sign In / Out",
  pos: "Walk-in Sales",
  deliveries: "Deliveries",
  vendo: "Vendo Income",
  inventory: "Gallon Inventory",
  "shift-closing": "Closing Shift",
  expenses: "Station Expenses",
  corrections: "Review & Fixes",
  accounts: "Accounts & Staff",
  customers: "Customers",
  navigation: "Navigation",
  system: "System Health",
  "error-logs": "Error Logs",
  audit: "Audit & Exports",
  ui: "Interface",
};

const MODULE_OPTIONS = [
  { value: "all", label: "All Areas" },
  { value: "pos", label: "Walk-in Sales" },
  { value: "deliveries", label: "Deliveries" },
  { value: "vendo", label: "Vendo Income" },
  { value: "inventory", label: "Gallon Inventory" },
  { value: "shift-closing", label: "Closing Shift" },
  { value: "expenses", label: "Station Expenses" },
  { value: "corrections", label: "Review & Fixes" },
  { value: "accounts", label: "Accounts & Staff" },
  { value: "auth", label: "Sign In / Out" },
  { value: "navigation", label: "Navigation" },
  { value: "error-logs", label: "Error Logs" },
];

function formatModuleLabel(mod: string): string {
  return MODULE_LABELS[mod] ?? mod.replace(/[-_]/g, " ");
}

function formatRoleLabel(role: string): string {
  if (role === "superadmin") return "Superadmin";
  if (role === "owner") return "Owner";
  if (role === "cashier") return "Cashier";
  if (role === "staff") return "Staff";
  return "Guest";
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function getStatusTone(status: string): "green" | "yellow" | "red" {
  if (status === "failed") return "red";
  if (status === "denied") return "yellow";
  return "green";
}

function getStatusLabel(status: string): string {
  if (status === "failed") return "Failed";
  if (status === "denied") return "Blocked";
  return "Completed";
}

function getRoleTone(role: string): "solid" | "soft" | "outline" {
  if (role === "superadmin") return "solid";
  if (role === "owner") return "outline";
  return "soft";
}

function hasDetailEntries(row: SystemActivityLogRow): boolean {
  if (!row.details || typeof row.details !== "object" || Array.isArray(row.details)) {
    return false;
  }
  return Object.keys(row.details).length > 0;
}

export function ActivityAuditPanel({ refreshSignal }: ActivityAuditPanelProps) {
  const todayIso = getTodayManilaIso();
  const minDateIso = addIsoDaysClient(todayIso, -365);

  const [data, setData] = useState<ActivityLogsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [fromDate, setFromDate] = useState(addIsoDaysClient(todayIso, -7));
  const [toDate, setToDate] = useState(todayIso);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const params = new URLSearchParams();
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (roleFilter !== "all") params.set("role", roleFilter);
    if (moduleFilter !== "all") params.set("module", moduleFilter);
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    params.set("limit", "150");

    fetch(`/api/superadmin/audit-logs?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (res) => {
        const payload = (await res.json()) as ActivityLogsResult & {
          error?: string;
        };
        if (!active) return;
        if (!res.ok) {
          setError(payload.error ?? "Unable to load activity audit logs.");
          return;
        }
        setError(null);
        setData(payload);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("Connection problem while loading activity logs.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [debouncedSearch, roleFilter, moduleFilter, fromDate, toDate, refreshSignal]);

  function buildExportUrl(format: "csv" | "json"): string {
    const params = new URLSearchParams({ format });
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (roleFilter !== "all") params.set("role", roleFilter);
    if (moduleFilter !== "all") params.set("module", moduleFilter);
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    return `/api/superadmin/audit-logs/export?${params.toString()}`;
  }

  function handleFromChange(raw: string) {
    if (!raw) {
      setFromDate("");
      return;
    }
    const clamped = clampIsoDate(raw, minDateIso, todayIso);
    setFromDate(clamped);
    if (toDate && clamped > toDate) {
      setToDate(clamped);
    }
  }

  function handleToChange(raw: string) {
    if (!raw) {
      setToDate("");
      return;
    }
    const clamped = clampIsoDate(raw, minDateIso, todayIso);
    setToDate(clamped);
    if (fromDate && clamped < fromDate) {
      setFromDate(clamped);
    }
  }

  const summary = data?.summary ?? {
    todayTotal: 0,
    activeActorsToday: 0,
    ownerActions: 0,
    cashierActions: 0,
    superadminActions: 0,
  };
  const entries = data?.entries ?? [];

  return (
    <section aria-label="Activity Audit Logs" className="space-y-6">
      {data?.schemaMissing && (
        <NoticeBanner
          tone="info"
          message="The activity log table is not installed yet. Run the latest database setup script to begin recording user actions."
        />
      )}

      {/* Quick Summary Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <QuickStatCard
          highlighted
          label="Today's Activity"
          value={summary.todayTotal}
          sublabel="Recorded actions since midnight"
          icon={<Activity className="h-5 w-5" />}
        />
        <QuickStatCard
          label="Active Users Today"
          value={summary.activeActorsToday}
          sublabel="Accounts with recorded activity"
          icon={<Users className="h-5 w-5" />}
        />
        <QuickStatCard
          label="Owner & Cashier Actions"
          value={summary.ownerActions + summary.cashierActions}
          sublabel={`${summary.ownerActions} owner · ${summary.cashierActions} cashier`}
          icon={<Store className="h-5 w-5" />}
        />
        <QuickStatCard
          label="Superadmin Actions"
          value={summary.superadminActions}
          sublabel="System & oversight actions today"
          icon={<Shield className="h-5 w-5" />}
        />
      </div>

      {/* Filters & Export Card */}
      <div className="av-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-[var(--av-ink)]">
              Who Did What ({data?.totalMatching ?? 0})
            </h2>
            <p className="mt-0.5 text-xs text-[var(--av-muted)]">
              Complete trail of sign-ins, sales, updates, approvals, and button clicks across every role.
            </p>
          </div>

          <div className="inline-flex items-center gap-1 rounded-full bg-[var(--av-surface-subtle)] p-1 pl-3">
            <Download className="h-3.5 w-3.5 text-[var(--av-muted)]" />
            <span className="mr-1 text-[11px] font-semibold text-[var(--av-muted)]">
              Export
            </span>
            {(["csv", "json"] as const).map((fmt) => (
              <a
                key={fmt}
                href={buildExportUrl(fmt)}
                download
                onClick={() =>
                  trackAction({
                    module: "audit",
                    action: `Exported activity audit logs (${fmt.toUpperCase()})`,
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

        <div className="mt-5 grid gap-3 border-t border-[var(--av-border)] pt-5 sm:grid-cols-2 lg:grid-cols-12">
          <div className="relative sm:col-span-2 lg:col-span-4">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-3.5 w-3.5 -translate-y-1/2 text-[var(--av-muted)]" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search person, email, action, or button..."
              className="av-input w-full rounded-full py-2 pr-3.5 pl-9 text-xs"
            />
          </div>

          <div className="lg:col-span-2">
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                trackAction({
                  module: "audit",
                  action: `Filtered audit logs by role: ${e.target.value}`,
                  controlLabel: "Role Filter",
                });
              }}
              aria-label="Filter by role"
              className="av-input w-full rounded-full px-3.5 py-2 text-xs font-semibold"
            >
              <option value="all">All Roles</option>
              <option value="superadmin">Superadmin</option>
              <option value="owner">Owner</option>
              <option value="cashier">Cashier</option>
              <option value="staff">Staff</option>
            </select>
          </div>

          <div className="lg:col-span-2">
            <select
              value={moduleFilter}
              onChange={(e) => {
                setModuleFilter(e.target.value);
                trackAction({
                  module: "audit",
                  action: `Filtered audit logs by area: ${e.target.value}`,
                  controlLabel: "Area Filter",
                });
              }}
              aria-label="Filter by area"
              className="av-input w-full rounded-full px-3.5 py-2 text-xs font-semibold"
            >
              {MODULE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-4">
            <input
              type="date"
              value={fromDate}
              min={minDateIso}
              max={toDate || todayIso}
              onChange={(e) => handleFromChange(e.target.value)}
              aria-label="From date"
              className="av-input w-full rounded-full px-3 py-2 text-xs font-semibold"
            />
            <input
              type="date"
              value={toDate}
              min={fromDate || minDateIso}
              max={todayIso}
              onChange={(e) => handleToChange(e.target.value)}
              aria-label="To date"
              className="av-input w-full rounded-full px-3 py-2 text-xs font-semibold"
            />
          </div>
        </div>

        {error && (
          <div className="mt-4">
            <NoticeBanner
              tone="error"
              message={error}
              onDismiss={() => setError(null)}
            />
          </div>
        )}

        {/* Activity Table */}
        <div className={`mt-5 overflow-x-auto ${loading ? "opacity-65" : ""}`}>
          {loading && entries.length === 0 ? (
            <div className="space-y-2.5 py-4">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-14 animate-pulse rounded-2xl bg-[var(--av-surface-subtle)]"
                />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <EmptyState
              icon={<ClipboardList className="h-4 w-4" />}
              title="No matching activity yet"
              description="Try widening the date range or clearing a filter to see recorded actions."
            />
          ) : (
            <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-left text-xs">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-[var(--av-muted)]">
                  <th className="pb-1 pl-3">When</th>
                  <th className="px-3 pb-1">Who</th>
                  <th className="px-3 pb-1">What They Did</th>
                  <th className="px-3 pb-1">Area</th>
                  <th className="px-3 pb-1">Target</th>
                  <th className="px-3 pb-1">Result</th>
                  <th className="pb-1 pr-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const isExpanded = expandedId === entry.id;
                  const canExpand = hasDetailEntries(entry);
                  const detailsObj =
                    canExpand && entry.details && typeof entry.details === "object"
                      ? (entry.details as Record<string, unknown>)
                      : null;

                  return (
                    <tr
                      key={entry.id}
                      className="rounded-2xl bg-[var(--av-surface-subtle)] align-top transition hover:bg-[var(--av-surface-hover)]"
                    >
                      <td className="rounded-l-2xl py-3 pl-3 whitespace-nowrap text-[11px] font-medium text-[var(--av-muted)] tabular-nums">
                        {formatTimestamp(entry.created_at)}
                      </td>

                      <td className="px-3 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-[var(--av-ink)]">
                            {entry.actor_name}
                          </span>
                          <StatusChip
                            label={formatRoleLabel(entry.actor_role)}
                            tone={getRoleTone(entry.actor_role)}
                          />
                        </div>
                        <div className="mt-0.5 text-[11px] text-[var(--av-muted)]">
                          {entry.actor_email}
                        </div>
                      </td>

                      <td className="px-3 py-3">
                        <div className="font-semibold text-[var(--av-ink)]">
                          {entry.action}
                        </div>
                        {entry.control_label && (
                          <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-[var(--av-border-strong)] bg-[var(--av-surface)] px-2 py-0.5 text-[10px] font-semibold text-[var(--av-ink-secondary)]">
                            Button: {entry.control_label}
                          </div>
                        )}
                        {isExpanded && detailsObj && (
                          <div className="mt-2.5 grid gap-1.5 rounded-xl border border-[var(--av-border)] bg-[var(--av-surface)] p-2.5 text-[11px]">
                            {Object.entries(detailsObj).map(([k, v]) => (
                              <div
                                key={k}
                                className="flex flex-wrap items-baseline justify-between gap-2"
                              >
                                <span className="font-semibold capitalize text-[var(--av-muted)]">
                                  {k.replace(/([A-Z])/g, " $1").replace(/_/g, " ")}
                                </span>
                                <span className="font-medium text-[var(--av-ink)]">
                                  {typeof v === "object" && v !== null
                                    ? JSON.stringify(v)
                                    : String(v ?? "—")}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>

                      <td className="px-3 py-3 whitespace-nowrap">
                        <StatusChip
                          label={formatModuleLabel(entry.module)}
                          tone="soft"
                        />
                      </td>

                      <td className="max-w-[180px] truncate px-3 py-3 text-[var(--av-ink-secondary)]">
                        {entry.target_label || "—"}
                      </td>

                      <td className="px-3 py-3 whitespace-nowrap">
                        <StatusChip
                          label={getStatusLabel(entry.status)}
                          tone={getStatusTone(entry.status)}
                          dot
                        />
                      </td>

                      <td className="rounded-r-2xl py-3 pr-3 text-right whitespace-nowrap">
                        {canExpand ? (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedId(isExpanded ? null : entry.id)
                            }
                            className="inline-flex items-center gap-1 rounded-full border border-[var(--av-border-strong)] bg-[var(--av-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--av-ink)] transition hover:bg-[var(--av-accent)] hover:text-[var(--av-accent-ink)]"
                          >
                            {isExpanded ? (
                              <>
                                Hide <ChevronUp className="h-3 w-3" />
                              </>
                            ) : (
                              <>
                                View <ChevronDown className="h-3 w-3" />
                              </>
                            )}
                          </button>
                        ) : (
                          <span className="text-[11px] text-[var(--av-muted)]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}

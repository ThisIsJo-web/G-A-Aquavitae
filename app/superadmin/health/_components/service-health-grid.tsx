"use client";

import { Activity, AlertTriangle, Cpu, Users } from "lucide-react";
import { StatusChip } from "@/app/_components/ui/monochrome-controls";
import { QuickStatCard } from "@/app/_components/ui/quick-stat-card";
import type { ServiceStatus, SystemHealthSnapshotDTO } from "./types";

interface ServiceHealthGridProps {
  health: SystemHealthSnapshotDTO;
}

function formatUptime(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function statusChipProps(status: ServiceStatus): {
  label: string;
  tone: "green" | "yellow" | "red";
} {
  if (status === "operational") return { label: "Operational", tone: "green" };
  if (status === "degraded") return { label: "Needs Attention", tone: "yellow" };
  return { label: "Priority", tone: "red" };
}

function memoryChipProps(status: "healthy" | "elevated" | "critical"): {
  label: string;
  tone: "green" | "yellow" | "red";
} {
  if (status === "critical") return { label: "Priority", tone: "red" };
  if (status === "elevated") return { label: "Needs Attention", tone: "yellow" };
  return { label: "Operational", tone: "green" };
}

export function ServiceHealthGrid({ health }: ServiceHealthGridProps) {
  const { probes, runtime, accounts, errors } = health;
  const avgLatency =
    probes.length > 0
      ? Math.round(
          probes.reduce((sum, p) => sum + p.latencyMs, 0) / probes.length
        )
      : 0;
  const operationalCount = probes.filter((p) => p.status === "operational").length;
  const memChip = memoryChipProps(runtime.memory.status);

  return (
    <section aria-label="System Health Overview" className="space-y-6">
      {/* Top Quick Stats Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <QuickStatCard
          highlighted
          label="Average Response Time"
          value={`${avgLatency} ms`}
          sublabel={`${operationalCount}/${probes.length} services operational`}
          icon={<Activity className="h-5 w-5" />}
        />
        <QuickStatCard
          label="Open Issues"
          value={errors.unresolved}
          sublabel={`${errors.last24h} recorded in last 24 hours`}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <QuickStatCard
          label="Active Accounts"
          value={accounts.active}
          sublabel={`${accounts.total} total (${accounts.byRole.owner} owner · ${accounts.byRole.cashier} cashier)`}
          icon={<Users className="h-5 w-5" />}
        />
        <QuickStatCard
          label="Server Memory"
          value={`${runtime.memory.heapUsagePercent}%`}
          sublabel={`${runtime.memory.heapUsedMb} of ${runtime.memory.heapLimitMb} MB used`}
          icon={<Cpu className="h-5 w-5" />}
        />
      </div>

      {/* Live Service Checks */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {probes.map((probe) => {
          const chip = statusChipProps(probe.status);
          return (
            <div key={probe.id} className="av-card p-5 sm:p-6">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-[var(--av-ink)]">
                    {probe.name}
                  </h2>
                  <p className="mt-1 text-xs font-normal text-[var(--av-muted)]">
                    {probe.description}
                  </p>
                </div>
                <StatusChip label={chip.label} tone={chip.tone} dot />
              </div>

              <div className="mt-5 flex items-baseline justify-between gap-2">
                <span className="text-2xl font-bold tracking-tight text-[var(--av-ink)] tabular-nums">
                  {probe.latencyMs}
                  <span className="ml-1 text-xs font-medium text-[var(--av-muted)]">
                    ms
                  </span>
                </span>
                <span className="max-w-[58%] truncate text-xs text-[var(--av-muted)]">
                  {probe.detail}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Server Status & Issue Summary */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Server Status & Memory */}
        <div className="av-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-bold text-[var(--av-ink)]">
              Server Status &amp; Memory
            </h3>
            <div className="flex items-center gap-2">
              <StatusChip label={memChip.label} tone={memChip.tone} dot />
              <StatusChip
                label={runtime.environment === "production" ? "Live Mode" : "Test Mode"}
                tone="soft"
              />
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div className="rounded-2xl bg-[var(--av-surface-subtle)] p-3.5">
              <dt className="text-[11px] font-semibold text-[var(--av-muted)]">
                Running Time
              </dt>
              <dd className="mt-1 text-sm font-bold text-[var(--av-ink)] tabular-nums">
                {formatUptime(runtime.uptimeSeconds)}
              </dd>
            </div>
            <div className="rounded-2xl bg-[var(--av-surface-subtle)] p-3.5">
              <dt className="text-[11px] font-semibold text-[var(--av-muted)]">
                Memory Used
              </dt>
              <dd className="mt-1 text-sm font-bold text-[var(--av-ink)] tabular-nums">
                {runtime.memory.heapUsedMb} MB
              </dd>
            </div>
            <div className="rounded-2xl bg-[var(--av-surface-subtle)] p-3.5">
              <dt className="text-[11px] font-semibold text-[var(--av-muted)]">
                Total Memory
              </dt>
              <dd className="mt-1 text-sm font-bold text-[var(--av-ink)] tabular-nums">
                {runtime.memory.rssMb} MB
              </dd>
            </div>
            <div className="rounded-2xl bg-[var(--av-surface-subtle)] p-3.5">
              <dt className="text-[11px] font-semibold text-[var(--av-muted)]">
                Capacity
              </dt>
              <dd className="mt-1 text-sm font-bold text-[var(--av-ink)] tabular-nums">
                {runtime.memory.heapUsagePercent}%
              </dd>
            </div>
          </dl>
        </div>

        {/* Open Issue Summary with Green / Yellow / Red Color Coding */}
        <div className="av-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-bold text-[var(--av-ink)]">
              Open Issue Summary
            </h3>
            <span className="text-xs font-semibold text-[var(--av-muted)]">
              {errors.total} total recorded
            </span>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--av-muted)]">
                By Priority (Open)
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div
                  className={`rounded-2xl border p-3.5 text-center ${
                    errors.bySeverity.critical > 0
                      ? "border-red-500/35 bg-red-500/12 text-red-700 dark:text-red-300"
                      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  }`}
                >
                  <div className="text-xl font-bold tabular-nums">
                    {errors.bySeverity.critical}
                  </div>
                  <div className="mt-0.5 text-[11px] font-semibold">
                    Critical (Priority)
                  </div>
                </div>
                <div
                  className={`rounded-2xl border p-3.5 text-center ${
                    errors.bySeverity.error > 0
                      ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
                      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  }`}
                >
                  <div className="text-xl font-bold tabular-nums">
                    {errors.bySeverity.error}
                  </div>
                  <div className="mt-0.5 text-[11px] font-semibold">
                    Error (Priority)
                  </div>
                </div>
                <div
                  className={`rounded-2xl border p-3.5 text-center ${
                    errors.bySeverity.warning > 0
                      ? "border-amber-500/35 bg-amber-500/12 text-amber-800 dark:text-amber-300"
                      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  }`}
                >
                  <div className="text-xl font-bold tabular-nums">
                    {errors.bySeverity.warning}
                  </div>
                  <div className="mt-0.5 text-[11px] font-semibold">
                    Warning (Attention)
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--av-muted)]">
                By Area (Open)
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl border border-[var(--av-border)] bg-[var(--av-surface-subtle)] p-3 text-center">
                  <div className="text-lg font-bold text-[var(--av-ink)] tabular-nums">
                    {errors.byLayer.backend}
                  </div>
                  <div className="text-[11px] font-medium text-[var(--av-muted)]">
                    Server
                  </div>
                </div>
                <div className="rounded-2xl border border-[var(--av-border)] bg-[var(--av-surface-subtle)] p-3 text-center">
                  <div className="text-lg font-bold text-[var(--av-ink)] tabular-nums">
                    {errors.byLayer.database_auth}
                  </div>
                  <div className="text-[11px] font-medium text-[var(--av-muted)]">
                    Database &amp; Sign-In
                  </div>
                </div>
                <div className="rounded-2xl border border-[var(--av-border)] bg-[var(--av-surface-subtle)] p-3 text-center">
                  <div className="text-lg font-bold text-[var(--av-ink)] tabular-nums">
                    {errors.byLayer.frontend}
                  </div>
                  <div className="text-[11px] font-medium text-[var(--av-muted)]">
                    Screen &amp; Controls
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

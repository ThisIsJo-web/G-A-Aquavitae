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
  tone: "solid" | "soft" | "outline";
} {
  if (status === "operational") return { label: "Operational", tone: "solid" };
  if (status === "degraded") return { label: "Degraded", tone: "soft" };
  return { label: "Down", tone: "outline" };
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

  return (
    <section aria-label="System Health Overview" className="space-y-6">
      {/* Top Quick Stats Row (1 Solid Black Highlighted Card) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <QuickStatCard
          highlighted
          label="Avg Probe Latency"
          value={`${avgLatency} ms`}
          sublabel={`${operationalCount}/${probes.length} services operational`}
          icon={<Activity className="h-5 w-5" />}
        />
        <QuickStatCard
          label="Open Errors"
          value={errors.unresolved}
          sublabel={`${errors.last24h} logged in last 24h`}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <QuickStatCard
          label="Active Accounts"
          value={accounts.active}
          sublabel={`${accounts.total} total (${accounts.byRole.owner} owner · ${accounts.byRole.cashier} cashier)`}
          icon={<Users className="h-5 w-5" />}
        />
        <QuickStatCard
          label="Heap Utilization"
          value={`${runtime.memory.heapUsagePercent}%`}
          sublabel={`${runtime.memory.heapUsedMb} / ${runtime.memory.heapLimitMb} MB max`}
          icon={<Cpu className="h-5 w-5" />}
        />
      </div>

      {/* Live Service Probes */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {probes.map((probe) => {
          const chip = statusChipProps(probe.status);
          return (
            <div key={probe.id} className="av-card p-6">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-[#111111]">
                    {probe.name}
                  </h2>
                  <p className="mt-1 text-xs font-normal text-[#71717A]">
                    {probe.description}
                  </p>
                </div>
                <StatusChip label={chip.label} tone={chip.tone} dot />
              </div>

              <div className="mt-5 flex items-baseline justify-between gap-2">
                <span className="text-2xl font-bold tracking-tight text-[#111111] tabular-nums">
                  {probe.latencyMs}
                  <span className="ml-1 text-xs font-medium text-[#71717A]">
                    ms
                  </span>
                </span>
                <span className="max-w-[58%] truncate text-xs text-[#71717A]">
                  {probe.detail}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Runtime & Memory + Error Signals Breakdown */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Runtime & Memory */}
        <div className="av-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-bold text-[#111111]">
              Runtime &amp; Memory
            </h3>
            <div className="flex items-center gap-2">
              <StatusChip
                label={
                  runtime.memory.status === "critical"
                    ? "High Memory"
                    : runtime.memory.status === "elevated"
                      ? "Elevated"
                      : "Healthy"
                }
                tone={runtime.memory.status === "healthy" ? "solid" : "outline"}
                dot
              />
              <StatusChip label={runtime.environment} tone="soft" />
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div className="rounded-2xl bg-[#F7F7F9] p-3.5">
              <dt className="text-[11px] font-semibold text-[#71717A]">
                Uptime
              </dt>
              <dd className="mt-1 text-sm font-bold text-[#111111] tabular-nums">
                {formatUptime(runtime.uptimeSeconds)}
              </dd>
            </div>
            <div className="rounded-2xl bg-[#F7F7F9] p-3.5">
              <dt className="text-[11px] font-semibold text-[#71717A]">
                Node.js
              </dt>
              <dd className="mt-1 text-sm font-bold text-[#111111] tabular-nums">
                {runtime.nodeVersion}
              </dd>
            </div>
            <div className="rounded-2xl bg-[#F7F7F9] p-3.5">
              <dt className="text-[11px] font-semibold text-[#71717A]">
                RSS Memory
              </dt>
              <dd className="mt-1 text-sm font-bold text-[#111111] tabular-nums">
                {runtime.memory.rssMb} MB
              </dd>
            </div>
            <div className="rounded-2xl bg-[#F7F7F9] p-3.5">
              <dt className="text-[11px] font-semibold text-[#71717A]">
                Allocated Slice
              </dt>
              <dd className="mt-1 text-sm font-bold text-[#111111] tabular-nums">
                {runtime.memory.heapTotalMb} MB
              </dd>
            </div>
          </dl>

          <div className="mt-5">
            <div className="flex justify-between text-xs font-semibold text-[#71717A]">
              <span>
                Heap Used ({runtime.memory.heapUsedMb} /{" "}
                {runtime.memory.heapLimitMb} MB limit)
              </span>
              <span className="tabular-nums text-[#111111]">
                {runtime.memory.heapUsagePercent}%
              </span>
            </div>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-[#EFEFF2]">
              <div
                className="h-full rounded-full bg-[#111111] transition-all"
                style={{
                  width: `${Math.max(2, runtime.memory.heapUsagePercent)}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Open Error Signals by Severity & Layer */}
        <div className="av-card p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-[#111111]">
              Error Signal Breakdown
            </h3>
            <span className="text-xs font-semibold text-[#71717A]">
              {errors.total} total logged
            </span>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#71717A]">
                By Severity (Open)
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl bg-[#111111] p-3.5 text-center text-white">
                  <div className="text-xl font-bold tabular-nums">
                    {errors.bySeverity.critical}
                  </div>
                  <div className="mt-0.5 text-[11px] font-medium text-white/70">
                    Critical
                  </div>
                </div>
                <div className="rounded-2xl bg-[#F4F4F6] p-3.5 text-center">
                  <div className="text-xl font-bold text-[#111111] tabular-nums">
                    {errors.bySeverity.error}
                  </div>
                  <div className="mt-0.5 text-[11px] font-medium text-[#71717A]">
                    Error
                  </div>
                </div>
                <div className="rounded-2xl bg-[#F4F4F6] p-3.5 text-center">
                  <div className="text-xl font-bold text-[#111111] tabular-nums">
                    {errors.bySeverity.warning}
                  </div>
                  <div className="mt-0.5 text-[11px] font-medium text-[#71717A]">
                    Warning
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#71717A]">
                By Layer (Open)
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl border border-[#E8E8EC] bg-white p-3 text-center">
                  <div className="text-lg font-bold text-[#111111] tabular-nums">
                    {errors.byLayer.backend}
                  </div>
                  <div className="text-[11px] font-medium text-[#71717A]">
                    Backend
                  </div>
                </div>
                <div className="rounded-2xl border border-[#E8E8EC] bg-white p-3 text-center">
                  <div className="text-lg font-bold text-[#111111] tabular-nums">
                    {errors.byLayer.database_auth}
                  </div>
                  <div className="text-[11px] font-medium text-[#71717A]">
                    DB &amp; Auth
                  </div>
                </div>
                <div className="rounded-2xl border border-[#E8E8EC] bg-white p-3 text-center">
                  <div className="text-lg font-bold text-[#111111] tabular-nums">
                    {errors.byLayer.frontend}
                  </div>
                  <div className="text-[11px] font-medium text-[#71717A]">
                    Frontend
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

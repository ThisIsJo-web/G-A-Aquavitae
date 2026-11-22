"use client";

import {
  Activity,
  AlertTriangle,
  ClipboardList,
  LayoutDashboard,
  RefreshCw,
  ShoppingBag,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { trackAction } from "@/app/_components/activity-tracker";
import { AppShell, type AppNavItem } from "@/app/_components/ui/app-shell";
import { StatusChip } from "@/app/_components/ui/monochrome-controls";
import { AccountManagementPanel } from "./account-management-panel";
import { ActivityAuditPanel } from "./activity-audit-panel";
import { ErrorLogsBoard } from "./error-logs-board";
import { ServiceHealthGrid } from "./service-health-grid";
import type {
  GroupedErrorLogsDTO,
  ManagedUserDTO,
  ServiceStatus,
  SystemHealthSnapshotDTO,
} from "./types";

interface HealthDashboardProps {
  currentUser: {
    id: string;
    email: string;
    fullName: string | null;
  };
  initialHealth: SystemHealthSnapshotDTO;
  initialLogs: GroupedErrorLogsDTO;
  initialUsers: ManagedUserDTO[];
}

type ActiveSection = "health" | "logs" | "audit" | "accounts";

function getStatusLabel(status: ServiceStatus): {
  label: string;
  tone: "green" | "yellow" | "red";
} {
  switch (status) {
    case "operational":
      return { label: "Operational", tone: "green" };
    case "degraded":
      return { label: "Needs Attention", tone: "yellow" };
    case "down":
      return { label: "Priority Issue", tone: "red" };
  }
}

export function HealthDashboard({
  currentUser,
  initialHealth,
  initialLogs,
  initialUsers,
}: HealthDashboardProps) {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<ActiveSection>("health");
  const [health, setHealth] = useState<SystemHealthSnapshotDTO>(initialHealth);
  const [users, setUsers] = useState<ManagedUserDTO[]>(initialUsers);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  const inFlightRefreshRef = useRef(false);
  const refreshAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      refreshAbortRef.current?.abort();
    };
  }, []);

  const refreshHealth = useCallback(async () => {
    const res = await fetch("/api/superadmin/health", { cache: "no-store" });
    if (res.ok) {
      const next = (await res.json()) as SystemHealthSnapshotDTO;
      setHealth(next);
    }
  }, []);

  const refreshUsers = useCallback(async () => {
    const res = await fetch("/api/users", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { users: ManagedUserDTO[] };
      setUsers(data.users);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    if (inFlightRefreshRef.current) return;
    inFlightRefreshRef.current = true;
    refreshAbortRef.current?.abort();
    const controller = new AbortController();
    refreshAbortRef.current = controller;

    setRefreshing(true);
    try {
      const [healthRes, usersRes] = await Promise.all([
        fetch("/api/superadmin/health", {
          cache: "no-store",
          signal: controller.signal,
        }),
        fetch("/api/users", {
          cache: "no-store",
          signal: controller.signal,
        }),
      ]);

      if (healthRes.ok) {
        setHealth((await healthRes.json()) as SystemHealthSnapshotDTO);
      }
      if (usersRes.ok) {
        const data = (await usersRes.json()) as { users: ManagedUserDTO[] };
        setUsers(data.users);
      }
      setRefreshSignal((prev) => prev + 1);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
    } finally {
      inFlightRefreshRef.current = false;
      setRefreshing(false);
    }
  }, []);

  // Visibility-aware 15s live refresh: pauses automatically when tab is hidden
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshAll();
      }
    }, 15_000);

    function handleVisible() {
      if (document.visibilityState === "visible") {
        void refreshAll();
      }
    }

    document.addEventListener("visibilitychange", handleVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, [autoRefresh, refreshAll]);

  async function handleSignOut() {
    setSigningOut(true);
    trackAction({
      module: "auth",
      action: "Signed out of Superadmin panel",
      controlLabel: "Sign Out",
    });
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  const navItems: AppNavItem[] = [
    {
      id: "health",
      label: "System Health",
      icon: <Activity className="h-4 w-4" />,
    },
    {
      id: "logs",
      label: "Error Logs",
      icon: <AlertTriangle className="h-4 w-4" />,
      badge: health.errors.unresolved,
    },
    {
      id: "audit",
      label: "Audit Logs",
      icon: <ClipboardList className="h-4 w-4" />,
    },
    {
      id: "accounts",
      label: "Accounts & Roles",
      icon: <Users className="h-4 w-4" />,
      badge: users.length,
    },
  ];

  const statusMeta = getStatusLabel(health.overallStatus);
  const pageTitle =
    activeSection === "health"
      ? "System Health"
      : activeSection === "logs"
        ? "Error Logs"
        : activeSection === "audit"
          ? "Audit Logs"
          : "Accounts & Roles";

  const pageSubtitle =
    activeSection === "audit"
      ? "Complete record of who did what across all accounts"
      : `Last updated ${new Date(health.checkedAt).toLocaleTimeString()}`;

  return (
    <AppShell
      roleLabel="Superadmin"
      pageTitle={pageTitle}
      pageSubtitle={pageSubtitle}
      navItems={navItems}
      activeNavId={activeSection}
      onSelectNav={(id) => setActiveSection(id as ActiveSection)}
      secondaryLinks={[
        {
          href: "/owner",
          label: "Owner Dashboard",
          icon: <LayoutDashboard className="h-3.5 w-3.5" />,
        },
        {
          href: "/cashier",
          label: "Cashier Station",
          icon: <ShoppingBag className="h-3.5 w-3.5" />,
        },
      ]}
      user={{
        name: currentUser.fullName || "Superadmin",
        email: currentUser.email,
      }}
      onSignOut={handleSignOut}
      signingOut={signingOut}
      headerActions={
        <>
          <StatusChip label={statusMeta.label} tone={statusMeta.tone} dot />

          <button
            type="button"
            onClick={() => {
              setAutoRefresh((prev) => {
                const next = !prev;
                trackAction({
                  module: "system",
                  action: next ? "Enabled live auto-refresh" : "Paused live auto-refresh",
                  controlLabel: next ? "Live Updates: ON" : "Live: Paused",
                });
                return next;
              });
            }}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold transition ${
              autoRefresh
                ? "border-[var(--av-accent)] bg-[var(--av-accent)] text-[var(--av-accent-ink)]"
                : "border-[var(--av-border-strong)] bg-[var(--av-surface)] text-[var(--av-ink)] hover:bg-[var(--av-surface-subtle)]"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                autoRefresh
                  ? "animate-pulse bg-[var(--av-accent-ink)]"
                  : "bg-[var(--av-muted)]"
              }`}
            />
            {autoRefresh ? "Live: ON" : "Live: Paused"}
          </button>

          <button
            type="button"
            onClick={() => {
              trackAction({
                module: "system",
                action: "Manually refreshed Superadmin panel",
                controlLabel: "Refresh",
              });
              void refreshAll();
            }}
            disabled={refreshing}
            className="av-btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-xs disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
            />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </>
      }
    >
      {activeSection === "health" && (
        <div className="space-y-6">
          <ServiceHealthGrid health={health} />
          <ErrorLogsBoard
            initialLogs={initialLogs}
            refreshSignal={refreshSignal}
            onLogsMutated={refreshHealth}
          />
        </div>
      )}

      {activeSection === "logs" && (
        <ErrorLogsBoard
          initialLogs={initialLogs}
          refreshSignal={refreshSignal}
          onLogsMutated={refreshHealth}
        />
      )}

      {activeSection === "audit" && (
        <ActivityAuditPanel refreshSignal={refreshSignal} />
      )}

      {activeSection === "accounts" && (
        <AccountManagementPanel
          currentUserId={currentUser.id}
          users={users}
          onUsersChanged={async () => {
            await Promise.all([refreshUsers(), refreshHealth()]);
          }}
        />
      )}
    </AppShell>
  );
}

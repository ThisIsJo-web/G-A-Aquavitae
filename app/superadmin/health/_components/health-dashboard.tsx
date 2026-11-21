"use client";

import {
  Activity,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell, type AppNavItem } from "@/app/_components/ui/app-shell";
import { StatusChip } from "@/app/_components/ui/monochrome-controls";
import { AccountManagementPanel } from "./account-management-panel";
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

type ActiveSection = "health" | "logs" | "accounts";

function getStatusLabel(status: ServiceStatus): {
  label: string;
  tone: "solid" | "soft" | "outline";
} {
  switch (status) {
    case "operational":
      return { label: "All Systems Operational", tone: "solid" };
    case "degraded":
      return { label: "Degraded Performance", tone: "soft" };
    case "down":
      return { label: "Incident Detected", tone: "outline" };
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
        : "Accounts & Roles";

  return (
    <AppShell
      roleLabel="Superadmin"
      pageTitle={pageTitle}
      pageSubtitle={`Last checked ${new Date(health.checkedAt).toLocaleTimeString()}`}
      navItems={navItems}
      activeNavId={activeSection}
      onSelectNav={(id) => setActiveSection(id as ActiveSection)}
      secondaryLink={{
        href: "/cashier",
        label: "Cashier Audit (2FA)",
        icon: <ShieldCheck className="h-3.5 w-3.5" />,
      }}
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
            onClick={() => setAutoRefresh((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-semibold transition ${
              autoRefresh
                ? "border-[#111111] bg-[#111111] text-white"
                : "border-[#D4D4D8] bg-white text-[#111111] hover:bg-[#F4F4F6]"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                autoRefresh ? "animate-pulse bg-white" : "bg-[#A1A1AA]"
              }`}
            />
            {autoRefresh ? "Live 15s: ON" : "Live: Paused"}
          </button>

          <button
            type="button"
            onClick={() => void refreshAll()}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#111111] px-4 py-2 text-xs font-semibold text-white transition hover:bg-black/85 disabled:opacity-50"
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

"use client";

import {
  FileSpreadsheet,
  LayoutDashboard,
  Receipt,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  ShoppingBag,
  UserCog,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell, type AppNavItem } from "@/app/_components/ui/app-shell";
import { NoticeBanner } from "@/app/_components/ui/monochrome-controls";
import type { OwnerAuditLedgerResult } from "@/backend/services/audit-ledger";
import { OwnerAuditTab } from "./owner-audit-tab";
import {
  OwnerCustomersTab,
  type OwnerCustomersView,
} from "./owner-customers-tab";
import { OwnerExpensesTab } from "./owner-expenses-tab";
import { OwnerOverviewTab } from "./owner-overview-tab";
import { OwnerSalesTab, type OwnerSalesSubView } from "./owner-sales-tab";
import { OwnerStaffTab } from "./owner-staff-tab";
import { OwnerSupervisionTab } from "./owner-supervision-tab";
import {
  formatPHP,
  type OwnerDashboardSnapshot,
  type OwnerPendingItem,
  type OwnerRangeDays,
  type OwnerStaffProfileDTO,
} from "./types";

interface OwnerWorkspaceProps {
  currentUser: {
    id: string;
    email: string;
    fullName: string | null;
  };
  initialSnapshot: OwnerDashboardSnapshot;
  initialStaff: OwnerStaffProfileDTO[];
  initialAuditLedger: OwnerAuditLedgerResult;
}

type OwnerTab =
  | "overview"
  | "supervision"
  | "audit"
  | "sales"
  | "expenses"
  | "customers"
  | "staff";

const TAB_TITLES: Record<OwnerTab, { title: string; subtitle: string }> = {
  overview: {
    title: "Station Overview",
    subtitle: "Sales, gallon volume, unpaid balances, expenses, and pending attention",
  },
  supervision: {
    title: "Owner Supervision",
    subtitle: "Approve or reject cashier error correction requests with full audit trails",
  },
  audit: {
    title: "Financial Audit Ledger",
    subtitle: "Immutable SHA-256 hash-chained log tracking every single centavo",
  },
  sales: {
    title: "Sales & Shifts",
    subtitle: "Unified Walk-in POS, Deliveries, Vendo income, and verified shift closings",
  },
  expenses: {
    title: "Expenses & Profit",
    subtitle: "Track operating costs and real-time station net profit",
  },
  customers: {
    title: "Customers & Containers",
    subtitle: "Regular delivery customers, open unpaid balances, and borrowed gallons",
  },
  staff: {
    title: "Staff Accounts",
    subtitle: "Create and manage Cashier and Staff logins for your station",
  },
};

export function OwnerWorkspace({
  currentUser,
  initialSnapshot,
  initialStaff,
  initialAuditLedger,
}: OwnerWorkspaceProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<OwnerTab>("overview");
  const [customersView, setCustomersView] =
    useState<OwnerCustomersView>("stock");
  const [salesSubView, setSalesSubView] = useState<OwnerSalesSubView>("sales");
  const [rangeDays, setRangeDays] = useState<OwnerRangeDays>(
    initialSnapshot.rangeDays
  );
  const [liveSnapshot, setLiveSnapshot] =
    useState<OwnerDashboardSnapshot | null>(null);
  const [auditRefreshSignal, setAuditRefreshSignal] = useState(0);
  const [auditTotalEntries, setAuditTotalEntries] = useState(
    initialAuditLedger.chain.totalEntries
  );
  const [staff, setStaff] = useState<OwnerStaffProfileDTO[]>(initialStaff);
  const [liveSync, setLiveSync] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [switchingToCashier, setSwitchingToCashier] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const lastPulseVersionRef = useRef<string | null>(null);

  const snapshot =
    liveSnapshot && liveSnapshot.generatedAt > initialSnapshot.generatedAt
      ? liveSnapshot
      : initialSnapshot;

  const myCashierAccount = staff.find(
    (member) =>
      member.role === "cashier" &&
      member.is_active &&
      Boolean(member.is_owner_cashier)
  );

  const fetchSnapshot = useCallback(async (nextRange: OwnerRangeDays) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setRefreshing(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/owner/dashboard?range=${nextRange}`, {
        cache: "no-store",
        signal: controller.signal,
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setLoadError(payload.error ?? "Failed to refresh owner dashboard.");
        return;
      }

      const data = (await res.json()) as OwnerDashboardSnapshot;
      setLiveSnapshot(data);
      setAuditRefreshSignal((prev) => prev + 1);
    } catch (error) {
      if ((error as { name?: string })?.name !== "AbortError") {
        setLoadError("Network error while refreshing dashboard.");
      }
    } finally {
      inFlightRef.current = false;
      if (abortRef.current === controller) {
        setRefreshing(false);
      }
    }
  }, []);

  // Option 1: Smart visibility-aware 10s pulse check (only fetches full snapshot when DB changed)
  useEffect(() => {
    const controller = new AbortController();

    async function checkPulse(forceFullOnFirst = false) {
      if (document.visibilityState !== "visible") return;
      try {
        const pulseRes = await fetch("/api/owner/pulse", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!pulseRes.ok) return;
        const pulse = (await pulseRes.json()) as { version: string };

        if (lastPulseVersionRef.current === null) {
          lastPulseVersionRef.current = pulse.version;
          if (!forceFullOnFirst) return;
        } else if (pulse.version === lastPulseVersionRef.current) {
          return;
        } else {
          lastPulseVersionRef.current = pulse.version;
        }

        const dashRes = await fetch(`/api/owner/dashboard?range=${rangeDays}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!dashRes.ok) return;
        const data = (await dashRes.json()) as OwnerDashboardSnapshot;
        setLiveSnapshot(data);
        setAuditRefreshSignal((prev) => prev + 1);
      } catch {
        // Ignore abort / transient background network errors
      }
    }

    // Initial check on mount defeats any stale Next.js client Router Cache
    void checkPulse(true);

    const intervalId = liveSync
      ? window.setInterval(() => {
          void checkPulse(false);
        }, 10_000)
      : null;

    function handleResume() {
      if (document.visibilityState === "visible") {
        void checkPulse(false);
      }
    }

    window.addEventListener("focus", handleResume);
    document.addEventListener("visibilitychange", handleResume);
    return () => {
      controller.abort();
      if (intervalId !== null) window.clearInterval(intervalId);
      window.removeEventListener("focus", handleResume);
      document.removeEventListener("visibilitychange", handleResume);
      abortRef.current?.abort();
    };
  }, [liveSync, rangeDays]);

  function handleSelectPending(item: OwnerPendingItem) {
    if (item.targetTab === "customers" && item.targetSubView) {
      setCustomersView(item.targetSubView as OwnerCustomersView);
    }
    if (item.targetTab === "sales" && item.targetSubView) {
      setSalesSubView(item.targetSubView as OwnerSalesSubView);
    }
    setActiveTab(item.targetTab);
  }

  async function handleRangeChange(nextRange: OwnerRangeDays) {
    setRangeDays(nextRange);
    await fetchSnapshot(nextRange);
  }

  async function handleGoToCashierDashboard() {
    if (!myCashierAccount) return;
    setSwitchingToCashier(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push(
        `/login?email=${encodeURIComponent(myCashierAccount.email)}&mode=owner-cashier`
      );
      router.refresh();
    } finally {
      setSwitchingToCashier(false);
    }
  }

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
      id: "overview",
      label: "Overview",
      icon: <LayoutDashboard className="h-4 w-4" />,
      badge:
        snapshot.pendingItems.length > 0
          ? `${snapshot.pendingItems.length} alert${snapshot.pendingItems.length === 1 ? "" : "s"}`
          : undefined,
    },
    {
      id: "supervision",
      label: "Supervision",
      icon: <ShieldCheck className="h-4 w-4" />,
      badge:
        snapshot.corrections.pendingCount > 0
          ? `${snapshot.corrections.pendingCount} pending`
          : undefined,
    },
    {
      id: "audit",
      label: "Audit Ledger",
      icon: <ScrollText className="h-4 w-4" />,
      badge: auditTotalEntries > 0 ? `#${auditTotalEntries}` : undefined,
    },
    {
      id: "sales",
      label: "Sales & Shifts",
      icon: <FileSpreadsheet className="h-4 w-4" />,
      badge: snapshot.salesRows.length,
    },
    {
      id: "expenses",
      label: "Expenses",
      icon: <Receipt className="h-4 w-4" />,
      badge: formatPHP(snapshot.quickStats.totalExpenses),
    },
    {
      id: "customers",
      label: "Customers & Gallons",
      icon: <Users className="h-4 w-4" />,
      badge:
        snapshot.quickStats.unpaidCount > 0
          ? `${snapshot.quickStats.unpaidCount} unpaid`
          : snapshot.customers.length,
    },
    {
      id: "staff",
      label: "Staff Accounts",
      icon: <UserCog className="h-4 w-4" />,
      badge: staff.length,
    },
  ];

  const meta = TAB_TITLES[activeTab];

  return (
    <AppShell
      roleLabel="Station Owner"
      pageTitle={meta.title}
      pageSubtitle={meta.subtitle}
      navItems={navItems}
      activeNavId={activeTab}
      onSelectNav={(id) => setActiveTab(id as OwnerTab)}
      secondaryAction={
        myCashierAccount
          ? {
              label: switchingToCashier
                ? "Switching..."
                : "Go to Cashier Dashboard",
              sublabel: myCashierAccount.email,
              icon: <ShoppingBag className="h-3.5 w-3.5" />,
              onClick: () => void handleGoToCashierDashboard(),
              disabled: switchingToCashier,
            }
          : undefined
      }
      user={{
        name: currentUser.fullName || "Station Owner",
        email: currentUser.email,
      }}
      onSignOut={handleSignOut}
      signingOut={signingOut}
      headerActions={
        <>
          <div className="inline-flex rounded-full border border-[#E4E4E7] bg-white p-1">
            {([7, 30] as const).map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => void handleRangeChange(days)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  rangeDays === days
                    ? "bg-[#111111] text-white"
                    : "text-[#52525B] hover:text-[#111111]"
                }`}
              >
                Last {days}D
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setLiveSync((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold transition ${
              liveSync
                ? "border-[#111111] bg-[#111111] text-white"
                : "border-[#D4D4D8] bg-white text-[#111111] hover:bg-[#F4F4F6]"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                liveSync ? "animate-pulse bg-white" : "bg-[#A1A1AA]"
              }`}
            />
            {liveSync ? "Live 10s: ON" : "Live: Paused"}
          </button>

          <button
            type="button"
            onClick={() => void fetchSnapshot(rangeDays)}
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
      topBanner={
        (loadError || snapshot.schemaMissing) && (
          <div className="space-y-3">
            {loadError && (
              <NoticeBanner
                tone="error"
                message={loadError}
                onDismiss={() => setLoadError(null)}
              />
            )}
            {snapshot.schemaMissing && (
              <NoticeBanner
                tone="info"
                message="Some station tables are missing. Run the latest SQL in backend/db/schema.sql in Supabase SQL Editor, then click Refresh."
              />
            )}
          </div>
        )
      }
    >
      {activeTab === "overview" && (
        <OwnerOverviewTab
          snapshot={snapshot}
          onSelectPending={handleSelectPending}
        />
      )}

      {activeTab === "supervision" && (
        <OwnerSupervisionTab
          snapshot={snapshot}
          onDataChanged={() => fetchSnapshot(rangeDays)}
        />
      )}

      {activeTab === "audit" && (
        <OwnerAuditTab
          initialLedger={initialAuditLedger}
          refreshSignal={auditRefreshSignal}
          onTotalEntriesChange={setAuditTotalEntries}
        />
      )}

      {activeTab === "sales" && (
        <OwnerSalesTab
          snapshot={snapshot}
          subView={salesSubView}
          onSubViewChange={setSalesSubView}
        />
      )}

      {activeTab === "expenses" && (
        <OwnerExpensesTab
          snapshot={snapshot}
          onDataChanged={() => fetchSnapshot(rangeDays)}
        />
      )}

      {activeTab === "customers" && (
        <OwnerCustomersTab
          snapshot={snapshot}
          activeView={customersView}
          onViewChange={setCustomersView}
        />
      )}

      {activeTab === "staff" && (
        <OwnerStaffTab staff={staff} onStaffChange={setStaff} />
      )}
    </AppShell>
  );
}

"use client";

import {
  Activity,
  Building2,
  FileSpreadsheet,
  KeyRound,
  LayoutDashboard,
  Package,
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
import { trackAction } from "@/app/_components/activity-tracker";
import {
  AppShell,
  type AppNavItem,
  type AppSidebarLink,
} from "@/app/_components/ui/app-shell";
import { NoticeBanner } from "@/app/_components/ui/monochrome-controls";
import type { StationOptionDTO, UserRole } from "@/app/cashier/_components/types";
import { OwnerAccountSecurityModal } from "./owner-account-security-modal";
import { OwnerAuditTab } from "./owner-audit-tab";
import {
  OwnerCustomersTab,
  type OwnerCustomersView,
} from "./owner-customers-tab";
import { OwnerExpensesTab } from "./owner-expenses-tab";
import { OwnerInventoryTab } from "./owner-inventory-tab";
import { OwnerOverviewTab } from "./owner-overview-tab";
import { OwnerSalesTab, type OwnerSalesSubView } from "./owner-sales-tab";
import { OwnerStaffTab } from "./owner-staff-tab";
import { OwnerSupervisionTab } from "./owner-supervision-tab";
import {
  formatPHP,
  formatRangeLabel,
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
    role: UserRole;
  };
  stationOwnerId: string;
  stations: StationOptionDTO[];
  initialSnapshot: OwnerDashboardSnapshot;
  initialStaff: OwnerStaffProfileDTO[];
  initialAuditCount: number;
  initialPulseVersion: string;
  mustChangeCredentials: boolean;
  credentialsClaimed: boolean;
}

type OwnerTab =
  | "overview"
  | "inventory"
  | "supervision"
  | "audit"
  | "sales"
  | "expenses"
  | "customers"
  | "staff";

const TAB_TITLES: Record<OwnerTab, { title: string; subtitle: string }> = {
  overview: {
    title: "Station Overview",
    subtitle:
      "Sales, gallon volume, unpaid balances, expenses, and pending attention",
  },
  inventory: {
    title: "Gallon Inventory",
    subtitle:
      "Daily station stock, damaged containers, and customer borrowed gallons",
  },
  supervision: {
    title: "Owner Supervision",
    subtitle: "Approve or reject cashier correction requests",
  },
  audit: {
    title: "Financial Audit Trail",
    subtitle: "Complete record of every peso coming in and out of your station",
  },
  sales: {
    title: "Sales & Shifts",
    subtitle: "Walk-in POS, Deliveries, Vendo income, and closed shift tallies",
  },
  expenses: {
    title: "Expenses & Profit",
    subtitle: "Track operating costs and real-time station net profit",
  },
  customers: {
    title: "Customers & Unpaid",
    subtitle: "Regular delivery customers and open unpaid balances",
  },
  staff: {
    title: "Cashier Accounts",
    subtitle: "Create and manage Cashier logins for your station",
  },
};

export function OwnerWorkspace({
  currentUser,
  stationOwnerId,
  stations,
  initialSnapshot,
  initialStaff,
  initialAuditCount,
  initialPulseVersion,
  mustChangeCredentials: initialMustChangeCredentials,
  credentialsClaimed: initialCredentialsClaimed,
}: OwnerWorkspaceProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<OwnerTab>("overview");
  const [accountName, setAccountName] = useState<string | null>(
    currentUser.fullName
  );
  const [accountEmail, setAccountEmail] = useState(currentUser.email);
  const [mustChangeCredentials, setMustChangeCredentials] = useState(
    initialMustChangeCredentials
  );
  const [credentialsClaimed, setCredentialsClaimed] = useState(
    initialCredentialsClaimed
  );
  const [securityModalOpen, setSecurityModalOpen] = useState(false);
  const [securityNotice, setSecurityNotice] = useState<string | null>(null);
  const [selectedStation, setSelectedStation] = useState(stationOwnerId);
  const [customersView, setCustomersView] =
    useState<OwnerCustomersView>("customers");
  const [salesSubView, setSalesSubView] = useState<OwnerSalesSubView>("sales");
  const [rangeDays, setRangeDays] = useState<OwnerRangeDays>(
    initialSnapshot.rangeDays
  );
  const [liveSnapshot, setLiveSnapshot] =
    useState<OwnerDashboardSnapshot | null>(null);
  const [auditRefreshSignal, setAuditRefreshSignal] = useState(0);
  const [auditTotalEntries, setAuditTotalEntries] = useState(initialAuditCount);
  const [staff, setStaff] = useState<OwnerStaffProfileDTO[]>(initialStaff);
  const [liveSync, setLiveSync] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);
  const lastPulseVersionRef = useRef<string | null>(initialPulseVersion);
  const rangeDaysRef = useRef<OwnerRangeDays>(initialSnapshot.rangeDays);
  const snapshotCacheRef = useRef<Map<string, OwnerDashboardSnapshot>>(
    new Map([[`${stationOwnerId}:${initialSnapshot.rangeDays}`, initialSnapshot]])
  );

  useEffect(() => {
    rangeDaysRef.current = rangeDays;
  }, [rangeDays]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const snapshot = liveSnapshot ?? initialSnapshot;

  const stationQueryParam =
    currentUser.role === "superadmin" && selectedStation
      ? `?station=${encodeURIComponent(selectedStation)}`
      : "";
  const stationAmpParam =
    currentUser.role === "superadmin" && selectedStation
      ? `&station=${encodeURIComponent(selectedStation)}`
      : "";

  const fetchSnapshot = useCallback(
    async (nextRange: OwnerRangeDays, nextStation = selectedStation) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const reqId = ++requestSeqRef.current;

      setRefreshing(true);
      setLoadError(null);
      try {
        const stAmp =
          currentUser.role === "superadmin" && nextStation
            ? `&station=${encodeURIComponent(nextStation)}`
            : "";
        const res = await fetch(
          `/api/owner/dashboard?range=${nextRange}${stAmp}`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );

        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          if (requestSeqRef.current === reqId) {
            setLoadError(payload.error ?? "Failed to refresh owner dashboard.");
          }
          return;
        }

        const data = (await res.json()) as OwnerDashboardSnapshot;
        if (requestSeqRef.current === reqId) {
          snapshotCacheRef.current.set(`${nextStation}:${nextRange}`, data);
          setLiveSnapshot(data);
          setAuditRefreshSignal((prev) => prev + 1);
        }
      } catch (error) {
        if (
          requestSeqRef.current === reqId &&
          (error as { name?: string })?.name !== "AbortError"
        ) {
          setLoadError("Connection error while refreshing dashboard.");
        }
      } finally {
        if (requestSeqRef.current === reqId) {
          setRefreshing(false);
        }
      }
    },
    [currentUser.role, selectedStation]
  );

  // Visibility-aware 3s smart pulse (uses rangeDaysRef so switching periods never cancels fetches!)
  useEffect(() => {
    const controller = new AbortController();
    let pulseBusy = false;

    async function checkPulse() {
      if (document.visibilityState !== "visible" || pulseBusy) return;
      pulseBusy = true;
      try {
        const pulseRes = await fetch(`/api/owner/pulse${stationQueryParam}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!pulseRes.ok) return;
        const pulse = (await pulseRes.json()) as { version: string };

        if (pulse.version === lastPulseVersionRef.current) {
          return;
        }
        lastPulseVersionRef.current = pulse.version;
        // Data changed on server: invalidate cached period snapshots
        snapshotCacheRef.current.clear();

        const activeRange = rangeDaysRef.current;
        const dashRes = await fetch(
          `/api/owner/dashboard?range=${activeRange}${stationAmpParam}`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );
        if (!dashRes.ok) return;
        const data = (await dashRes.json()) as OwnerDashboardSnapshot;
        if (rangeDaysRef.current === activeRange) {
          snapshotCacheRef.current.set(`${selectedStation}:${activeRange}`, data);
          setLiveSnapshot(data);
          setAuditRefreshSignal((prev) => prev + 1);
        }
      } catch {
        // Ignore abort / transient background network errors
      } finally {
        pulseBusy = false;
      }
    }

    const intervalId = liveSync
      ? window.setInterval(() => {
          void checkPulse();
        }, 3_000)
      : null;

    function handleResume() {
      if (document.visibilityState === "visible") {
        void checkPulse();
      }
    }

    window.addEventListener("focus", handleResume);
    document.addEventListener("visibilitychange", handleResume);
    return () => {
      controller.abort();
      if (intervalId !== null) window.clearInterval(intervalId);
      window.removeEventListener("focus", handleResume);
      document.removeEventListener("visibilitychange", handleResume);
    };
  }, [liveSync, selectedStation, stationAmpParam, stationQueryParam]);

  function handleSelectPending(item: OwnerPendingItem) {
    trackAction({
      module: "overview",
      action: `Opened Pending Alert: ${item.title}`,
      controlLabel: item.title,
    });
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
    rangeDaysRef.current = nextRange;
    const periodName = formatRangeLabel(nextRange);
    trackAction({
      module: "overview",
      action: `Switched Owner analytics period to ${periodName}`,
      controlLabel: periodName,
    });

    const cached = snapshotCacheRef.current.get(
      `${selectedStation}:${nextRange}`
    );
    if (cached) {
      setLiveSnapshot(cached);
    }

    await fetchSnapshot(nextRange);
  }

  async function handleStationSwitch(nextStationId: string) {
    setSelectedStation(nextStationId);
    lastPulseVersionRef.current = null;
    const chosen = stations.find((s) => s.id === nextStationId);
    trackAction({
      module: "navigation",
      action: `Switched Owner dashboard station to ${chosen?.fullName || chosen?.email || nextStationId}`,
      controlLabel: "Station Selector",
    });
    await fetchSnapshot(rangeDays, nextStationId);
    const staffRes = await fetch(
      `/api/users?station=${encodeURIComponent(nextStationId)}`,
      { cache: "no-store" }
    );
    if (staffRes.ok) {
      const staffData = (await staffRes.json()) as {
        users?: OwnerStaffProfileDTO[];
      };
      if (staffData.users) setStaff(staffData.users);
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
      id: "inventory",
      label: "Gallon Inventory",
      icon: <Package className="h-4 w-4" />,
      badge: `${snapshot.quickStats.onHandGallons} on hand`,
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
      label: "Audit Trail",
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
      label: "Customers",
      icon: <Users className="h-4 w-4" />,
      badge:
        snapshot.quickStats.unpaidCount > 0
          ? `${snapshot.quickStats.unpaidCount} unpaid`
          : snapshot.customers.length,
    },
    {
      id: "staff",
      label: "Cashier Accounts",
      icon: <UserCog className="h-4 w-4" />,
      badge: staff.length,
    },
  ];

  // Direct 1-click Cashier access for Owners & Superadmins (+ Superadmin Panel link for Superadmin)
  const secondaryLinks: AppSidebarLink[] = [
    {
      href: `/cashier${stationQueryParam}`,
      label: "Cashier Station",
      icon: <ShoppingBag className="h-3.5 w-3.5" />,
    },
    ...(currentUser.role === "superadmin"
      ? [
          {
            href: "/superadmin/health",
            label: "Superadmin Panel",
            icon: <Activity className="h-3.5 w-3.5" />,
          },
        ]
      : []),
  ];

  const meta = TAB_TITLES[activeTab];

  return (
    <AppShell
      roleLabel={
        currentUser.role === "superadmin" ? "Superadmin · Owner" : "Station Owner"
      }
      pageTitle={meta.title}
      pageSubtitle={meta.subtitle}
      navItems={navItems}
      activeNavId={activeTab}
      onSelectNav={(id) => setActiveTab(id as OwnerTab)}
      secondaryLinks={secondaryLinks}
      user={{
        name: accountName || "Station Owner",
        email: accountEmail,
      }}
      onSignOut={handleSignOut}
      signingOut={signingOut}
      headerActions={
        <>
          {currentUser.role === "owner" && (
            <button
              type="button"
              onClick={() => {
                trackAction({
                  module: "accounts",
                  action: "Opened Owner Email & Password Security settings",
                  controlLabel: "Account Security",
                });
                setSecurityModalOpen(true);
              }}
              className="av-btn-outline inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition"
              title="Update your Email / Gmail and Password"
            >
              <KeyRound className="h-3.5 w-3.5 text-[var(--av-blue-ink)]" />
              <span>Account</span>
              {credentialsClaimed && (
                <span
                  aria-label="Account secured"
                  className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                />
              )}
            </button>
          )}

          {currentUser.role === "superadmin" && stations.length > 1 && (
            <label className="inline-flex items-center gap-1.5 rounded-full border border-[var(--av-border-strong)] bg-[var(--av-surface)] px-3 py-2 text-xs font-semibold text-[var(--av-ink)]">
              <Building2 className="h-3.5 w-3.5 text-[var(--av-muted)]" />
              <select
                value={selectedStation}
                onChange={(e) => void handleStationSwitch(e.target.value)}
                aria-label="Select station"
                className="bg-transparent text-xs font-semibold text-[var(--av-ink)] focus:outline-none"
              >
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName || s.email}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="inline-flex rounded-full border border-[var(--av-border-strong)] bg-[var(--av-surface)] p-1">
            {([
              { days: 7 as const, label: "Weekly" },
              { days: 30 as const, label: "Monthly" },
              { days: 365 as const, label: "Annually" },
            ]).map((option) => (
              <button
                key={option.days}
                type="button"
                onClick={() => void handleRangeChange(option.days)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  rangeDays === option.days
                    ? "bg-[var(--av-accent)] text-[var(--av-accent-ink)]"
                    : "text-[var(--av-muted)] hover:text-[var(--av-ink)]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              const next = !liveSync;
              setLiveSync(next);
              trackAction({
                module: "overview",
                action: next ? "Turned Live Sync ON" : "Paused Live Sync",
                controlLabel: next ? "Live 3s: ON" : "Live: Paused",
              });
            }}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold transition ${
              liveSync
                ? "border-[var(--av-accent)] bg-[var(--av-accent)] text-[var(--av-accent-ink)]"
                : "border-[var(--av-border-strong)] bg-[var(--av-surface)] text-[var(--av-ink)] hover:bg-[var(--av-surface-subtle)]"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                liveSync
                  ? "animate-pulse bg-[var(--av-accent-ink)]"
                  : "bg-[var(--av-subtle)]"
              }`}
            />
            {liveSync ? "Live: ON" : "Live: Paused"}
          </button>

          <button
            type="button"
            onClick={() => {
              trackAction({
                module: "overview",
                action: "Refreshed Owner Dashboard",
                controlLabel: "Refresh",
              });
              void fetchSnapshot(rangeDays);
            }}
            disabled={refreshing}
            className="av-btn-primary inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
            />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </>
      }
      topBanner={
        (loadError || snapshot.schemaMissing || securityNotice) && (
          <div className="space-y-3">
            {securityNotice && (
              <NoticeBanner
                tone="success"
                message={securityNotice}
                onDismiss={() => setSecurityNotice(null)}
              />
            )}
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
                message="Some station records are still being set up. Please contact your system administrator."
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

      {activeTab === "inventory" && (
        <OwnerInventoryTab
          stationQuery={stationQueryParam}
          todayDate={snapshot.endDate}
          refreshSignal={auditRefreshSignal}
          onDataChanged={() => fetchSnapshot(rangeDays)}
        />
      )}

      {activeTab === "supervision" && (
        <OwnerSupervisionTab
          snapshot={snapshot}
          stationQuery={stationQueryParam}
          onDataChanged={() => fetchSnapshot(rangeDays)}
        />
      )}

      {activeTab === "audit" && (
        <OwnerAuditTab
          todayDate={snapshot.endDate}
          stationAmpParam={stationAmpParam}
          stationQueryParam={stationQueryParam}
          refreshSignal={auditRefreshSignal}
          onTotalEntriesChange={setAuditTotalEntries}
        />
      )}

      {activeTab === "sales" && (
        <OwnerSalesTab
          snapshot={snapshot}
          stationQuery={stationQueryParam}
          stationAmpParam={stationAmpParam}
          subView={salesSubView}
          onSubViewChange={setSalesSubView}
          onDataChanged={() => fetchSnapshot(rangeDays)}
        />
      )}

      {activeTab === "expenses" && (
        <OwnerExpensesTab
          snapshot={snapshot}
          stationQuery={stationQueryParam}
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
        <OwnerStaffTab
          staff={staff}
          stationOwnerId={selectedStation}
          isSuperadmin={currentUser.role === "superadmin"}
          onStaffChange={setStaff}
        />
      )}

      {currentUser.role === "owner" &&
        (mustChangeCredentials || securityModalOpen) && (
          <OwnerAccountSecurityModal
            currentName={accountName}
            currentEmail={accountEmail}
            mandatory={mustChangeCredentials}
            isSecured={credentialsClaimed}
            onClose={() => setSecurityModalOpen(false)}
            onUpdated={({ email: nextEmail, fullName: nextName }) => {
              setAccountEmail(nextEmail);
              setAccountName(nextName);
              setMustChangeCredentials(false);
              setCredentialsClaimed(true);
              setSecurityModalOpen(false);
              setSecurityNotice(
                `Your profile (${nextName || "Owner"} · ${nextEmail}) and security settings have been saved. Your account is private and protected from Superadmin access.`
              );
              router.refresh();
            }}
          />
        )}
    </AppShell>
  );
}

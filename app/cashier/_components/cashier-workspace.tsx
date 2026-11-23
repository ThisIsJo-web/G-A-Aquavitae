"use client";

import {
  Activity,
  Building2,
  Calendar,
  Calculator,
  Coins,
  LayoutDashboard,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Truck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { trackAction } from "@/app/_components/activity-tracker";
import {
  AppShell,
  type AppNavItem,
  type AppSidebarLink,
} from "@/app/_components/ui/app-shell";
import {
  addIsoDaysClient,
  clampIsoDate,
} from "@/app/_components/ui/input-validation";
import { NoticeBanner } from "@/app/_components/ui/monochrome-controls";
import type { CorrectionRequestsOverview } from "@/backend/services/corrections";
import {
  CorrectionRequestModal,
  type CorrectionModalTarget,
} from "./correction-request-modal";
import { CashierCorrectionsTab } from "./corrections-tab";
import { DeliveriesTab } from "./deliveries-tab";
import { ShiftClosingTab } from "./shift-closing-tab";
import {
  formatPHP,
  type DeliveriesOverviewDTO,
  type PosOverviewDTO,
  type ShiftClosingOverviewDTO,
  type StationOptionDTO,
  type UserRole,
  type VendoOverviewDTO,
} from "./types";
import { VendoTab } from "./vendo-tab";
import { WalkInPosTab } from "./walkin-pos-tab";

interface CashierWorkspaceProps {
  currentUser: {
    id: string;
    email: string;
    fullName: string | null;
    role: UserRole;
  };
  stationOwnerId: string;
  stations: StationOptionDTO[];
  initialDate: string;
  initialPos: PosOverviewDTO;
  initialDeliveries: DeliveriesOverviewDTO;
  initialVendo: VendoOverviewDTO;
  initialShift: ShiftClosingOverviewDTO;
  initialCorrections: CorrectionRequestsOverview;
}

type CashierTab = "pos" | "deliveries" | "vendo" | "shift" | "reviews";

const TAB_TITLES: Record<CashierTab, { title: string; subtitle: string }> = {
  pos: {
    title: "Walk-in POS",
    subtitle: "Quick counter checkout — Refill ₱20 · Gallon Filled with Water ₱160",
  },
  deliveries: {
    title: "Deliveries",
    subtitle: "Regular customers, gallon swap tracking, and daily/weekly/monthly tallies",
  },
  vendo: {
    title: "Vendo Income",
    subtitle: "Monthly water vendo coin collections",
  },
  shift: {
    title: "Closing Shift Tally",
    subtitle: "Automatic daily peso tally and Over / Short cash check",
  },
  reviews: {
    title: "Correction History",
    subtitle: "Requests and adjustments reviewed for station records",
  },
};

export function CashierWorkspace({
  currentUser,
  stationOwnerId,
  stations,
  initialDate,
  initialPos,
  initialDeliveries,
  initialVendo,
  initialShift,
  initialCorrections,
}: CashierWorkspaceProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<CashierTab>("pos");
  const [businessDate, setBusinessDate] = useState(initialDate);
  const [selectedStation, setSelectedStation] = useState(stationOwnerId);
  const [pos, setPos] = useState<PosOverviewDTO>(initialPos);
  const [deliveries, setDeliveries] =
    useState<DeliveriesOverviewDTO>(initialDeliveries);
  const [vendo, setVendo] = useState<VendoOverviewDTO>(initialVendo);
  const [shift, setShift] = useState<ShiftClosingOverviewDTO>(initialShift);
  const [corrections, setCorrections] =
    useState<CorrectionRequestsOverview>(initialCorrections);
  const [modalTarget, setModalTarget] = useState<CorrectionModalTarget | null>(
    null
  );
  const [correctionNotice, setCorrectionNotice] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const prevPendingCountRef = useRef(initialCorrections.pendingCount);
  const lastFocusSyncRef = useRef(0);

  const isElevatedActor =
    currentUser.role === "owner" || currentUser.role === "superadmin";
  const maxDate = initialDate;
  const minDate = addIsoDaysClient(initialDate, -7);

  const stationOnlyQuery =
    currentUser.role === "superadmin" && selectedStation
      ? `?station=${encodeURIComponent(selectedStation)}`
      : "";

  const schemaMissing =
    pos.schemaMissing ||
    deliveries.schemaMissing ||
    vendo.schemaMissing ||
    shift.schemaMissing;

  // Consolidated single-request reload (replaces 6 separate HTTP calls)
  const reloadWorkspace = useCallback(
    async (targetDate: string, targetStation = selectedStation) => {
      setRefreshing(true);
      try {
        const stQs =
          currentUser.role === "superadmin" && targetStation
            ? `&station=${encodeURIComponent(targetStation)}`
            : "";
        const res = await fetch(
          `/api/cashier/workspace?date=${encodeURIComponent(targetDate)}${stQs}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          pos: PosOverviewDTO;
          deliveries: DeliveriesOverviewDTO;
          vendo: VendoOverviewDTO;
          shift: ShiftClosingOverviewDTO;
          corrections: CorrectionRequestsOverview;
        };
        setPos(data.pos);
        setDeliveries(data.deliveries);
        setVendo(data.vendo);
        setShift(data.shift);
        prevPendingCountRef.current = data.corrections.pendingCount;
        setCorrections(data.corrections);
      } finally {
        setRefreshing(false);
      }
    },
    [currentUser.role, selectedStation]
  );

  // Fast 3s poll for Owner Review approvals while tab is visible (for Cashiers with pending items)
  useEffect(() => {
    if (corrections.pendingCount === 0 && activeTab !== "reviews") return;

    const controller = new AbortController();
    let pollBusy = false;

    async function pollOwnerReviews() {
      if (document.visibilityState !== "visible" || pollBusy) return;
      pollBusy = true;
      try {
        const res = await fetch(`/api/cashier/corrections${stationOnlyQuery}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) return;
        const next = (await res.json()) as CorrectionRequestsOverview;
        const wasPending = prevPendingCountRef.current;
        prevPendingCountRef.current = next.pendingCount;
        setCorrections(next);

        if (next.pendingCount < wasPending) {
          setCorrectionNotice(
            "An Owner review decision was applied. Station totals have been refreshed."
          );
          await reloadWorkspace(businessDate);
        }
      } catch {
        // Ignore abort / transient errors
      } finally {
        pollBusy = false;
      }
    }

    const intervalId = window.setInterval(() => {
      void pollOwnerReviews();
    }, 3_000);

    function handleVisible() {
      if (document.visibilityState === "visible") {
        void pollOwnerReviews();
      }
    }

    document.addEventListener("visibilitychange", handleVisible);
    return () => {
      controller.abort();
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, [
    activeTab,
    businessDate,
    corrections.pendingCount,
    reloadWorkspace,
    stationOnlyQuery,
  ]);

  // Zero-polling cross-session sync: refresh workspace once when returning to tab (throttled 5s)
  useEffect(() => {
    function handleResume() {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastFocusSyncRef.current < 5_000) return;
      lastFocusSyncRef.current = now;
      void reloadWorkspace(businessDate);
    }

    window.addEventListener("focus", handleResume);
    document.addEventListener("visibilitychange", handleResume);
    return () => {
      window.removeEventListener("focus", handleResume);
      document.removeEventListener("visibilitychange", handleResume);
    };
  }, [businessDate, reloadWorkspace]);

  async function handleDateChange(rawDate: string) {
    const safeDate = clampIsoDate(rawDate, minDate, maxDate);
    setBusinessDate(safeDate);
    trackAction({
      module: "cashier",
      action: `Changed cashier working date to ${safeDate}`,
      controlLabel: "Date Picker",
    });
    await reloadWorkspace(safeDate);
  }

  async function handleStationSwitch(nextStationId: string) {
    setSelectedStation(nextStationId);
    const chosen = stations.find((s) => s.id === nextStationId);
    trackAction({
      module: "navigation",
      action: `Switched Cashier station to ${chosen?.fullName || chosen?.email || nextStationId}`,
      controlLabel: "Station Selector",
    });
    await reloadWorkspace(businessDate, nextStationId);
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
      id: "pos",
      label: "Walk-in POS",
      icon: <ShoppingBag className="h-4 w-4" />,
      badge: pos.summary.completedCount,
    },
    {
      id: "deliveries",
      label: "Deliveries",
      icon: <Truck className="h-4 w-4" />,
      badge: deliveries.tallies.today.count,
    },
    {
      id: "vendo",
      label: "Vendo Income",
      icon: <Coins className="h-4 w-4" />,
      badge: formatPHP(vendo.summary.thisMonthTotal),
    },
    {
      id: "shift",
      label: "Closing Shift",
      icon: <Calculator className="h-4 w-4" />,
      badge: formatPHP(shift.liveTally.totalGrossSales),
    },
    {
      id: "reviews",
      label: isElevatedActor ? "Corrections Log" : "Owner Reviews",
      icon: <ShieldCheck className="h-4 w-4" />,
      badge:
        corrections.pendingCount > 0
          ? `${corrections.pendingCount} pending`
          : undefined,
    },
  ];

  const secondaryLinks: AppSidebarLink[] = [];
  if (currentUser.role === "owner") {
    secondaryLinks.push({
      href: "/owner",
      label: "Owner Dashboard",
      icon: <LayoutDashboard className="h-3.5 w-3.5" />,
    });
  } else if (currentUser.role === "superadmin") {
    secondaryLinks.push(
      {
        href: `/owner${stationOnlyQuery}`,
        label: "Owner Dashboard",
        icon: <LayoutDashboard className="h-3.5 w-3.5" />,
      },
      {
        href: "/superadmin/health",
        label: "Superadmin Panel",
        icon: <Activity className="h-3.5 w-3.5" />,
      }
    );
  }

  const roleLabel =
    currentUser.role === "owner"
      ? "Owner · Cashier"
      : currentUser.role === "superadmin"
        ? "Superadmin · Cashier"
        : "Cashier";

  const meta = TAB_TITLES[activeTab];

  return (
    <AppShell
      roleLabel={roleLabel}
      pageTitle={meta.title}
      pageSubtitle={meta.subtitle}
      navItems={navItems}
      activeNavId={activeTab}
      onSelectNav={(id) => setActiveTab(id as CashierTab)}
      secondaryLinks={secondaryLinks}
      user={{
        name: currentUser.fullName || currentUser.role,
        email: currentUser.email,
      }}
      onSignOut={handleSignOut}
      signingOut={signingOut}
      headerActions={
        <>
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

          <label
            title={`Allowed dates: ${minDate} to ${maxDate}`}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--av-border-strong)] bg-[var(--av-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--av-ink)]"
          >
            <Calendar className="h-3.5 w-3.5 text-[var(--av-muted)]" />
            <input
              type="date"
              value={businessDate}
              min={minDate}
              max={maxDate}
              onChange={(e) => void handleDateChange(e.target.value)}
              className="bg-transparent text-xs font-semibold text-[var(--av-ink)] tabular-nums focus:outline-none"
            />
          </label>

          <button
            type="button"
            onClick={() => {
              trackAction({
                module: "cashier",
                action: "Refreshed Cashier workspace",
                controlLabel: "Refresh",
              });
              void reloadWorkspace(businessDate);
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
        (schemaMissing || correctionNotice) && (
          <div className="space-y-3">
            {correctionNotice && (
              <NoticeBanner
                tone="success"
                message={correctionNotice}
                onDismiss={() => setCorrectionNotice(null)}
              />
            )}
            {schemaMissing && (
              <NoticeBanner
                tone="info"
                message="Some station records are still being set up. Please contact your system administrator."
              />
            )}
          </div>
        )
      }
    >
      {activeTab === "pos" && (
        <WalkInPosTab
          pos={pos}
          customers={deliveries.customers}
          businessDate={businessDate}
          stationQuery={stationOnlyQuery}
          isElevatedActor={isElevatedActor}
          onDataChanged={() => reloadWorkspace(businessDate)}
          onRequestCorrection={setModalTarget}
        />
      )}

      {activeTab === "deliveries" && (
        <DeliveriesTab
          data={deliveries}
          businessDate={businessDate}
          stationQuery={stationOnlyQuery}
          isElevatedActor={isElevatedActor}
          onDataChanged={() => reloadWorkspace(businessDate)}
          onRequestCorrection={setModalTarget}
        />
      )}

      {activeTab === "vendo" && (
        <VendoTab
          data={vendo}
          businessDate={businessDate}
          todayDate={initialDate}
          stationQuery={stationOnlyQuery}
          isElevatedActor={isElevatedActor}
          onDataChanged={() => reloadWorkspace(businessDate)}
          onRequestCorrection={setModalTarget}
        />
      )}

      {activeTab === "shift" && (
        <ShiftClosingTab
          data={shift}
          businessDate={businessDate}
          stationQuery={stationOnlyQuery}
          isElevatedActor={isElevatedActor}
          onDataChanged={() => reloadWorkspace(businessDate)}
          onRequestCorrection={setModalTarget}
        />
      )}

      {activeTab === "reviews" && <CashierCorrectionsTab data={corrections} />}

      {modalTarget && (
        <CorrectionRequestModal
          target={modalTarget}
          stationQuery={stationOnlyQuery}
          isElevatedActor={isElevatedActor}
          onClose={() => setModalTarget(null)}
          onSubmitted={async (appliedDirectly) => {
            setCorrectionNotice(
              appliedDirectly
                ? `Applied correction to "${modalTarget.entityLabel}" and recorded it in the audit trail.`
                : `Sent "${modalTarget.entityLabel}" to Station Owner for review.`
            );
            await reloadWorkspace(businessDate);
          }}
        />
      )}
    </AppShell>
  );
}

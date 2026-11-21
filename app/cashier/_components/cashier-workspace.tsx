"use client";

import {
  Calendar,
  Calculator,
  Coins,
  LayoutDashboard,
  Package,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Truck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell, type AppNavItem } from "@/app/_components/ui/app-shell";
import { NoticeBanner } from "@/app/_components/ui/monochrome-controls";
import type { CorrectionRequestsOverview } from "@/backend/services/corrections";
import {
  CorrectionRequestModal,
  type CorrectionModalTarget,
} from "./correction-request-modal";
import { CashierCorrectionsTab } from "./corrections-tab";
import { DeliveriesTab } from "./deliveries-tab";
import { InventoryTab } from "./inventory-tab";
import { ShiftClosingTab } from "./shift-closing-tab";
import {
  formatPHP,
  type DeliveriesOverviewDTO,
  type ElevationBannerDTO,
  type InventoryOverviewDTO,
  type PosOverviewDTO,
  type ShiftClosingOverviewDTO,
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
    isOwnerCashier?: boolean;
  };
  elevation: ElevationBannerDTO | null;
  initialDate: string;
  initialPos: PosOverviewDTO;
  initialDeliveries: DeliveriesOverviewDTO;
  initialVendo: VendoOverviewDTO;
  initialInventory: InventoryOverviewDTO;
  initialShift: ShiftClosingOverviewDTO;
  initialCorrections: CorrectionRequestsOverview;
}

type CashierTab =
  | "pos"
  | "deliveries"
  | "vendo"
  | "inventory"
  | "shift"
  | "reviews";

const TAB_TITLES: Record<CashierTab, { title: string; subtitle: string }> = {
  pos: {
    title: "Walk-in POS",
    subtitle: "Quick counter checkout — Refill ₱20 · Gallon Filled with Water ₱160",
  },
  deliveries: {
    title: "Deliveries",
    subtitle: "Regular customers, gallon In & Out, and daily/weekly/monthly tallies",
  },
  vendo: {
    title: "Vendo Income",
    subtitle: "Daily and weekly water vendo coin collections",
  },
  inventory: {
    title: "Gallon Inventory",
    subtitle: "Daily station stock and customer borrowed gallons",
  },
  shift: {
    title: "Closing Shift Tally",
    subtitle: "Automatic daily peso tally and Over / Short cash check",
  },
  reviews: {
    title: "Owner Reviews",
    subtitle: "Correction requests sent for Station Owner approval",
  },
};

export function CashierWorkspace({
  currentUser,
  elevation,
  initialDate,
  initialPos,
  initialDeliveries,
  initialVendo,
  initialInventory,
  initialShift,
  initialCorrections,
}: CashierWorkspaceProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<CashierTab>("pos");
  const [businessDate, setBusinessDate] = useState(initialDate);
  const [pos, setPos] = useState<PosOverviewDTO>(initialPos);
  const [deliveries, setDeliveries] =
    useState<DeliveriesOverviewDTO>(initialDeliveries);
  const [vendo, setVendo] = useState<VendoOverviewDTO>(initialVendo);
  const [inventory, setInventory] =
    useState<InventoryOverviewDTO>(initialInventory);
  const [shift, setShift] = useState<ShiftClosingOverviewDTO>(initialShift);
  const [corrections, setCorrections] =
    useState<CorrectionRequestsOverview>(initialCorrections);
  const [modalTarget, setModalTarget] = useState<CorrectionModalTarget | null>(
    null
  );
  const [correctionNotice, setCorrectionNotice] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [exitingAudit, setExitingAudit] = useState(false);
  const prevPendingCountRef = useRef(initialCorrections.pendingCount);

  const schemaMissing =
    pos.schemaMissing ||
    deliveries.schemaMissing ||
    vendo.schemaMissing ||
    inventory.schemaMissing ||
    shift.schemaMissing;

  const reloadForDate = useCallback(async (targetDate: string) => {
    setRefreshing(true);
    try {
      const qs = `?date=${encodeURIComponent(targetDate)}`;
      const [posRes, delRes, venRes, invRes, shiftRes, corrRes] =
        await Promise.all([
          fetch(`/api/cashier/pos${qs}`, { cache: "no-store" }),
          fetch(`/api/cashier/deliveries${qs}`, { cache: "no-store" }),
          fetch(`/api/cashier/vendo${qs}`, { cache: "no-store" }),
          fetch(`/api/cashier/inventory${qs}`, { cache: "no-store" }),
          fetch(`/api/cashier/shift-closing${qs}`, { cache: "no-store" }),
          fetch("/api/cashier/corrections", { cache: "no-store" }),
        ]);

      if (posRes.ok) setPos((await posRes.json()) as PosOverviewDTO);
      if (delRes.ok)
        setDeliveries((await delRes.json()) as DeliveriesOverviewDTO);
      if (venRes.ok) setVendo((await venRes.json()) as VendoOverviewDTO);
      if (invRes.ok)
        setInventory((await invRes.json()) as InventoryOverviewDTO);
      if (shiftRes.ok)
        setShift((await shiftRes.json()) as ShiftClosingOverviewDTO);
      if (corrRes.ok) {
        const nextCorr = (await corrRes.json()) as CorrectionRequestsOverview;
        prevPendingCountRef.current = nextCorr.pendingCount;
        setCorrections(nextCorr);
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Option 1 (Fast): Lightweight 3s check for Owner Review approvals while tab is visible
  useEffect(() => {
    if (corrections.pendingCount === 0 && activeTab !== "reviews") return;

    const controller = new AbortController();
    let pollBusy = false;

    async function pollOwnerReviews() {
      if (document.visibilityState !== "visible" || pollBusy) return;
      pollBusy = true;
      try {
        const res = await fetch("/api/cashier/corrections", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) return;
        const next = (await res.json()) as CorrectionRequestsOverview;
        const wasPending = prevPendingCountRef.current;
        prevPendingCountRef.current = next.pendingCount;
        setCorrections(next);

        // If Owner approved or rejected a pending request, refresh today's station numbers
        if (next.pendingCount < wasPending) {
          setCorrectionNotice(
            "An Owner Supervision decision was applied. Station totals have been refreshed."
          );
          await reloadForDate(businessDate);
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
  }, [activeTab, businessDate, corrections.pendingCount, reloadForDate]);

  async function handleDateChange(nextDate: string) {
    setBusinessDate(nextDate);
    await reloadForDate(nextDate);
  }

  async function handleExitAudit() {
    setExitingAudit(true);
    try {
      await fetch("/api/superadmin/elevation", { method: "DELETE" });
      router.push("/superadmin/health");
      router.refresh();
    } finally {
      setExitingAudit(false);
    }
  }

  async function handleSwitchToOwnerLogin() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login?mode=return-owner");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      if (elevation) {
        await fetch("/api/superadmin/elevation", { method: "DELETE" });
      }
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
      badge: formatPHP(vendo.summary.todayDailyTotal),
    },
    {
      id: "inventory",
      label: "Gallon Inventory",
      icon: <Package className="h-4 w-4" />,
      badge: `${inventory.summary.currentlyBorrowedOut} out`,
    },
    {
      id: "shift",
      label: "Closing Shift",
      icon: <Calculator className="h-4 w-4" />,
      badge: formatPHP(shift.liveTally.totalGrossSales),
    },
    {
      id: "reviews",
      label: "Owner Reviews",
      icon: <ShieldCheck className="h-4 w-4" />,
      badge:
        corrections.pendingCount > 0
          ? `${corrections.pendingCount} pending`
          : undefined,
    },
  ];

  const meta = TAB_TITLES[activeTab];

  return (
    <AppShell
      roleLabel={currentUser.role}
      pageTitle={meta.title}
      pageSubtitle={meta.subtitle}
      navItems={navItems}
      activeNavId={activeTab}
      onSelectNav={(id) => setActiveTab(id as CashierTab)}
      secondaryAction={
        currentUser.isOwnerCashier
          ? {
              label: "Switch to Owner Login",
              sublabel: "Marked as My Account",
              icon: <LayoutDashboard className="h-3.5 w-3.5" />,
              onClick: () => void handleSwitchToOwnerLogin(),
              disabled: signingOut,
            }
          : undefined
      }
      user={{
        name: currentUser.fullName || currentUser.role,
        email: currentUser.email,
      }}
      onSignOut={handleSignOut}
      signingOut={signingOut}
      headerActions={
        <>
          <label className="inline-flex items-center gap-2 rounded-full border border-[#D4D4D8] bg-white px-3.5 py-2 text-xs font-semibold text-[#111111]">
            <Calendar className="h-3.5 w-3.5 text-[#71717A]" />
            <input
              type="date"
              value={businessDate}
              onChange={(e) => void handleDateChange(e.target.value)}
              className="bg-transparent text-xs font-semibold text-[#111111] tabular-nums focus:outline-none"
            />
          </label>

          <button
            type="button"
            onClick={() => void reloadForDate(businessDate)}
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
        (elevation || schemaMissing || correctionNotice) && (
          <div className="space-y-3">
            {correctionNotice && (
              <NoticeBanner
                tone="success"
                message={correctionNotice}
                onDismiss={() => setCorrectionNotice(null)}
              />
            )}
            {elevation && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#111111] px-5 py-3.5 text-xs text-white">
                <div>
                  <span className="font-bold uppercase tracking-wider">
                    Superadmin Audit Mode
                  </span>{" "}
                  · {elevation.targetOwnerLabel} · Reason:{" "}
                  <span className="text-white/80">{elevation.reason}</span> ·
                  Expires{" "}
                  <span className="tabular-nums">
                    {new Date(elevation.expiresAt).toLocaleTimeString()}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleExitAudit}
                  disabled={exitingAudit}
                  className="rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-[#111111] transition hover:bg-[#EFEFF2] disabled:opacity-50"
                >
                  {exitingAudit ? "Exiting..." : "Exit Audit"}
                </button>
              </div>
            )}

            {schemaMissing && (
              <NoticeBanner
                tone="info"
                message="Some database tables or columns are not applied yet. Run the latest SQL in backend/db/schema.sql in Supabase SQL Editor, then click Refresh."
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
          onDataChanged={() => reloadForDate(businessDate)}
          onRequestCorrection={setModalTarget}
        />
      )}

      {activeTab === "deliveries" && (
        <DeliveriesTab
          data={deliveries}
          businessDate={businessDate}
          onDataChanged={() => reloadForDate(businessDate)}
          onRequestCorrection={setModalTarget}
        />
      )}

      {activeTab === "vendo" && (
        <VendoTab
          data={vendo}
          businessDate={businessDate}
          onDataChanged={() => reloadForDate(businessDate)}
          onRequestCorrection={setModalTarget}
        />
      )}

      {activeTab === "inventory" && (
        <InventoryTab
          data={inventory}
          businessDate={businessDate}
          onDataChanged={() => reloadForDate(businessDate)}
        />
      )}

      {activeTab === "shift" && (
        <ShiftClosingTab
          data={shift}
          businessDate={businessDate}
          onDataChanged={() => reloadForDate(businessDate)}
          onRequestCorrection={setModalTarget}
        />
      )}

      {activeTab === "reviews" && <CashierCorrectionsTab data={corrections} />}

      {modalTarget && (
        <CorrectionRequestModal
          target={modalTarget}
          onClose={() => setModalTarget(null)}
          onSubmitted={async () => {
            setCorrectionNotice(
              `Sent "${modalTarget.entityLabel}" to Station Owner for supervision approval.`
            );
            await reloadForDate(businessDate);
          }}
        />
      )}
    </AppShell>
  );
}

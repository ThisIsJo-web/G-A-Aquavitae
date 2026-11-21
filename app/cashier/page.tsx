import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getCashierPageContext } from "@/backend/services/auth-guards";
import { getDeliveriesOverview } from "@/backend/services/cashier/deliveries";
import { getInventoryOverview } from "@/backend/services/cashier/inventory";
import { listPosOverview } from "@/backend/services/cashier/pos";
import { getTodayBusinessDate } from "@/backend/services/cashier/shared";
import { getDailyShiftTally } from "@/backend/services/cashier/shift-closing";
import { getVendoOverview } from "@/backend/services/cashier/vendo";
import { listCorrectionRequests } from "@/backend/services/corrections";
import { CashierSkeleton } from "./_components/cashier-skeleton";
import { CashierWorkspace } from "./_components/cashier-workspace";
import { SuperadminIntegrityGate } from "./_components/superadmin-integrity-gate";

export const metadata: Metadata = {
  title: "Cashier Station | AquaVitae",
  description:
    "Walk-in POS, Deliveries & Rider Tally, Vendo Income, Gallon Inventory, and Closing Shift Daily Tally",
};

async function CashierPageContent() {
  await connection();
  const ctx = await getCashierPageContext();

  if (ctx.status === "unauthenticated") {
    redirect("/login?next=/cashier");
  }

  if (ctx.status === "superadmin_needs_verification") {
    return (
      <SuperadminIntegrityGate
        superadminEmail={ctx.profile.email}
        initialHasVerifiedTotp={ctx.totp.hasVerifiedFactor}
        initialFactorId={ctx.totp.verifiedFactorId}
        targets={ctx.targets}
      />
    );
  }

  if (ctx.status === "forbidden") {
    const backHref = ctx.role === "owner" ? "/owner" : "/login";
    const backLabel =
      ctx.role === "owner" ? "Back to Owner Dashboard" : "Back to Login";

    return (
      <main className="flex min-h-screen items-center justify-center bg-[#EFEFF2] px-4">
        <div className="w-full max-w-md rounded-[28px] border border-[#E5E5EA] bg-white p-8 text-center shadow-[0_12px_40px_rgba(0,0,0,0.05)]">
          <span className="inline-block rounded-full bg-[#111111] px-3 py-1 text-xs font-semibold text-white">
            403 · ACCESS RESTRICTED
          </span>
          <h1 className="mt-4 text-xl font-bold text-[#111111]">
            Cashier Access Only
          </h1>
          <p className="mt-2 text-sm text-[#71717A]">{ctx.reason}</p>
          <Link
            href={backHref}
            className="mt-6 inline-block rounded-full bg-[#111111] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-black/85"
          >
            {backLabel}
          </Link>
        </div>
      </main>
    );
  }

  const today = getTodayBusinessDate();
  const [
    initialPos,
    initialDeliveries,
    initialVendo,
    initialInventory,
    initialShift,
    initialCorrections,
  ] = await Promise.all([
    listPosOverview(ctx.tenantOwnerId, today),
    getDeliveriesOverview(ctx.tenantOwnerId, today),
    getVendoOverview(ctx.tenantOwnerId, today),
    getInventoryOverview(ctx.tenantOwnerId, today),
    getDailyShiftTally(ctx.tenantOwnerId, today),
    listCorrectionRequests(ctx.tenantOwnerId, 40),
  ]);

  return (
    <CashierWorkspace
      currentUser={{
        id: ctx.profile.id,
        email: ctx.profile.email,
        fullName: ctx.profile.full_name,
        role: ctx.profile.role,
        isOwnerCashier: Boolean(ctx.profile.is_owner_cashier),
      }}
      elevation={
        ctx.elevation
          ? {
            targetOwnerLabel: ctx.elevation.targetOwnerLabel,
            reason: ctx.elevation.reason,
            expiresAt: ctx.elevation.expiresAt,
          }
          : null
      }
      initialDate={today}
      initialPos={initialPos}
      initialDeliveries={initialDeliveries}
      initialVendo={initialVendo}
      initialInventory={initialInventory}
      initialShift={initialShift}
      initialCorrections={initialCorrections}
    />
  );
}

export default function CashierPage() {
  return (
    <Suspense fallback={<CashierSkeleton />}>
      <CashierPageContent />
    </Suspense>
  );
}

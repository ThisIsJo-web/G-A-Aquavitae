import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getCashierPageContext } from "@/backend/services/auth-guards";
import { getTodayBusinessDate } from "@/backend/services/cashier/shared";
import { getCashierWorkspaceSnapshot } from "@/backend/services/cashier/shift-closing";
import { CashierSkeleton } from "./_components/cashier-skeleton";
import { CashierWorkspace } from "./_components/cashier-workspace";

export const metadata: Metadata = {
  title: "Cashier Station | G & A Aqua Vitae",
  description:
    "Walk-in POS, Deliveries, Vendo Income, and Closing Shift Daily Tally",
};

interface CashierPageProps {
  searchParams: Promise<{ station?: string }>;
}

async function CashierPageContent({
  searchParams,
}: {
  searchParams: Promise<{ station?: string }>;
}) {
  await connection();
  const resolvedParams = await searchParams;
  const ctx = await getCashierPageContext(resolvedParams?.station);

  if (ctx.status === "unauthenticated") {
    redirect("/login?next=/cashier");
  }

  if (ctx.status === "forbidden") {
    const backHref =
      ctx.role === "superadmin"
        ? "/superadmin/health"
        : ctx.role === "owner"
          ? "/owner"
          : "/login";
    const backLabel =
      ctx.role === "superadmin"
        ? "Back to Superadmin Panel"
        : ctx.role === "owner"
          ? "Back to Owner Dashboard"
          : "Back to Login";

    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--av-backdrop)] px-4">
        <div className="av-card w-full max-w-md p-8 text-center">
          <span className="inline-block rounded-full bg-[var(--av-accent)] px-3 py-1 text-xs font-semibold text-[var(--av-accent-ink)]">
            Access Restricted
          </span>
          <h1 className="mt-4 text-xl font-bold text-[var(--av-ink)]">
            Station Access Required
          </h1>
          <p className="mt-2 text-sm text-[var(--av-muted)]">{ctx.reason}</p>
          <Link
            href={backHref}
            className="av-btn-primary mt-6 inline-block rounded-full px-5 py-2.5 text-sm font-semibold transition"
          >
            {backLabel}
          </Link>
        </div>
      </main>
    );
  }

  const today = getTodayBusinessDate();
  const initialWorkspace = await getCashierWorkspaceSnapshot(
    ctx.tenantOwnerId,
    today
  );

  return (
    <CashierWorkspace
      currentUser={{
        id: ctx.profile.id,
        email: ctx.profile.email,
        fullName: ctx.profile.full_name,
        role: ctx.profile.role,
      }}
      stationOwnerId={ctx.tenantOwnerId}
      stations={ctx.stations}
      initialDate={today}
      initialPos={initialWorkspace.pos}
      initialDeliveries={initialWorkspace.deliveries}
      initialVendo={initialWorkspace.vendo}
      initialShift={initialWorkspace.shift}
      initialCorrections={initialWorkspace.corrections}
    />
  );
}

export default function CashierPage({ searchParams }: CashierPageProps) {
  return (
    <Suspense fallback={<CashierSkeleton />}>
      <CashierPageContent searchParams={searchParams} />
    </Suspense>
  );
}

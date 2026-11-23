import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getOwnerAuditEntryCount } from "@/backend/services/audit-ledger";
import { getOwnerPageContext } from "@/backend/services/auth-guards";
import {
  getOwnerDashboardSnapshot,
  getOwnerPulse,
} from "@/backend/services/owner/dashboard";
import { listManagedUsers } from "@/backend/services/users";
import { OwnerSkeleton } from "./_components/owner-skeleton";
import { OwnerWorkspace } from "./_components/owner-workspace";

export const metadata: Metadata = {
  title: "Owner Dashboard | G & A Aqua Vitae",
  description:
    "Station analytics: sales, gallons sold, unpaid balances, expenses, inventory, and staff management",
};

interface OwnerPageProps {
  searchParams: Promise<{ station?: string }>;
}

async function OwnerPageContent({
  searchParams,
}: {
  searchParams: Promise<{ station?: string }>;
}) {
  await connection();
  const resolvedParams = await searchParams;
  const ctx = await getOwnerPageContext(resolvedParams?.station);

  if (ctx.status === "unauthenticated") {
    redirect("/login?next=/owner");
  }

  if (ctx.status === "forbidden") {
    const backHref =
      ctx.role === "superadmin"
        ? "/superadmin/health"
        : ctx.role === "cashier"
          ? "/cashier"
          : "/login";

    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--av-backdrop)] px-4">
        <div className="av-card w-full max-w-md p-8 text-center">
          <span className="inline-block rounded-full bg-[var(--av-accent)] px-3 py-1 text-xs font-semibold text-[var(--av-accent-ink)]">
            Access Restricted
          </span>
          <h1 className="mt-4 text-xl font-bold text-[var(--av-ink)]">
            Station Owner Access Required
          </h1>
          <p className="mt-2 text-sm text-[var(--av-muted)]">{ctx.reason}</p>
          <Link
            href={backHref}
            className="av-btn-primary mt-6 inline-block rounded-full px-5 py-2.5 text-sm font-semibold transition"
          >
            Go Back
          </Link>
        </div>
      </main>
    );
  }

  const [initialSnapshot, initialStaff, initialAuditCount, initialPulse] =
    await Promise.all([
      getOwnerDashboardSnapshot(ctx.tenantOwnerId, 7),
      listManagedUsers(ctx.profile, ctx.tenantOwnerId),
      getOwnerAuditEntryCount(ctx.tenantOwnerId),
      getOwnerPulse(ctx.tenantOwnerId),
    ]);

  return (
    <OwnerWorkspace
      currentUser={{
        id: ctx.profile.id,
        email: ctx.profile.email,
        fullName: ctx.profile.full_name,
        role: ctx.profile.role,
      }}
      stationOwnerId={ctx.tenantOwnerId}
      stations={ctx.stations}
      initialSnapshot={initialSnapshot}
      initialStaff={initialStaff}
      initialAuditCount={initialAuditCount}
      initialPulseVersion={initialPulse.version}
      mustChangeCredentials={ctx.mustChangeCredentials}
      credentialsClaimed={ctx.credentialsClaimed}
    />
  );
}

export default function OwnerPage({ searchParams }: OwnerPageProps) {
  return (
    <Suspense fallback={<OwnerSkeleton />}>
      <OwnerPageContent searchParams={searchParams} />
    </Suspense>
  );
}

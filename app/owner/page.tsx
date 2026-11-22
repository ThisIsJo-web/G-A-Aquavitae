import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getOwnerPageContext } from "@/backend/services/auth-guards";
import { queryOwnerAuditLedger } from "@/backend/services/audit-ledger";
import { getOwnerDashboardSnapshot } from "@/backend/services/owner/dashboard";
import { listManagedUsers } from "@/backend/services/users";
import { OwnerSkeleton } from "./_components/owner-skeleton";
import { OwnerWorkspace } from "./_components/owner-workspace";

export const metadata: Metadata = {
  title: "Owner Dashboard | G & A Aqua Vitae",
  description:
    "Station owner analytics: sales, gallons sold, unpaid balances, expenses, containers, and staff management",
};

async function OwnerPageContent() {
  await connection();
  const ctx = await getOwnerPageContext();

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
      <main className="flex min-h-screen items-center justify-center bg-[#EFEFF2] px-4">
        <div className="w-full max-w-md rounded-[28px] border border-[#E5E5EA] bg-white p-8 text-center shadow-[0_12px_40px_rgba(0,0,0,0.05)]">
          <span className="inline-block rounded-full bg-[#111111] px-3 py-1 text-xs font-semibold text-white">
            403 · ACCESS RESTRICTED
          </span>
          <h1 className="mt-4 text-xl font-bold text-[#111111]">
            Station Owner Access Only
          </h1>
          <p className="mt-2 text-sm text-[#71717A]">{ctx.reason}</p>
          <Link
            href={backHref}
            className="mt-6 inline-block rounded-full bg-[#111111] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-black/85"
          >
            Go Back
          </Link>
        </div>
      </main>
    );
  }

  const [initialSnapshot, initialStaff, initialAuditLedger] = await Promise.all(
    [
      getOwnerDashboardSnapshot(ctx.profile.id, 7),
      listManagedUsers(),
      queryOwnerAuditLedger(ctx.profile.id),
    ]
  );

  return (
    <OwnerWorkspace
      currentUser={{
        id: ctx.profile.id,
        email: ctx.profile.email,
        fullName: ctx.profile.full_name,
      }}
      initialSnapshot={initialSnapshot}
      initialStaff={initialStaff}
      initialAuditLedger={initialAuditLedger}
    />
  );
}

export default function OwnerPage() {
  return (
    <Suspense fallback={<OwnerSkeleton />}>
      <OwnerPageContent />
    </Suspense>
  );
}

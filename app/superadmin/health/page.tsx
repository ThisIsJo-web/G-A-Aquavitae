import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getSuperadminPageContext } from "@/backend/services/auth-guards";
import { getGroupedErrorLogs } from "@/backend/services/error-logs";
import { getSystemHealthSnapshot } from "@/backend/services/system-health";
import { listManagedUsers } from "@/backend/services/users";
import { HealthDashboard } from "./_components/health-dashboard";
import { HealthSkeleton } from "./_components/health-skeleton";

export const metadata: Metadata = {
  title: "System Health | AquaVitae Superadmin",
  description: "Superadmin-exclusive system health and error logs dashboard",
};

async function SuperadminHealthContent() {
  await connection();
  const ctx = await getSuperadminPageContext();

  if (ctx.status === "unauthenticated") {
    redirect("/login?next=/superadmin/health");
  }

  if (ctx.status === "forbidden") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#EFEFF2] px-4">
        <div className="w-full max-w-md rounded-[28px] border border-[#E5E5EA] bg-white p-8 text-center shadow-[0_12px_40px_rgba(0,0,0,0.05)]">
          <span className="inline-block rounded-full bg-[#111111] px-3 py-1 text-xs font-semibold text-white">
            403 · FORBIDDEN
          </span>
          <h1 className="mt-4 text-xl font-bold text-[#111111]">
            Superadmin Access Only
          </h1>
          <p className="mt-2 text-sm text-[#71717A]">
            Your account{ctx.email ? ` (${ctx.email})` : ""} has role{" "}
            <span className="font-semibold text-[#111111]">
              {ctx.role ?? "unknown"}
            </span>
            . This page is strictly restricted to Superadmin accounts.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-full bg-[#111111] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-black/85"
          >
            Back to Login
          </Link>
        </div>
      </main>
    );
  }

  const [initialHealth, initialLogs, initialUsers] = await Promise.all([
    getSystemHealthSnapshot(),
    getGroupedErrorLogs({ groupBy: "severity" }),
    listManagedUsers(),
  ]);

  return (
    <HealthDashboard
      currentUser={{
        id: ctx.profile.id,
        email: ctx.profile.email,
        fullName: ctx.profile.full_name,
      }}
      initialHealth={initialHealth}
      initialLogs={initialLogs}
      initialUsers={initialUsers}
    />
  );
}

export default function SuperadminHealthPage() {
  return (
    <Suspense fallback={<HealthSkeleton />}>
      <SuperadminHealthContent />
    </Suspense>
  );
}

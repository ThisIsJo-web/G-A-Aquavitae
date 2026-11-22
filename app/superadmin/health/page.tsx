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
  title: "System Health | G & A Aqua Vitae",
  description:
    "Superadmin system health, color-coded error logs, activity audit logs, and account management",
};

async function SuperadminHealthContent() {
  await connection();
  const ctx = await getSuperadminPageContext();

  if (ctx.status === "unauthenticated") {
    redirect("/login?next=/superadmin/health");
  }

  if (ctx.status === "forbidden") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--av-backdrop)] px-4">
        <div className="av-card w-full max-w-md p-8 text-center">
          <span className="inline-block rounded-full bg-[var(--av-accent)] px-3 py-1 text-xs font-semibold text-[var(--av-accent-ink)]">
            Access Restricted
          </span>
          <h1 className="mt-4 text-xl font-bold text-[var(--av-ink)]">
            Superadmin Access Only
          </h1>
          <p className="mt-2 text-sm text-[var(--av-muted)]">
            Your account{ctx.email ? ` (${ctx.email})` : ""} is signed in as{" "}
            <span className="font-semibold capitalize text-[var(--av-ink)]">
              {ctx.role ?? "guest"}
            </span>
            . Only Superadmin accounts can open this control panel.
          </p>
          <Link
            href="/login"
            className="av-btn-primary mt-6 inline-block px-5 py-2.5 text-sm"
          >
            Back to Sign In
          </Link>
        </div>
      </main>
    );
  }

  const [initialHealth, initialLogs, initialUsers] = await Promise.all([
    getSystemHealthSnapshot(),
    getGroupedErrorLogs({ groupBy: "severity" }),
    listManagedUsers(ctx.profile),
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

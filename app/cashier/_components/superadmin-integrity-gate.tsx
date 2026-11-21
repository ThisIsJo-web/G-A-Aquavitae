"use client";

import { ArrowLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  NoticeBanner,
  StatusChip,
} from "@/app/_components/ui/monochrome-controls";

interface AuditTargetOption {
  id: string;
  email: string;
  fullName: string | null;
  role: "owner" | "cashier";
}

interface SuperadminIntegrityGateProps {
  superadminEmail: string;
  initialHasVerifiedTotp: boolean;
  initialFactorId: string | null;
  targets: AuditTargetOption[];
}

const REASON_PRESETS = [
  "Daily sales tally check",
  "Delivery audit",
  "Gallon inventory check",
  "Cashier support",
];

export function SuperadminIntegrityGate({
  superadminEmail,
  initialHasVerifiedTotp,
  initialFactorId,
  targets,
}: SuperadminIntegrityGateProps) {
  const router = useRouter();
  const [hasVerifiedTotp] = useState(initialHasVerifiedTotp);
  const [factorId, setFactorId] = useState<string | null>(initialFactorId);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false);

  const [targetAccountId, setTargetAccountId] = useState(targets[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cashiers = targets.filter((t) => t.role === "cashier");
  const owners = targets.filter((t) => t.role === "owner");

  async function handleEnrollTotp() {
    setEnrolling(true);
    setError(null);
    try {
      const res = await fetch("/api/superadmin/elevation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enroll" }),
      });
      const data = (await res.json()) as {
        enrollment?: { factorId: string; qrCode: string; secret: string };
        error?: string;
      };

      if (!res.ok || !data.enrollment) {
        setError(data.error ?? "Failed to initialize authenticator setup");
        return;
      }

      setFactorId(data.enrollment.factorId);
      setQrCode(data.enrollment.qrCode);
      setSecret(data.enrollment.secret);
    } catch {
      setError("Network error while initializing authenticator setup");
    } finally {
      setEnrolling(false);
    }
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!factorId) {
      setError("Set up your Authenticator App first to get a 6-digit code.");
      return;
    }

    if (reason.trim().length < 3) {
      setError("Please enter a short audit reason (at least 3 characters).");
      return;
    }

    setVerifying(true);
    try {
      const res = await fetch("/api/superadmin/elevation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify",
          password,
          totpCode,
          factorId,
          targetAccountId,
          reason: reason.trim(),
        }),
      });
      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        setError(data.error ?? "2-step verification failed");
        return;
      }

      router.refresh();
    } catch {
      setError("Network error during 2-step verification");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#EFEFF2] px-4 py-10">
      <div className="w-full max-w-lg rounded-[28px] border border-[#E5E5EA] bg-white p-8 shadow-[0_12px_40px_rgba(0,0,0,0.05)]">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#111111] px-3 py-1 text-xs font-semibold text-white">
            <ShieldCheck className="h-3.5 w-3.5" />
            2-Step Verification
          </span>
          <Link
            href="/superadmin/health"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#71717A] hover:text-[#111111]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            System Health
          </Link>
        </div>

        <h1 className="mt-5 text-2xl font-bold tracking-tight text-[#111111]">
          Audited Cashier Access
        </h1>
        <p className="mt-1.5 text-sm font-normal text-[#71717A]">
          Direct Cashier access is limited to{" "}
          <strong className="font-semibold text-[#111111]">Cashier</strong> and{" "}
          <strong className="font-semibold text-[#111111]">Owner</strong> roles.
          As Superadmin ({superadminEmail}), complete both steps below for a
          15-minute audited session.
        </p>

        {targets.length === 0 ? (
          <div className="mt-6 rounded-2xl bg-[#F7F7F9] p-5 text-sm text-[#52525B]">
            <p className="font-semibold text-[#111111]">
              No active Cashier or Owner accounts found
            </p>
            <p className="mt-1 text-xs">
              Create a Cashier or Owner account from{" "}
              <Link
                href="/superadmin/health"
                className="font-semibold text-[#111111] underline"
              >
                Superadmin → Accounts &amp; Roles
              </Link>{" "}
              first.
            </p>
          </div>
        ) : (
          <form onSubmit={handleVerify} className="mt-6 space-y-5">
            {/* Step 1 */}
            <div className="space-y-4 rounded-2xl bg-[#F7F7F9] p-5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#71717A]">
                Step 1 · Select Account, Reason &amp; Password
              </div>

              <div>
                <label
                  htmlFor="gate-target"
                  className="mb-1.5 block text-xs font-semibold text-[#111111]"
                >
                  Target Cashier or Owner Account
                </label>
                <select
                  id="gate-target"
                  value={targetAccountId}
                  onChange={(e) => setTargetAccountId(e.target.value)}
                  required
                  className="w-full rounded-2xl border border-[#E4E4E7] bg-white px-4 py-2.5 text-sm font-medium text-[#111111] focus:border-[#111111] focus:outline-none"
                >
                  {cashiers.length > 0 && (
                    <optgroup label="Cashier Accounts">
                      {cashiers.map((c) => (
                        <option key={c.id} value={c.id}>
                          Cashier ·{" "}
                          {c.fullName ? `${c.fullName} (${c.email})` : c.email}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {owners.length > 0 && (
                    <optgroup label="Owner Stations">
                      {owners.map((o) => (
                        <option key={o.id} value={o.id}>
                          Owner ·{" "}
                          {o.fullName ? `${o.fullName} (${o.email})` : o.email}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              <div>
                <label
                  htmlFor="gate-reason"
                  className="mb-1.5 block text-xs font-semibold text-[#111111]"
                >
                  Audit Reason
                </label>
                <textarea
                  id="gate-reason"
                  name="audit_reason"
                  rows={2}
                  required
                  autoComplete="off"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why are you accessing the Cashier station?"
                  className="w-full resize-none rounded-2xl border border-[#E4E4E7] bg-white px-4 py-2.5 text-sm text-[#111111] placeholder:text-[#A1A1AA] focus:border-[#111111] focus:outline-none"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {REASON_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setReason(preset)}
                      className="rounded-full border border-[#E4E4E7] bg-white px-3 py-1 text-[11px] font-semibold text-[#52525B] transition hover:border-[#111111] hover:bg-[#111111] hover:text-white"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <input
                type="email"
                name="username"
                autoComplete="username"
                value={superadminEmail}
                readOnly
                tabIndex={-1}
                aria-hidden="true"
                className="sr-only"
              />

              <div>
                <label
                  htmlFor="gate-password"
                  className="mb-1.5 block text-xs font-semibold text-[#111111]"
                >
                  Superadmin Password
                </label>
                <input
                  id="gate-password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  className="w-full rounded-2xl border border-[#E4E4E7] bg-white px-4 py-2.5 text-sm text-[#111111] placeholder:text-[#A1A1AA] focus:border-[#111111] focus:outline-none"
                />
              </div>
            </div>

            {/* Step 2 */}
            <div className="space-y-4 rounded-2xl bg-[#F7F7F9] p-5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#71717A]">
                  Step 2 · Authenticator Code (6 Digits)
                </span>
                {hasVerifiedTotp && <StatusChip label="2FA Linked" tone="solid" />}
              </div>

              {!hasVerifiedTotp && !qrCode && (
                <div className="space-y-3 text-xs text-[#52525B]">
                  <p>
                    Link your Authenticator App (Google Authenticator, Authy, or
                    Microsoft Authenticator) to generate a 6-digit code.
                  </p>
                  <button
                    type="button"
                    onClick={handleEnrollTotp}
                    disabled={enrolling}
                    className="rounded-full border border-[#D4D4D8] bg-white px-4 py-2 text-xs font-semibold text-[#111111] transition hover:bg-[#F4F4F6] disabled:opacity-50"
                  >
                    {enrolling
                      ? "Generating QR..."
                      : "Set Up Authenticator App"}
                  </button>
                </div>
              )}

              {qrCode && (
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-[#E8E8EC] bg-white p-4 text-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrCode}
                    alt="Scan with Authenticator App"
                    className="h-40 w-40"
                  />
                  <p className="text-[11px] text-[#71717A]">
                    Scan with your Authenticator App or copy the manual key:
                  </p>
                  <code className="select-all rounded-full bg-[#F4F4F6] px-3 py-1 font-mono text-xs text-[#111111]">
                    {secret}
                  </code>
                </div>
              )}

              <div>
                <label
                  htmlFor="gate-totp"
                  className="mb-1.5 block text-xs font-semibold text-[#111111]"
                >
                  6-Digit Code
                </label>
                <input
                  id="gate-totp"
                  name="one_time_code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9\s]{6,8}"
                  required
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="123456"
                  className="w-full rounded-2xl border border-[#E4E4E7] bg-white px-4 py-2.5 font-mono text-base tracking-widest text-[#111111] placeholder:tracking-normal placeholder:text-[#A1A1AA] focus:border-[#111111] focus:outline-none"
                />
              </div>
            </div>

            {error && (
              <NoticeBanner
                tone="error"
                message={error}
                onDismiss={() => setError(null)}
              />
            )}

            <button
              type="submit"
              disabled={verifying || !factorId}
              className="w-full rounded-full bg-[#111111] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {verifying
                ? "Verifying..."
                : "Verify & Start 15-Min Audited Session"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

"use client";

import { Eye, EyeOff, Lock, ShieldCheck, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { NoticeBanner, StatusChip } from "@/app/_components/ui/monochrome-controls";

interface OwnerAccountSecurityModalProps {
  currentName: string | null;
  currentEmail: string;
  mandatory: boolean;
  isSecured: boolean;
  onClose?: () => void;
  onUpdated: (next: { email: string; fullName: string | null }) => void;
}

export function OwnerAccountSecurityModal({
  currentName,
  currentEmail,
  mandatory,
  isSecured,
  onClose,
  onUpdated,
}: OwnerAccountSecurityModalProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmedName = fullName.trim();
    const targetEmail = newEmail.trim().toLowerCase();

    if (trimmedName && trimmedName.length < 2) {
      setError("Full name must be at least 2 characters.");
      return;
    }

    if (mandatory) {
      if (trimmedName.length < 2) {
        setError("Please enter your full name.");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
        setError("Please enter a valid personal Email or Gmail address.");
        return;
      }
      if (targetEmail === currentEmail.trim().toLowerCase()) {
        setError(
          "Please enter your personal Email / Gmail instead of the temporary email."
        );
        return;
      }
      if (newPassword.length < 6) {
        setError("New password must be at least 6 characters long.");
        return;
      }
      if (newPassword !== confirmPassword) {
        setError("New passwords do not match.");
        return;
      }
    } else {
      if (!currentPassword) {
        setError("Enter your current password to confirm this change.");
        return;
      }
      if (!trimmedName && !targetEmail && !newPassword) {
        setError("Enter a new name, email, or password to update.");
        return;
      }
      if (targetEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
        setError("Please enter a valid Email or Gmail address.");
        return;
      }
      if (newPassword) {
        if (newPassword.length < 6) {
          setError("New password must be at least 6 characters long.");
          return;
        }
        if (newPassword !== confirmPassword) {
          setError("New passwords do not match.");
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/owner/account-security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: trimmedName || undefined,
          newEmail: targetEmail || undefined,
          newPassword: newPassword || undefined,
          currentPassword: mandatory ? undefined : currentPassword,
        }),
      });

      const payload = (await response.json()) as {
        email?: string;
        fullName?: string | null;
        error?: string;
      };

      if (!response.ok || !payload.email) {
        setError(payload.error ?? "Unable to update account settings.");
        return;
      }

      onUpdated({
        email: payload.email,
        fullName: payload.fullName ?? currentName,
      });
    } catch {
      setError("Connection error while updating your account.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="owner-security-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
    >
      <div className="av-card max-h-[92vh] w-full max-w-md overflow-y-auto p-0 shadow-[0_24px_60px_rgba(0,0,0,0.32)]">
        <div aria-hidden="true" className="av-top-accent" />
        <div className="p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--av-blue-soft)] text-[var(--av-blue-ink)] ring-1 ring-[var(--av-blue-border)]">
                {mandatory ? (
                  <Lock className="h-5 w-5" />
                ) : (
                  <ShieldCheck className="h-5 w-5" />
                )}
              </span>
              <div className="min-w-0">
                <h2
                  id="owner-security-title"
                  className="text-base font-bold text-[var(--av-ink)]"
                >
                  {mandatory
                    ? "Secure Your Account First"
                    : "Account Profile & Security"}
                </h2>
                <p className="truncate text-xs text-[var(--av-muted)]">
                  {mandatory
                    ? "Set your name, personal Gmail, and private password."
                    : `${currentName || "Station Owner"} · ${currentEmail}`}
                </p>
              </div>
            </div>

            {!mandatory && onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--av-surface-subtle)] text-[var(--av-ink)] transition hover:bg-[var(--av-surface-hover)]"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between gap-2 rounded-2xl bg-[var(--av-surface-subtle)] px-3.5 py-2.5 text-[11px] text-[var(--av-ink-secondary)]">
            <span>
              {mandatory
                ? "Once updated, Superadmin can no longer access or edit your account."
                : isSecured
                  ? "Your account is private and protected from Superadmin access."
                  : "Update your credentials to lock out Superadmin access."}
            </span>
            {isSecured && <StatusChip label="Secured" tone="green" dot />}
          </div>

          <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
            {!mandatory && (
              <div>
                <label
                  htmlFor="owner-current-password"
                  className="mb-1 block text-xs font-semibold text-[var(--av-ink)]"
                >
                  Current Password
                </label>
                <input
                  id="owner-current-password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter your current password to confirm"
                  className="av-input w-full rounded-2xl px-3.5 py-2.5 text-sm"
                />
              </div>
            )}

            <div>
              <label
                htmlFor="owner-full-name"
                className="mb-1 block text-xs font-semibold text-[var(--av-ink)]"
              >
                {mandatory ? "Your Full Name" : "New Full Name (Optional)"}
              </label>
              <input
                id="owner-full-name"
                type="text"
                required={mandatory}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={
                  currentName
                    ? `Current: ${currentName}`
                    : "e.g. Maria Santos"
                }
                className="av-input w-full rounded-2xl px-3.5 py-2.5 text-sm"
              />
            </div>

            <div>
              <label
                htmlFor="owner-new-email"
                className="mb-1 block text-xs font-semibold text-[var(--av-ink)]"
              >
                {mandatory
                  ? "Your Personal Email / Gmail"
                  : "New Email / Gmail (Optional)"}
              </label>
              <input
                id="owner-new-email"
                type="email"
                required={mandatory}
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder={
                  mandatory
                    ? "e.g. yourname@gmail.com"
                    : `Current: ${currentEmail}`
                }
                className="av-input w-full rounded-2xl px-3.5 py-2.5 text-sm"
              />
            </div>

            <div>
              <label
                htmlFor="owner-new-password"
                className="mb-1 block text-xs font-semibold text-[var(--av-ink)]"
              >
                {mandatory ? "New Password" : "New Password (Optional)"}
              </label>
              <div className="relative">
                <input
                  id="owner-new-password"
                  type={showPassword ? "text" : "password"}
                  required={mandatory}
                  minLength={newPassword ? 6 : undefined}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={
                    mandatory
                      ? "Minimum 6 characters"
                      : "Leave blank to keep current password"
                  }
                  className="av-input w-full rounded-2xl px-3.5 py-2.5 pr-11 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-2.5 my-auto flex h-8 w-8 items-center justify-center rounded-full text-[var(--av-muted)] hover:bg-[var(--av-surface-hover)] hover:text-[var(--av-ink)]"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {(mandatory || newPassword.length > 0) && (
              <div>
                <label
                  htmlFor="owner-confirm-password"
                  className="mb-1 block text-xs font-semibold text-[var(--av-ink)]"
                >
                  Confirm New Password
                </label>
                <input
                  id="owner-confirm-password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="av-input w-full rounded-2xl px-3.5 py-2.5 text-sm"
                />
              </div>
            )}

            {error && (
              <NoticeBanner
                tone="error"
                message={error}
                onDismiss={() => setError(null)}
              />
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              {!mandatory && onClose && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={onClose}
                  className="av-btn-outline rounded-full px-4 py-2.5 text-xs font-semibold"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={submitting}
                className={`av-btn-primary rounded-full px-5 py-2.5 text-xs font-semibold transition disabled:opacity-50 ${
                  mandatory ? "w-full py-3 text-sm" : ""
                }`}
              >
                {submitting
                  ? "Saving..."
                  : mandatory
                    ? "Save & Secure Account"
                    : "Save Account Changes"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

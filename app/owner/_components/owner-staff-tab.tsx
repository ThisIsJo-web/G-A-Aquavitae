"use client";

import { Eye, EyeOff, UserPlus, Users } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  EmptyState,
  NoticeBanner,
  RowActionMenu,
  StatusChip,
} from "@/app/_components/ui/monochrome-controls";
import type { OwnerStaffProfileDTO } from "./types";

interface OwnerStaffTabProps {
  staff: OwnerStaffProfileDTO[];
  stationOwnerId: string;
  isSuperadmin: boolean;
  onStaffChange: (nextStaff: OwnerStaffProfileDTO[]) => void;
}

export function OwnerStaffTab({
  staff,
  stationOwnerId,
  isSuperadmin,
  onStaffChange,
}: OwnerStaffTabProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"cashier" | "staff">("cashier");
  const [showPassword, setShowPassword] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "error" | "success";
    message: string;
  } | null>(null);

  async function refreshStaff() {
    const qs = isSuperadmin
      ? `?station=${encodeURIComponent(stationOwnerId)}`
      : "";
    const res = await fetch(`/api/users${qs}`, { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { users?: OwnerStaffProfileDTO[] };
      if (data.users) onStaffChange(data.users);
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setCreating(true);

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim() || undefined,
          email: email.trim(),
          password,
          role,
          ownerId: isSuperadmin ? stationOwnerId : undefined,
        }),
      });
      const payload = (await res.json()) as {
        user?: OwnerStaffProfileDTO;
        error?: string;
      };

      if (!res.ok) {
        setFeedback({
          tone: "error",
          message: payload.error ?? "Failed to create staff account.",
        });
        return;
      }

      setFullName("");
      setEmail("");
      setPassword("");
      setFeedback({
        tone: "success",
        message: `Account created for ${payload.user?.email ?? "staff member"}.`,
      });
      await refreshStaff();
    } catch {
      setFeedback({ tone: "error", message: "Connection error." });
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdateStaff(
    member: OwnerStaffProfileDTO,
    patch: {
      isActive?: boolean;
      role?: "cashier" | "staff";
    }
  ) {
    setFeedback(null);
    setBusyId(member.id);
    try {
      const res = await fetch(`/api/users/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const payload = (await res.json()) as {
        user?: OwnerStaffProfileDTO;
        error?: string;
      };
      if (!res.ok) {
        setFeedback({
          tone: "error",
          message: payload.error ?? "Failed to update account.",
        });
        return;
      }

      await refreshStaff();
      setFeedback({
        tone: "success",
        message: `Updated ${member.full_name || member.email}.`,
      });
    } catch {
      setFeedback({ tone: "error", message: "Connection error." });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {feedback && (
        <NoticeBanner
          tone={feedback.tone}
          message={feedback.message}
          onDismiss={() => setFeedback(null)}
        />
      )}

      {/* Create Staff Form */}
      <form onSubmit={handleCreate} className="av-card space-y-4 p-6">
        <div>
          <h2 className="text-base font-bold tracking-tight text-[var(--av-ink)]">
            Add Station Staff Account
          </h2>
          <p className="mt-0.5 text-xs text-[var(--av-muted)]">
            Create logins for your cashiers and station helpers. You can also
            open{" "}
            <span className="font-semibold text-[var(--av-ink)]">
              Cashier Station
            </span>{" "}
            directly anytime from the sidebar using your Owner account.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label
              htmlFor="staff-name"
              className="mb-1.5 block text-xs font-semibold text-[var(--av-ink)]"
            >
              Full Name
            </label>
            <input
              id="staff-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Maria Santos"
              className="av-input w-full rounded-2xl px-3.5 py-2.5 text-xs font-medium"
            />
          </div>

          <div>
            <label
              htmlFor="staff-email"
              className="mb-1.5 block text-xs font-semibold text-[var(--av-ink)]"
            >
              Email Address
            </label>
            <input
              id="staff-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="cashier@aquavitae.ph"
              className="av-input w-full rounded-2xl px-3.5 py-2.5 text-xs font-medium"
            />
          </div>

          <div>
            <label
              htmlFor="staff-password"
              className="mb-1.5 block text-xs font-semibold text-[var(--av-ink)]"
            >
              Password (min 6 chars)
            </label>
            <div className="relative">
              <input
                id="staff-password"
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Set password"
                className="av-input w-full rounded-2xl px-3.5 py-2.5 pr-10 text-xs font-medium"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-2 my-auto flex h-7 w-7 items-center justify-center rounded-full text-[var(--av-muted)] hover:bg-[var(--av-surface-hover)] hover:text-[var(--av-ink)]"
              >
                {showPassword ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="staff-role"
              className="mb-1.5 block text-xs font-semibold text-[var(--av-ink)]"
            >
              Role
            </label>
            <select
              id="staff-role"
              value={role}
              onChange={(e) => setRole(e.target.value as "cashier" | "staff")}
              className="av-input w-full rounded-2xl px-3.5 py-2.5 text-xs font-semibold"
            >
              <option value="cashier">Cashier (POS &amp; Operations)</option>
              <option value="staff">Staff</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end border-t border-[var(--av-border)] pt-4">
          <button
            type="submit"
            disabled={creating}
            className="av-btn-primary inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-semibold transition disabled:opacity-50"
          >
            <UserPlus className="h-4 w-4" />
            {creating ? "Creating..." : "Create Staff Account"}
          </button>
        </div>
      </form>

      {/* Team Directory Table */}
      <section className="av-card p-6">
        <div className="mb-4">
          <h2 className="text-base font-bold tracking-tight text-[var(--av-ink)]">
            Station Staff ({staff.length})
          </h2>
          <p className="text-xs text-[var(--av-muted)]">
            Manage Cashier and Staff accounts assigned to this station
          </p>
        </div>

        {staff.length === 0 ? (
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title="No staff accounts yet"
            description="Create a Cashier account above for your counter staff."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-y-2 text-left text-xs">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-[var(--av-muted)]">
                  <th className="px-4 py-2">Name &amp; Email</th>
                  <th className="px-4 py-2">Role</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Added</th>
                  <th className="w-12 px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((member) => {
                  const actions = [
                    {
                      label:
                        member.role === "cashier"
                          ? "Change to Staff"
                          : "Promote to Cashier",
                      disabled: busyId === member.id,
                      onClick: () =>
                        void handleUpdateStaff(member, {
                          role: member.role === "cashier" ? "staff" : "cashier",
                        }),
                    },
                    {
                      label: member.is_active
                        ? "Deactivate Account"
                        : "Reactivate Account",
                      disabled: busyId === member.id,
                      emphasis: member.is_active
                        ? ("muted" as const)
                        : ("default" as const),
                      onClick: () =>
                        void handleUpdateStaff(member, {
                          isActive: !member.is_active,
                        }),
                    },
                  ];

                  return (
                    <tr
                      key={member.id}
                      className="bg-[var(--av-surface-subtle)] font-medium text-[var(--av-ink)] transition hover:bg-[var(--av-surface-hover)]"
                    >
                      <td className="rounded-l-2xl px-4 py-3.5">
                        <div className="font-semibold text-[var(--av-ink)]">
                          {member.full_name || "Unnamed Staff"}
                        </div>
                        <div className="text-[11px] font-normal text-[var(--av-muted)]">
                          {member.email}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusChip
                          label={member.role === "cashier" ? "Cashier" : "Staff"}
                          tone="outline"
                        />
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusChip
                          label={member.is_active ? "Active" : "Inactive"}
                          tone={member.is_active ? "green" : "outline"}
                          dot
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 tabular-nums text-[var(--av-ink-secondary)]">
                        {new Date(member.created_at).toLocaleDateString()}
                      </td>
                      <td className="rounded-r-2xl px-4 py-3.5 text-right">
                        <RowActionMenu actions={actions} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

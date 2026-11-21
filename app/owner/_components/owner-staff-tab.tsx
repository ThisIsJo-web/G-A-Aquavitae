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
  onStaffChange: (nextStaff: OwnerStaffProfileDTO[]) => void;
}

export function OwnerStaffTab({ staff, onStaffChange }: OwnerStaffTabProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"cashier" | "staff">("cashier");
  const [isOwnerCashier, setIsOwnerCashier] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "error" | "success";
    message: string;
  } | null>(null);

  async function refreshStaff() {
    const res = await fetch("/api/users", { cache: "no-store" });
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
          isOwnerCashier: role === "cashier" ? isOwnerCashier : false,
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
      setIsOwnerCashier(false);
      setFeedback({
        tone: "success",
        message:
          role === "cashier" && isOwnerCashier
            ? `Created ${payload.user?.email ?? "cashier account"} and marked as "My Account". "Go to Cashier Dashboard" is now available in your sidebar.`
            : `Account created for ${payload.user?.email ?? "staff member"}.`,
      });
      await refreshStaff();
    } catch {
      setFeedback({ tone: "error", message: "Network error." });
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdateStaff(
    member: OwnerStaffProfileDTO,
    patch: {
      isActive?: boolean;
      role?: "cashier" | "staff";
      isOwnerCashier?: boolean;
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

      if (patch.isOwnerCashier === true) {
        setFeedback({
          tone: "success",
          message: `${member.full_name || member.email} marked as "My Account". "Go to Cashier Dashboard" is now unlocked in the sidebar.`,
        });
      } else if (patch.isOwnerCashier === false) {
        setFeedback({
          tone: "success",
          message: `Removed "My Account" mark from ${member.full_name || member.email}.`,
        });
      } else {
        setFeedback({
          tone: "success",
          message: `Updated ${member.full_name || member.email}.`,
        });
      }
    } catch {
      setFeedback({ tone: "error", message: "Network error." });
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
          <h2 className="text-base font-bold tracking-tight text-[#111111]">
            Add Station Staff Account
          </h2>
          <p className="mt-0.5 text-xs text-[#71717A]">
            Owners cannot operate the Cashier page directly. If you also work
            the counter, create a Cashier account below and mark it as{" "}
            <span className="font-semibold text-[#111111]">My Account</span> to
            unlock <span className="font-semibold text-[#111111]">Go to Cashier Dashboard</span>.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label
              htmlFor="staff-name"
              className="mb-1.5 block text-xs font-semibold text-[#111111]"
            >
              Full Name
            </label>
            <input
              id="staff-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Maria Santos"
              className="w-full rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-3.5 py-2.5 text-xs font-medium text-[#111111] placeholder:text-[#A1A1AA] focus:border-[#111111] focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="staff-email"
              className="mb-1.5 block text-xs font-semibold text-[#111111]"
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
              className="w-full rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-3.5 py-2.5 text-xs font-medium text-[#111111] placeholder:text-[#A1A1AA] focus:border-[#111111] focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="staff-password"
              className="mb-1.5 block text-xs font-semibold text-[#111111]"
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
                className="w-full rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-3.5 py-2.5 pr-10 text-xs font-medium text-[#111111] placeholder:text-[#A1A1AA] focus:border-[#111111] focus:bg-white focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-2 my-auto flex h-7 w-7 items-center justify-center rounded-full text-[#71717A] hover:bg-[#EFEFF2] hover:text-[#111111]"
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
              className="mb-1.5 block text-xs font-semibold text-[#111111]"
            >
              Role
            </label>
            <select
              id="staff-role"
              value={role}
              onChange={(e) => {
                const nextRole = e.target.value as "cashier" | "staff";
                setRole(nextRole);
                if (nextRole !== "cashier") setIsOwnerCashier(false);
              }}
              className="w-full rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-3.5 py-2.5 text-xs font-semibold text-[#111111] focus:border-[#111111] focus:bg-white focus:outline-none"
            >
              <option value="cashier">Cashier (POS &amp; Operations)</option>
              <option value="staff">Staff</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#ECECEF] pt-4">
          {role === "cashier" ? (
            <label className="inline-flex cursor-pointer items-center gap-2.5 rounded-2xl bg-[#F8F8FA] px-4 py-2.5 text-xs font-semibold text-[#111111] ring-1 ring-[#E4E4E7]">
              <input
                type="checkbox"
                checked={isOwnerCashier}
                onChange={(e) => setIsOwnerCashier(e.target.checked)}
                className="h-4 w-4 rounded border-[#D4D4D8] accent-[#111111]"
              />
              <span>
                Mark as &ldquo;My Account&rdquo;{" "}
                <span className="font-normal text-[#71717A]">
                  (Shows &ldquo;Go to Cashier Dashboard&rdquo; in sidebar)
                </span>
              </span>
            </label>
          ) : (
            <span className="text-xs text-[#71717A]">
              Only Cashier accounts can be marked as &ldquo;My Account&rdquo;.
            </span>
          )}

          <button
            type="submit"
            disabled={creating}
            className="inline-flex items-center gap-2 rounded-full bg-[#111111] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-black/85 disabled:opacity-50"
          >
            <UserPlus className="h-4 w-4" />
            {creating ? "Creating..." : "Create Staff Account"}
          </button>
        </div>
      </form>

      {/* Team Directory Table */}
      <section className="av-card p-6">
        <div className="mb-4">
          <h2 className="text-base font-bold tracking-tight text-[#111111]">
            Station Staff ({staff.length})
          </h2>
          <p className="text-xs text-[#71717A]">
            Manage Cashier and Staff logins — mark your own Cashier login as{" "}
            <span className="font-semibold text-[#111111]">My Account</span> to
            show the Cashier shortcut
          </p>
        </div>

        {staff.length === 0 ? (
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title="No staff accounts yet"
            description="Create a Cashier account above so your counter staff (or your own Cashier login) can record daily sales and deliveries."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-y-2 text-left text-xs">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-[#71717A]">
                  <th className="px-4 py-2">Name &amp; Email</th>
                  <th className="px-4 py-2">Role</th>
                  <th className="px-4 py-2">Owner Tag</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Added</th>
                  <th className="w-12 px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((member) => {
                  const isMarked = Boolean(member.is_owner_cashier);
                  const actions = [
                    ...(member.role === "cashier"
                      ? [
                          {
                            label: isMarked
                              ? 'Unmark "My Account"'
                              : 'Mark as "My Account"',
                            disabled: busyId === member.id,
                            onClick: () =>
                              void handleUpdateStaff(member, {
                                isOwnerCashier: !isMarked,
                              }),
                          },
                        ]
                      : []),
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
                      className="bg-[#F8F8FA] font-medium text-[#111111] transition hover:bg-[#EFEFF2]"
                    >
                      <td className="rounded-l-2xl px-4 py-3.5">
                        <div className="font-semibold text-[#111111]">
                          {member.full_name || "Unnamed Staff"}
                        </div>
                        <div className="text-[11px] font-normal text-[#71717A]">
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
                        {isMarked ? (
                          <StatusChip label="My Account" tone="solid" dot />
                        ) : (
                          <span className="text-[#A1A1AA]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusChip
                          label={member.is_active ? "Active" : "Inactive"}
                          tone={member.is_active ? "soft" : "solid"}
                          dot
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 tabular-nums text-[#52525B]">
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

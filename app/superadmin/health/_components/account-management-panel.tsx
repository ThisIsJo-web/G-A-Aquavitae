"use client";

import { Eye, EyeOff, KeyRound, UserPlus, Users } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  EmptyState,
  NoticeBanner,
  RowActionMenu,
  StatusChip,
} from "@/app/_components/ui/monochrome-controls";
import type { ManagedUserDTO, UserRole } from "./types";

interface AccountManagementPanelProps {
  currentUserId: string;
  users: ManagedUserDTO[];
  onUsersChanged: () => Promise<void> | void;
}

const ROLE_OPTIONS: { value: UserRole; label: string; hint: string }[] = [
  {
    value: "owner",
    label: "Owner",
    hint: "Manages their station and creates cashier/staff accounts",
  },
  {
    value: "cashier",
    label: "Cashier",
    hint: "Operates Walk-in POS, Deliveries, Vendo, Inventory & Closing Shift",
  },
  {
    value: "staff",
    label: "Staff",
    hint: "General station staff scoped to an owner",
  },
  {
    value: "superadmin",
    label: "Superadmin",
    hint: "System health, error logs, and global account management",
  },
];

function generateStrongPassword(): string {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*";
  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export function AccountManagementPanel({
  currentUserId,
  users,
  onUsersChanged,
}: AccountManagementPanelProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<UserRole>("owner");
  const [ownerId, setOwnerId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [tableError, setTableError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const owners = users.filter((u) => u.role === "owner" && u.is_active);
  const isStaffRole = role === "cashier" || role === "staff";
  const resolvedCreateOwnerId =
    ownerId && owners.some((o) => o.id === ownerId)
      ? ownerId
      : (owners[0]?.id ?? "");

  function toggleRowSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim() || undefined,
          email: email.trim(),
          password,
          role,
          ownerId:
            isStaffRole && resolvedCreateOwnerId
              ? resolvedCreateOwnerId
              : undefined,
        }),
      });

      const data = (await response.json()) as {
        user?: ManagedUserDTO;
        error?: string;
      };

      if (!response.ok || !data.user) {
        setFormError(data.error ?? "Failed to create account");
        return;
      }

      setFormSuccess(
        `Created ${data.user.role} account for ${data.user.email}.`
      );
      setFullName("");
      setEmail("");
      setPassword("");
      setOwnerId("");
      await Promise.resolve(onUsersChanged());
    } catch {
      setFormError("Network error while creating account");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateUser(
    targetId: string,
    patch: { role?: UserRole; isActive?: boolean; ownerId?: string | null }
  ) {
    setUpdatingId(targetId);
    setTableError(null);
    try {
      const response = await fetch(`/api/users/${targetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setTableError(data.error ?? "Failed to update account");
        return;
      }

      await Promise.resolve(onUsersChanged());
    } catch {
      setTableError("Network error while updating account");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <section
      aria-label="Account Creation and Role Management"
      className="grid gap-6 lg:grid-cols-12"
    >
      {/* Create Account Card */}
      <div className="av-card p-6 lg:col-span-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F2F2F4] text-[#111111]">
            <UserPlus className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-bold text-[#111111]">
              Create Account
            </h2>
            <p className="text-xs font-normal text-[#71717A]">
              Provision an active account with an assigned role.
            </p>
          </div>
        </div>

        <form onSubmit={handleCreateAccount} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="account-fullname"
              className="mb-1.5 block text-xs font-semibold text-[#111111]"
            >
              Full Name
            </label>
            <input
              id="account-fullname"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Maria Santos"
              className="w-full rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-4 py-2.5 text-sm text-[#111111] placeholder:text-[#A1A1AA] focus:border-[#111111] focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="account-email"
              className="mb-1.5 block text-xs font-semibold text-[#111111]"
            >
              Email Address
            </label>
            <input
              id="account-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@aquavitae.ph"
              className="w-full rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-4 py-2.5 text-sm text-[#111111] placeholder:text-[#A1A1AA] focus:border-[#111111] focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label
                htmlFor="account-password"
                className="text-xs font-semibold text-[#111111]"
              >
                Temporary Password
              </label>
              <button
                type="button"
                onClick={() => {
                  setPassword(generateStrongPassword());
                  setShowPassword(true);
                }}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#52525B] underline decoration-[#D4D4D8] underline-offset-2 hover:text-[#111111]"
              >
                <KeyRound className="h-3 w-3" />
                Generate
              </button>
            </div>
            <div className="relative">
              <input
                id="account-password"
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-4 py-2.5 pr-11 text-sm text-[#111111] placeholder:text-[#A1A1AA] focus:border-[#111111] focus:bg-white focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-2.5 my-auto flex h-8 w-8 items-center justify-center rounded-full text-[#71717A] hover:bg-[#EFEFF2] hover:text-[#111111]"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="account-role"
              className="mb-1.5 block text-xs font-semibold text-[#111111]"
            >
              Assigned Role
            </label>
            <select
              id="account-role"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-4 py-2.5 text-sm font-medium text-[#111111] focus:border-[#111111] focus:bg-white focus:outline-none"
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[11px] text-[#71717A]">
              {ROLE_OPTIONS.find((opt) => opt.value === role)?.hint}
            </p>
          </div>

          {isStaffRole && (
            <div>
              <label
                htmlFor="account-owner"
                className="mb-1.5 block text-xs font-semibold text-[#111111]"
              >
                Assign to Owner Station
              </label>
              <select
                id="account-owner"
                value={resolvedCreateOwnerId}
                required={role === "cashier" && owners.length > 0}
                onChange={(e) => setOwnerId(e.target.value)}
                className="w-full rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-4 py-2.5 text-sm font-medium text-[#111111] focus:border-[#111111] focus:bg-white focus:outline-none"
              >
                {owners.length === 0 ? (
                  <option value="">No active owners yet</option>
                ) : (
                  owners.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {owner.full_name
                        ? `${owner.full_name} (${owner.email})`
                        : owner.email}
                    </option>
                  ))
                )}
              </select>
            </div>
          )}

          {formError && (
            <NoticeBanner
              tone="error"
              message={formError}
              onDismiss={() => setFormError(null)}
            />
          )}

          {formSuccess && (
            <NoticeBanner
              tone="success"
              message={formSuccess}
              onDismiss={() => setFormSuccess(null)}
            />
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-[#111111] px-5 py-3 text-sm font-semibold text-white transition hover:bg-black/85 disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create Account"}
          </button>
        </form>
      </div>

      {/* Registered Accounts Rounded-Row Table */}
      <div className="av-card p-6 lg:col-span-7">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#111111]">
              Registered Accounts ({users.length})
            </h2>
            <p className="text-xs font-normal text-[#71717A]">
              Manage assigned roles, owner station links, and active status.
            </p>
          </div>
          {selectedIds.size > 0 && (
            <StatusChip label={`${selectedIds.size} selected`} tone="solid" />
          )}
        </div>

        {tableError && (
          <div className="mt-4">
            <NoticeBanner
              tone="error"
              message={tableError}
              onDismiss={() => setTableError(null)}
            />
          </div>
        )}

        <div className="mt-5 overflow-x-auto">
          {users.length === 0 ? (
            <EmptyState
              icon={<Users className="h-4 w-4" />}
              title="No accounts found"
            />
          ) : (
            <table className="w-full border-separate border-spacing-y-2 text-left text-xs">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-[#71717A]">
                  <th className="w-8 pb-1 pl-3" />
                  <th className="px-3 pb-1">Account</th>
                  <th className="px-3 pb-1">Role</th>
                  <th className="px-3 pb-1">Owner Station</th>
                  <th className="px-3 pb-1">Status</th>
                  <th className="pb-1 pr-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const isSelf = user.id === currentUserId;
                  const isBusy = updatingId === user.id;

                  return (
                    <tr
                      key={user.id}
                      className="rounded-2xl bg-[#F7F7F9] font-medium transition hover:bg-[#F0F0F3]"
                    >
                      <td className="rounded-l-2xl py-3 pl-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(user.id)}
                          onChange={() => toggleRowSelect(user.id)}
                          aria-label={`Select ${user.email}`}
                          className="h-4 w-4 rounded border-[#D4D4D8] accent-[#111111]"
                        />
                      </td>

                      <td className="px-3 py-3">
                        <div className="font-semibold text-[#111111]">
                          {user.full_name || "Unnamed User"}
                          {isSelf && (
                            <span className="ml-1.5 rounded-full bg-[#111111] px-2 py-0.5 text-[10px] font-semibold text-white">
                              You
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-normal text-[#71717A]">
                          {user.email}
                        </div>
                      </td>

                      <td className="px-3 py-3">
                        {isSelf ? (
                          <StatusChip label={user.role} tone="solid" />
                        ) : (
                          <select
                            aria-label={`Role for ${user.email}`}
                            value={user.role}
                            disabled={isBusy}
                            onChange={(e) =>
                              handleUpdateUser(user.id, {
                                role: e.target.value as UserRole,
                              })
                            }
                            className="rounded-full border border-[#E4E4E7] bg-white px-3 py-1 text-xs font-semibold capitalize text-[#111111] focus:border-[#111111] focus:outline-none disabled:opacity-40"
                          >
                            {ROLE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>

                      <td className="px-3 py-3">
                        {user.role === "cashier" || user.role === "staff" ? (
                          <select
                            aria-label={`Owner station for ${user.email}`}
                            value={user.owner_id ?? ""}
                            disabled={isBusy}
                            onChange={(e) =>
                              handleUpdateUser(user.id, {
                                ownerId: e.target.value || null,
                              })
                            }
                            className={`rounded-full border px-3 py-1 text-xs font-semibold focus:border-[#111111] focus:outline-none disabled:opacity-40 ${
                              !user.owner_id
                                ? "border-[#111111] bg-white text-[#111111]"
                                : "border-[#E4E4E7] bg-white text-[#52525B]"
                            }`}
                          >
                            <option value="">Unassigned</option>
                            {owners.map((owner) => (
                              <option key={owner.id} value={owner.id}>
                                {owner.full_name || owner.email}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-[#A1A1AA]">—</span>
                        )}
                      </td>

                      <td className="px-3 py-3">
                        <StatusChip
                          label={user.is_active ? "Active" : "Inactive"}
                          tone={user.is_active ? "soft" : "outline"}
                          dot
                        />
                      </td>

                      <td className="rounded-r-2xl py-3 pr-3 text-right">
                        {isSelf ? (
                          <span className="text-[11px] text-[#A1A1AA]">
                            Protected
                          </span>
                        ) : (
                          <RowActionMenu
                            ariaLabel={`Actions for ${user.email}`}
                            actions={[
                              {
                                label: user.is_active
                                  ? "Deactivate Account"
                                  : "Activate Account",
                                disabled: isBusy,
                                onClick: () =>
                                  void handleUpdateUser(user.id, {
                                    isActive: !user.is_active,
                                  }),
                              },
                            ]}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}

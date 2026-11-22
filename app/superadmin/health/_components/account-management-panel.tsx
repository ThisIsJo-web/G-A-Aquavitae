"use client";

import { Eye, EyeOff, KeyRound, UserPlus, Users } from "lucide-react";
import { useState, type FormEvent } from "react";
import { trackAction } from "@/app/_components/activity-tracker";
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
    hint: "Full station dashboard, inventory, staff management, and direct cashier access",
  },
  {
    value: "cashier",
    label: "Cashier",
    hint: "Operates Walk-in Sales, Deliveries, Vendo Income, and Closing Shift",
  },
  {
    value: "staff",
    label: "Staff",
    hint: "General station staff linked to an owner",
  },
  {
    value: "superadmin",
    label: "Superadmin",
    hint: "Full system oversight, audit logs, accounts, plus direct Owner and Cashier access",
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
        setFormError(data.error ?? "Unable to create account.");
        return;
      }

      trackAction({
        module: "accounts",
        action: `Created ${data.user.role} account`,
        controlLabel: "Create Account",
        targetLabel: data.user.email,
      });

      setFormSuccess(
        `Created ${data.user.role} account for ${data.user.email}.`
      );
      setFullName("");
      setEmail("");
      setPassword("");
      setOwnerId("");
      await Promise.resolve(onUsersChanged());
    } catch {
      setFormError("Connection problem while creating account.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateUser(
    targetId: string,
    targetEmail: string,
    patch: { role?: UserRole; isActive?: boolean; ownerId?: string | null }
  ) {
    setUpdatingId(targetId);
    setTableError(null);
    trackAction({
      module: "accounts",
      action:
        patch.role !== undefined
          ? `Changed account role to ${patch.role}`
          : patch.isActive !== undefined
            ? patch.isActive
              ? "Activated account"
              : "Deactivated account"
            : "Updated station assignment",
      controlLabel:
        patch.role !== undefined
          ? "Role Selector"
          : patch.isActive !== undefined
            ? patch.isActive
              ? "Activate Account"
              : "Deactivate Account"
            : "Owner Station Selector",
      targetLabel: targetEmail,
    });
    try {
      const response = await fetch(`/api/users/${targetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setTableError(data.error ?? "Unable to update account.");
        return;
      }

      await Promise.resolve(onUsersChanged());
    } catch {
      setTableError("Connection problem while updating account.");
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
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--av-surface-subtle)] text-[var(--av-ink)]">
            <UserPlus className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-bold text-[var(--av-ink)]">
              Create Account
            </h2>
            <p className="text-xs font-normal text-[var(--av-muted)]">
              Add a new user account with an assigned role.
            </p>
          </div>
        </div>

        <form onSubmit={handleCreateAccount} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="account-fullname"
              className="mb-1.5 block text-xs font-semibold text-[var(--av-ink)]"
            >
              Full Name
            </label>
            <input
              id="account-fullname"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Maria Santos"
              className="av-input w-full rounded-2xl px-4 py-2.5 text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="account-email"
              className="mb-1.5 block text-xs font-semibold text-[var(--av-ink)]"
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
              className="av-input w-full rounded-2xl px-4 py-2.5 text-sm"
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label
                htmlFor="account-password"
                className="text-xs font-semibold text-[var(--av-ink)]"
              >
                Temporary Password
              </label>
              <button
                type="button"
                onClick={() => {
                  setPassword(generateStrongPassword());
                  setShowPassword(true);
                  trackAction({
                    module: "accounts",
                    action: "Generated temporary password",
                    controlLabel: "Generate",
                  });
                }}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--av-muted)] underline decoration-[var(--av-border-strong)] underline-offset-2 hover:text-[var(--av-ink)]"
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
                className="av-input w-full rounded-2xl px-4 py-2.5 pr-11 text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-2.5 my-auto flex h-8 w-8 items-center justify-center rounded-full text-[var(--av-muted)] hover:bg-[var(--av-surface-subtle)] hover:text-[var(--av-ink)]"
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
              className="mb-1.5 block text-xs font-semibold text-[var(--av-ink)]"
            >
              Assigned Role
            </label>
            <select
              id="account-role"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="av-input w-full rounded-2xl px-4 py-2.5 text-sm font-medium"
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[11px] text-[var(--av-muted)]">
              {ROLE_OPTIONS.find((opt) => opt.value === role)?.hint}
            </p>
          </div>

          {isStaffRole && (
            <div>
              <label
                htmlFor="account-owner"
                className="mb-1.5 block text-xs font-semibold text-[var(--av-ink)]"
              >
                Assign to Owner Station
              </label>
              <select
                id="account-owner"
                value={resolvedCreateOwnerId}
                required={role === "cashier" && owners.length > 0}
                onChange={(e) => setOwnerId(e.target.value)}
                className="av-input w-full rounded-2xl px-4 py-2.5 text-sm font-medium"
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
            className="av-btn-primary w-full px-5 py-3 text-sm disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create Account"}
          </button>
        </form>
      </div>

      {/* Registered Accounts Table */}
      <div className="av-card p-6 lg:col-span-7">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[var(--av-ink)]">
              Registered Accounts ({users.length})
            </h2>
            <p className="text-xs font-normal text-[var(--av-muted)]">
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
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-[var(--av-muted)]">
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
                      className="rounded-2xl bg-[var(--av-surface-subtle)] font-medium transition hover:bg-[var(--av-surface-hover)]"
                    >
                      <td className="rounded-l-2xl py-3 pl-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(user.id)}
                          onChange={() => toggleRowSelect(user.id)}
                          aria-label={`Select ${user.email}`}
                          className="h-4 w-4 rounded border-[var(--av-border-strong)] accent-[var(--av-accent)]"
                        />
                      </td>

                      <td className="px-3 py-3">
                        <div className="font-semibold text-[var(--av-ink)]">
                          {user.full_name || "Unnamed User"}
                          {isSelf && (
                            <span className="ml-1.5 rounded-full bg-[var(--av-accent)] px-2 py-0.5 text-[10px] font-semibold text-[var(--av-accent-ink)]">
                              You
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-normal text-[var(--av-muted)]">
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
                              void handleUpdateUser(user.id, user.email, {
                                role: e.target.value as UserRole,
                              })
                            }
                            className="av-input rounded-full px-3 py-1 text-xs font-semibold capitalize disabled:opacity-40"
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
                              void handleUpdateUser(user.id, user.email, {
                                ownerId: e.target.value || null,
                              })
                            }
                            className="av-input rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-40"
                          >
                            <option value="">Unassigned</option>
                            {owners.map((owner) => (
                              <option key={owner.id} value={owner.id}>
                                {owner.full_name || owner.email}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-[var(--av-muted)]">—</span>
                        )}
                      </td>

                      <td className="px-3 py-3">
                        <StatusChip
                          label={user.is_active ? "Active" : "Inactive"}
                          tone={user.is_active ? "green" : "outline"}
                          dot
                        />
                      </td>

                      <td className="rounded-r-2xl py-3 pr-3 text-right">
                        {isSelf ? (
                          <span className="text-[11px] text-[var(--av-muted)]">
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
                                  void handleUpdateUser(user.id, user.email, {
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

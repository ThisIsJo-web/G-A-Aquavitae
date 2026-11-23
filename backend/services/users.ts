import "server-only";

import { cache } from "react";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/backend/db/supabase";
import type { Database, StaffRole, UserRole } from "@/backend/db/types";
import { AuthServiceError } from "@/backend/services/auth";

export type UserProfile = Database["public"]["Tables"]["profiles"]["Row"] & {
  is_secured?: boolean;
};

const ALL_ROLES = new Set<UserRole>(["superadmin", "owner", "cashier"]);
const STAFF_ROLES = new Set<StaffRole>(["cashier"]);

export function isValidRole(value: unknown): value is UserRole {
  return typeof value === "string" && ALL_ROLES.has(value as UserRole);
}

// 30-second in-memory cache of Owner IDs that have claimed/secured their credentials.
// Only consulted by Superadmin routes; invalidated immediately when an Owner secures or signs up.
let securedOwnersCache: { ids: Set<string>; expiresAt: number } | null = null;

export function invalidateSecuredOwnersCache(): void {
  securedOwnersCache = null;
}

export async function getSecuredOwnerIds(): Promise<Set<string>> {
  const now = Date.now();
  if (securedOwnersCache && securedOwnersCache.expiresAt > now) {
    return securedOwnersCache.ids;
  }

  const admin = createSupabaseAdminClient();
  const secured = new Set<string>();
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 500,
  });

  if (!error && data?.users) {
    for (const u of data.users) {
      if (u.app_metadata?.credentials_claimed === true) {
        secured.add(u.id);
      }
    }
  }

  securedOwnersCache = { ids: secured, expiresAt: now + 30_000 };
  return secured;
}

export async function isOwnerAccountSecured(userId: string): Promise<boolean> {
  if (securedOwnersCache && securedOwnersCache.expiresAt > Date.now()) {
    return securedOwnersCache.ids.has(userId);
  }
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user) return false;
  return data.user.app_metadata?.credentials_claimed === true;
}

/**
 * Fast, per-request cached profile resolver:
 * 1) Verifies JWT claims locally via Supabase JWKS (~1-2ms vs ~400ms GoTrue HTTP round-trip).
 * 2) Extracts mustChangeCredentials & credentialsClaimed directly from JWT app_metadata (0 extra queries).
 * 3) Runs ONE indexed lookup on public.profiles via the singleton admin client.
 * 4) Memoized with React cache() so repeated calls in the same request cost 0ms.
 */
export const getRequestProfile = cache(async (): Promise<{
  userId: string;
  email: string | null;
  profile: UserProfile | null;
  mustChangeCredentials: boolean;
  credentialsClaimed: boolean;
} | null> => {
  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  const claimsObj =
    !claimsError && claimsData?.claims
      ? (claimsData.claims as Record<string, unknown>)
      : null;

  let userId =
    claimsObj && typeof claimsObj.sub === "string" ? claimsObj.sub : null;
  let email =
    claimsObj && typeof claimsObj.email === "string" ? claimsObj.email : null;
  let appMeta =
    claimsObj &&
    typeof claimsObj.app_metadata === "object" &&
    claimsObj.app_metadata !== null
      ? (claimsObj.app_metadata as Record<string, unknown>)
      : null;

  // Fallback to getUser() only when claims need server refresh
  if (!userId) {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return null;
    }
    userId = userData.user.id;
    email = userData.user.email ?? null;
    appMeta = (userData.user.app_metadata as Record<string, unknown>) ?? null;
  }

  const mustChangeCredentials = appMeta?.must_change_credentials === true;
  const credentialsClaimed = appMeta?.credentials_claimed === true;

  const admin = createSupabaseAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    return {
      userId,
      email,
      profile: null,
      mustChangeCredentials,
      credentialsClaimed,
    };
  }

  return {
    userId,
    email,
    profile,
    mustChangeCredentials,
    credentialsClaimed,
  };
});

/**
 * Fetches the currently authenticated user's profile and verifies the account is active.
 */
export async function requireActiveProfile(): Promise<UserProfile> {
  const session = await getRequestProfile();
  if (!session) {
    throw new AuthServiceError("Authentication required", 401);
  }
  if (!session.profile) {
    throw new AuthServiceError("User profile not found", 403);
  }
  if (!session.profile.is_active) {
    throw new AuthServiceError("Account is deactivated", 403);
  }
  return session.profile;
}

/**
 * Lists managed users based on caller role:
 * - superadmin: all profiles (or staff of a specific owner when targetOwnerId is supplied)
 * - owner: only staff belonging to this owner
 */
export async function listManagedUsers(
  actorOverride?: UserProfile,
  targetOwnerId?: string
): Promise<UserProfile[]> {
  const actor = actorOverride ?? (await requireActiveProfile());

  if (actor.role !== "superadmin" && actor.role !== "owner") {
    throw new AuthServiceError("Forbidden", 403);
  }

  const admin = createSupabaseAdminClient();
  let query = admin
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (actor.role === "owner") {
    query = query.eq("owner_id", actor.id).eq("role", "cashier");
  } else if (targetOwnerId) {
    query = query.eq("owner_id", targetOwnerId).eq("role", "cashier");
  }

  const [res, securedIds] = await Promise.all([
    query,
    actor.role === "superadmin" && !targetOwnerId
      ? getSecuredOwnerIds()
      : Promise.resolve(new Set<string>()),
  ]);

  if (res.error) {
    throw new AuthServiceError(res.error.message, 500);
  }

  return (res.data ?? []).map((row) => ({
    ...row,
    is_secured: row.role === "owner" && securedIds.has(row.id),
  }));
}

export interface CreateManagedUserInput {
  email: string;
  password: string;
  fullName?: string;
  role: UserRole;
  /** Optional when superadmin creates staff for a specific owner. Ignored for owners (always set to owner's own id). */
  ownerId?: string | null;
  /** Marks a cashier account as the Owner's own cashier account ("My Account"). */
  isOwnerCashier?: boolean;
}

/**
 * Creates a new user account under RBAC rules:
 * - superadmin can create any role (superadmin, owner, cashier, staff).
 *   Owners created by Superadmin start with temporary credentials (`must_change_credentials: true`).
 * - owner can only create staff roles (cashier, staff) scoped to owner_id = actor.id
 */
export async function createManagedUser(
  input: CreateManagedUserInput
): Promise<UserProfile> {
  const actor = await requireActiveProfile();

  if (actor.role !== "superadmin" && actor.role !== "owner") {
    throw new AuthServiceError(
      "Only superadmin or owners can create accounts",
      403
    );
  }

  if (actor.role === "owner" && !STAFF_ROLES.has(input.role as StaffRole)) {
    throw new AuthServiceError("Owners can only create cashier accounts", 403);
  }

  const resolvedOwnerId =
    actor.role === "owner"
      ? actor.id
      : STAFF_ROLES.has(input.role as StaffRole)
        ? (input.ownerId || null)
        : null;

  const markAsOwnerCashier =
    Boolean(input.isOwnerCashier) &&
    input.role === "cashier" &&
    Boolean(resolvedOwnerId);

  const isTempOwnerProvisionedBySuperadmin =
    actor.role === "superadmin" && input.role === "owner";

  const admin = createSupabaseAdminClient();

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email: input.email.trim().toLowerCase(),
      password: input.password,
      email_confirm: true,
      app_metadata: {
        role: input.role,
        created_by: actor.id,
        owner_id: resolvedOwnerId,
        is_owner_cashier: markAsOwnerCashier,
        ...(isTempOwnerProvisionedBySuperadmin
          ? {
              must_change_credentials: true,
              credentials_claimed: false,
            }
          : {}),
      },
      user_metadata: {
        full_name: input.fullName?.trim() || null,
      },
    });

  if (createError || !created.user) {
    throw new AuthServiceError(
      createError?.message ?? "Failed to create user account",
      createError?.status ?? 400
    );
  }

  if (markAsOwnerCashier && resolvedOwnerId) {
    await admin
      .from("profiles")
      .update({ is_owner_cashier: false })
      .eq("owner_id", resolvedOwnerId)
      .eq("is_owner_cashier", true);

    const { error: flagError } = await admin
      .from("profiles")
      .update({ is_owner_cashier: true })
      .eq("id", created.user.id);

    if (flagError && flagError.code === "42703") {
      throw new AuthServiceError(
        "Account created, but the 'is_owner_cashier' column is missing. Run Section 12c of backend/db/schema.sql in Supabase SQL Editor.",
        503
      );
    }
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("*")
    .eq("id", created.user.id)
    .single();

  if (profileError || !profile) {
    throw new AuthServiceError(
      "User created, but profile record was not found. Ensure schema.sql has been applied.",
      500
    );
  }

  invalidateSecuredOwnersCache();
  return profile;
}

/**
 * Allows an Owner to update their Full Name, Email / Gmail, and Password from the Owner Dashboard.
 * Marks `must_change_credentials = false` and `credentials_claimed = true` so Superadmin
 * can no longer access or alter this Owner account for integrity.
 */
export async function updateOwnerCredentials(input: {
  fullName?: string;
  newEmail?: string;
  newPassword?: string;
  currentPassword?: string;
}): Promise<{ email: string; fullName: string | null; credentialsClaimed: true }> {
  const session = await getRequestProfile();
  if (!session || !session.profile || !session.profile.is_active) {
    throw new AuthServiceError("Authentication required.", 401);
  }
  const profile = session.profile;
  if (profile.role !== "owner") {
    throw new AuthServiceError(
      "Only Station Owners can update their personal account credentials here.",
      403
    );
  }

  const trimmedName = input.fullName?.trim() ?? "";
  const rawNewEmail = input.newEmail?.trim().toLowerCase() ?? "";
  const rawNewPassword = input.newPassword ?? "";

  const targetEmail = rawNewEmail || profile.email.toLowerCase();
  const targetFullName = trimmedName || profile.full_name;
  const isChangingEmail = Boolean(rawNewEmail && rawNewEmail !== profile.email.toLowerCase());
  const isChangingPassword = rawNewPassword.length > 0;
  const isChangingName = Boolean(trimmedName && trimmedName !== (profile.full_name ?? ""));

  if (trimmedName && trimmedName.length < 2) {
    throw new AuthServiceError("Full name must be at least 2 characters.", 400);
  }

  if (session.mustChangeCredentials) {
    if (!rawNewEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawNewEmail)) {
      throw new AuthServiceError(
        "Please enter a valid personal email or Gmail address.",
        400
      );
    }
    if (rawNewPassword.length < 6) {
      throw new AuthServiceError(
        "New password must be at least 6 characters long.",
        400
      );
    }
  } else {
    if (!isChangingName && !isChangingEmail && !isChangingPassword) {
      throw new AuthServiceError(
        "Enter a new name, email, or password to update.",
        400
      );
    }
    if (rawNewEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawNewEmail)) {
      throw new AuthServiceError(
        "Please enter a valid email or Gmail address.",
        400
      );
    }
    if (isChangingPassword && rawNewPassword.length < 6) {
      throw new AuthServiceError(
        "New password must be at least 6 characters long.",
        400
      );
    }
    if (!input.currentPassword) {
      throw new AuthServiceError(
        "Enter your current password to confirm this change.",
        400
      );
    }
    const verifyClient = await createSupabaseServerClient();
    const { error: verifyErr } = await verifyClient.auth.signInWithPassword({
      email: profile.email,
      password: input.currentPassword,
    });
    if (verifyErr) {
      throw new AuthServiceError("Current password is incorrect.", 403);
    }
  }

  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();

  const authUpdatePayload: {
    email?: string;
    password?: string;
    email_confirm?: boolean;
    app_metadata: Record<string, unknown>;
    user_metadata?: Record<string, unknown>;
  } = {
    email: targetEmail,
    email_confirm: true,
    app_metadata: {
      role: "owner",
      owner_id: null,
      is_owner_cashier: false,
      must_change_credentials: false,
      credentials_claimed: true,
      credentials_claimed_at: now,
    },
  };

  if (isChangingPassword) {
    authUpdatePayload.password = rawNewPassword;
  }
  if (trimmedName) {
    authUpdatePayload.user_metadata = { full_name: trimmedName };
  }

  const { error: authUpdateError } = await admin.auth.admin.updateUserById(
    profile.id,
    authUpdatePayload
  );

  if (authUpdateError) {
    const rawMsg = authUpdateError.message ?? "Unable to update account.";
    const friendly = /already.*registered|duplicate|exists|unique/i.test(rawMsg)
      ? "That email address is already used by another account."
      : rawMsg;
    throw new AuthServiceError(friendly, authUpdateError.status ?? 400);
  }

  const profilePatch: Database["public"]["Tables"]["profiles"]["Update"] = {
    email: targetEmail,
  };
  if (trimmedName) {
    profilePatch.full_name = trimmedName;
  }

  const { error: profileUpdateError } = await admin
    .from("profiles")
    .update(profilePatch)
    .eq("id", profile.id);

  if (profileUpdateError) {
    throw new AuthServiceError(
      "Account updated, but failed to sync profile record.",
      500
    );
  }

  invalidateSecuredOwnersCache();

  // Refresh the Owner's HttpOnly session cookies immediately with updated credentials & JWT metadata
  const activePassword = isChangingPassword
    ? rawNewPassword
    : input.currentPassword;
  if (activePassword) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signInWithPassword({
      email: targetEmail,
      password: activePassword,
    });
  }

  return {
    email: targetEmail,
    fullName: targetFullName ?? null,
    credentialsClaimed: true,
  };
}

export interface UpdateManagedUserInput {
  role?: UserRole;
  isActive?: boolean;
  fullName?: string | null;
  ownerId?: string | null;
  isOwnerCashier?: boolean;
}

/**
 * Updates a managed user's role, active status, name, or owner assignment.
 * Enforces strict RBAC, prevents superadmin self-lockout, and protects secured Owner accounts.
 */
export async function updateManagedUser(
  targetUserId: string,
  input: UpdateManagedUserInput
): Promise<UserProfile> {
  const actor = await requireActiveProfile();

  if (actor.role !== "superadmin" && actor.role !== "owner") {
    throw new AuthServiceError("Forbidden", 403);
  }

  const admin = createSupabaseAdminClient();

  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("*")
    .eq("id", targetUserId)
    .single();

  if (targetError || !target) {
    throw new AuthServiceError("User not found", 404);
  }

  if (actor.id === target.id) {
    if (input.isActive === false) {
      throw new AuthServiceError("You cannot deactivate your own account", 400);
    }
    if (input.role && input.role !== actor.role) {
      throw new AuthServiceError("You cannot change your own role", 400);
    }
  }

  // Integrity lock: once an Owner secures their account with personal credentials,
  // Superadmin can no longer alter or access that Owner account.
  if (actor.role === "superadmin" && target.role === "owner") {
    const secured = await isOwnerAccountSecured(target.id);
    if (secured) {
      throw new AuthServiceError(
        "This owner has secured their account with personal credentials. Superadmin can no longer modify this account for integrity.",
        403
      );
    }
  }

  if (actor.role === "owner") {
    if (
      target.owner_id !== actor.id ||
      !STAFF_ROLES.has(target.role as StaffRole)
    ) {
      throw new AuthServiceError(
        "Owners can only manage their own staff accounts",
        403
      );
    }
    if (input.role && !STAFF_ROLES.has(input.role as StaffRole)) {
      throw new AuthServiceError(
        "Owners can only assign the cashier role",
        403
      );
    }
  }

  const nextRole = input.role ?? target.role;
  const nextOwnerId =
    actor.role === "owner"
      ? actor.id
      : input.ownerId !== undefined
        ? STAFF_ROLES.has(nextRole as StaffRole)
          ? input.ownerId
          : null
        : STAFF_ROLES.has(nextRole as StaffRole)
          ? target.owner_id
          : null;

  const profilePatch: Database["public"]["Tables"]["profiles"]["Update"] = {
    role: nextRole,
    owner_id: nextOwnerId,
  };

  if (typeof input.isActive === "boolean") {
    profilePatch.is_active = input.isActive;
  }
  if (input.fullName !== undefined) {
    profilePatch.full_name = input.fullName?.trim() || null;
  }

  if (nextRole !== "cashier") {
    if (target.is_owner_cashier) {
      profilePatch.is_owner_cashier = false;
    }
  } else if (typeof input.isOwnerCashier === "boolean") {
    if (input.isOwnerCashier && nextOwnerId) {
      await admin
        .from("profiles")
        .update({ is_owner_cashier: false })
        .eq("owner_id", nextOwnerId)
        .neq("id", targetUserId)
        .eq("is_owner_cashier", true);
    }
    profilePatch.is_owner_cashier = input.isOwnerCashier;
  }

  const { data: updated, error: updateError } = await admin
    .from("profiles")
    .update(profilePatch)
    .eq("id", targetUserId)
    .select("*")
    .single();

  if (updateError || !updated) {
    if (updateError?.code === "42703") {
      throw new AuthServiceError(
        "The 'is_owner_cashier' column is not applied yet. Run Section 12c of backend/db/schema.sql in Supabase SQL Editor.",
        503
      );
    }
    throw new AuthServiceError(
      updateError?.message ?? "Failed to update user",
      500
    );
  }

  // Keep Supabase auth.users metadata in sync with profile changes (preserving existing credential flags)
  const { data: authUserData } = await admin.auth.admin.getUserById(targetUserId);
  const existingMeta =
    (authUserData?.user?.app_metadata as Record<string, unknown> | undefined) ??
    {};

  await admin.auth.admin.updateUserById(targetUserId, {
    app_metadata: {
      ...existingMeta,
      role: updated.role,
      owner_id: updated.owner_id,
      is_owner_cashier: Boolean(updated.is_owner_cashier),
    },
    ...(input.fullName !== undefined
      ? { user_metadata: { full_name: updated.full_name } }
      : {}),
  });

  invalidateSecuredOwnersCache();
  return updated;
}

/**
 * Permanently deletes one or more user accounts (Superadmin only).
 * Blocks self-deletion and blocks deleting secured Owner accounts (`credentials_claimed = true`).
 */
export async function deleteManagedUsers(
  targetUserIds: string[]
): Promise<{ deletedCount: number; deletedEmails: string[] }> {
  const actor = await requireActiveProfile();

  if (actor.role !== "superadmin") {
    throw new AuthServiceError(
      "Only Superadmin accounts can permanently delete users.",
      403
    );
  }

  const uniqueIds = Array.from(
    new Set(targetUserIds.map((id) => id.trim()).filter(Boolean))
  ).slice(0, 50);

  if (uniqueIds.length === 0) {
    throw new AuthServiceError("Select at least one account to delete.", 400);
  }

  if (uniqueIds.includes(actor.id)) {
    throw new AuthServiceError("You cannot delete your own account.", 400);
  }

  const admin = createSupabaseAdminClient();
  const [targetsRes, securedOwnerIds] = await Promise.all([
    admin
      .from("profiles")
      .select("id, email, role")
      .in("id", uniqueIds),
    getSecuredOwnerIds(),
  ]);

  if (targetsRes.error) {
    throw new AuthServiceError(targetsRes.error.message, 500);
  }

  const targets = targetsRes.data ?? [];
  if (targets.length === 0) {
    throw new AuthServiceError("No matching accounts found to delete.", 404);
  }

  for (const target of targets) {
    if (target.role === "owner" && securedOwnerIds.has(target.id)) {
      throw new AuthServiceError(
        `Cannot delete "${target.email}" because the Owner has secured their account with personal credentials.`,
        403
      );
    }
  }

  const deletedEmails: string[] = [];

  for (const target of targets) {
    const { error: delError } = await admin.auth.admin.deleteUser(target.id);
    if (delError) {
      const msg = delError.message || "Unable to delete user account.";
      if (/database error deleting user|immutable|cannot be modified or deleted/i.test(msg)) {
        throw new AuthServiceError(
          "Database audit lock prevented deleting this user. Run Section 12j of schema.sql in Supabase SQL Editor once, then try again.",
          409
        );
      }
      throw new AuthServiceError(msg, delError.status ?? 500);
    }
    deletedEmails.push(target.email);
  }

  invalidateSecuredOwnersCache();
  return { deletedCount: deletedEmails.length, deletedEmails };
}

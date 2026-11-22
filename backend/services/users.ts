import "server-only";

import { cache } from "react";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/backend/db/supabase";
import type { Database, StaffRole, UserRole } from "@/backend/db/types";
import { AuthServiceError } from "@/backend/services/auth";

export type UserProfile = Database["public"]["Tables"]["profiles"]["Row"];

const ALL_ROLES = new Set<UserRole>(["superadmin", "owner", "cashier", "staff"]);
const STAFF_ROLES = new Set<StaffRole>(["cashier", "staff"]);

export function isValidRole(value: unknown): value is UserRole {
  return typeof value === "string" && ALL_ROLES.has(value as UserRole);
}

/**
 * Fast, per-request cached profile resolver:
 * 1) Verifies JWT claims locally via Supabase JWKS (~1-2ms vs ~400ms GoTrue HTTP round-trip).
 * 2) Runs ONE indexed lookup on public.profiles via the singleton admin client.
 * 3) Memoized with React cache() so repeated calls in the same request cost 0ms.
 */
export const getRequestProfile = cache(async (): Promise<{
  userId: string;
  email: string | null;
  profile: UserProfile | null;
} | null> => {
  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  let userId =
    !claimsError && typeof claimsData?.claims?.sub === "string"
      ? claimsData.claims.sub
      : null;
  let email =
    !claimsError && typeof claimsData?.claims?.email === "string"
      ? claimsData.claims.email
      : null;

  // Fallback to getUser() only when claims need server refresh
  if (!userId) {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return null;
    }
    userId = userData.user.id;
    email = userData.user.email ?? null;
  }

  const admin = createSupabaseAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    return { userId, email, profile: null };
  }

  return { userId, email, profile };
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
    query = query.eq("owner_id", actor.id).in("role", ["cashier", "staff"]);
  } else if (targetOwnerId) {
    query = query.eq("owner_id", targetOwnerId).in("role", ["cashier", "staff"]);
  }

  const { data, error } = await query;

  if (error) {
    throw new AuthServiceError(error.message, 500);
  }

  return data ?? [];
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
 * - superadmin can create any role (superadmin, owner, cashier, staff)
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
    throw new AuthServiceError(
      "Owners can only create cashier or staff accounts",
      403
    );
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
    // Keep a single "My Account" cashier designation per owner station
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

  return profile;
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
 * Enforces strict RBAC and prevents superadmin self-lockout.
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
        "Owners can only assign cashier or staff roles",
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

  // Keep Supabase auth.users metadata in sync with profile changes
  await admin.auth.admin.updateUserById(targetUserId, {
    app_metadata: {
      role: updated.role,
      owner_id: updated.owner_id,
      is_owner_cashier: Boolean(updated.is_owner_cashier),
    },
    ...(input.fullName !== undefined
      ? { user_metadata: { full_name: updated.full_name } }
      : {}),
  });

  return updated;
}

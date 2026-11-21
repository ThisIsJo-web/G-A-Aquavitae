import "server-only";

import { createSupabaseServerClient } from "@/backend/db/supabase";
import type { UserRole } from "@/backend/db/types";
import { AuthServiceError } from "@/backend/services/auth";
import {
  getSuperadminElevationStatus,
  getSuperadminTotpState,
  listAuditTargetAccounts,
  type AuditTargetAccount,
  type SuperadminElevationPayload,
  type TotpFactorSummary,
} from "@/backend/services/superadmin-elevation";
import {
  requireActiveProfile,
  type UserProfile,
} from "@/backend/services/users";

/**
 * Throws AuthServiceError(401 | 403) unless the caller is an active superadmin.
 * Use in API Route Handlers and Server Actions.
 */
export async function requireSuperadmin(): Promise<UserProfile> {
  const profile = await requireActiveProfile();

  if (profile.role !== "superadmin") {
    throw new AuthServiceError("Superadmin access required", 403);
  }

  return profile;
}

export type SuperadminPageContext =
  | { status: "unauthenticated" }
  | { status: "forbidden"; role: UserRole | null; email: string | null }
  | { status: "ok"; profile: UserProfile };

/**
 * Non-throwing Server Component helper for /superadmin/* pages.
 */
export async function getSuperadminPageContext(): Promise<SuperadminPageContext> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { status: "unauthenticated" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || !profile.is_active) {
    return {
      status: "forbidden",
      role: null,
      email: user.email ?? null,
    };
  }

  if (profile.role !== "superadmin") {
    return {
      status: "forbidden",
      role: profile.role,
      email: profile.email,
    };
  }

  return { status: "ok", profile };
}

export interface CashierAccessContext {
  profile: UserProfile;
  tenantOwnerId: string;
  elevation: SuperadminElevationPayload | null;
}

/**
 * API Route guard for /api/cashier/*:
 * - cashier: direct access to assigned owner station (tenantOwnerId = profile.owner_id)
 * - superadmin: ONLY allowed with an active 2-Step Integrity Elevation cookie
 * - owner / staff / others: 403 Forbidden (owners must use their own marked Cashier account)
 */
export async function requireCashierAccess(): Promise<CashierAccessContext> {
  const profile = await requireActiveProfile();

  if (profile.role === "owner") {
    throw new AuthServiceError(
      "Station Owners cannot operate the Cashier page directly. Create a Cashier account marked as 'My Account' in Staff Accounts and sign in with it to use the Cashier Dashboard.",
      403
    );
  }

  if (profile.role === "cashier") {
    if (!profile.owner_id) {
      throw new AuthServiceError(
        "This cashier account is not assigned to an Owner station yet.",
        403
      );
    }
    return {
      profile,
      tenantOwnerId: profile.owner_id,
      elevation: null,
    };
  }

  if (profile.role === "superadmin") {
    const elevation = await getSuperadminElevationStatus(profile.id);
    if (!elevation) {
      throw new AuthServiceError(
        "Superadmin 2-step integrity verification is required to access Cashier operations.",
        403
      );
    }
    return {
      profile,
      tenantOwnerId: elevation.targetOwnerId,
      elevation,
    };
  }

  throw new AuthServiceError(
    "Cashier operations are restricted to Cashier accounts.",
    403
  );
}

/**
 * Enforces that riders can only be created or managed by Cashier or Owner accounts.
 */
export function assertRiderManagerRole(profile: UserProfile): void {
  if (profile.role !== "owner" && profile.role !== "cashier") {
    throw new AuthServiceError(
      "Riders can only be managed by Cashier or Owner accounts.",
      403
    );
  }
}

export type CashierPageContext =
  | { status: "unauthenticated" }
  | {
      status: "forbidden";
      role: UserRole | null;
      email: string | null;
      reason: string;
    }
  | {
      status: "superadmin_needs_verification";
      profile: UserProfile;
      totp: TotpFactorSummary;
      targets: AuditTargetAccount[];
    }
  | {
      status: "ok";
      profile: UserProfile;
      tenantOwnerId: string;
      elevation: SuperadminElevationPayload | null;
    };

/**
 * Non-throwing Server Component helper for /cashier page gating.
 */
export async function getCashierPageContext(): Promise<CashierPageContext> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { status: "unauthenticated" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || !profile.is_active) {
    return {
      status: "forbidden",
      role: null,
      email: user.email ?? null,
      reason: "Your account is inactive or missing a profile.",
    };
  }

  if (profile.role === "owner") {
    return {
      status: "forbidden",
      role: profile.role,
      email: profile.email,
      reason:
        "Station Owners cannot access the Cashier page directly. Create a Cashier account marked as 'My Account' under Staff Accounts in your Owner Dashboard, then sign in with that Cashier account.",
    };
  }

  if (profile.role === "cashier") {
    if (!profile.owner_id) {
      return {
        status: "forbidden",
        role: profile.role,
        email: profile.email,
        reason:
          "Your cashier account has not been assigned to an Owner station yet. Ask Superadmin to assign your Owner.",
      };
    }

    return {
      status: "ok",
      profile,
      tenantOwnerId: profile.owner_id,
      elevation: null,
    };
  }

  if (profile.role === "superadmin") {
    const elevation = await getSuperadminElevationStatus(profile.id);
    if (elevation) {
      return {
        status: "ok",
        profile,
        tenantOwnerId: elevation.targetOwnerId,
        elevation,
      };
    }

    const [totp, targets] = await Promise.all([
      getSuperadminTotpState(),
      listAuditTargetAccounts(),
    ]);

    return {
      status: "superadmin_needs_verification",
      profile,
      totp,
      targets,
    };
  }

  return {
    status: "forbidden",
    role: profile.role,
    email: profile.email,
    reason: "Cashier operations are restricted to Owner and Cashier roles.",
  };
}

/**
 * Throws AuthServiceError(401 | 403) unless the caller is an active Owner.
 * Use in /api/owner/* Route Handlers.
 */
export async function requireOwnerAccess(): Promise<UserProfile> {
  const profile = await requireActiveProfile();

  if (profile.role !== "owner") {
    throw new AuthServiceError(
      "Owner dashboard access is restricted to Owner accounts.",
      403
    );
  }

  return profile;
}

export type OwnerPageContext =
  | { status: "unauthenticated" }
  | {
      status: "forbidden";
      role: UserRole | null;
      email: string | null;
      reason: string;
    }
  | { status: "ok"; profile: UserProfile };

/**
 * Non-throwing Server Component helper for /owner page gating.
 */
export async function getOwnerPageContext(): Promise<OwnerPageContext> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { status: "unauthenticated" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || !profile.is_active) {
    return {
      status: "forbidden",
      role: null,
      email: user.email ?? null,
      reason: "Your account is inactive or missing a profile.",
    };
  }

  if (profile.role !== "owner") {
    return {
      status: "forbidden",
      role: profile.role,
      email: profile.email,
      reason: "Owner dashboard is restricted to Station Owner accounts.",
    };
  }

  return { status: "ok", profile };
}

import "server-only";

import { createSupabaseAdminClient } from "@/backend/db/supabase";
import type { UserRole } from "@/backend/db/types";
import { AuthServiceError } from "@/backend/services/auth";
import {
  getRequestProfile,
  requireActiveProfile,
  type UserProfile,
} from "@/backend/services/users";

export interface StationOption {
  id: string;
  email: string;
  fullName: string | null;
}

/**
 * Lists active Owner stations (used by Superadmin when operating Owner/Cashier modules).
 */
export async function listActiveOwnerStations(): Promise<StationOption[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, email, full_name")
    .eq("role", "owner")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    email: row.email,
    fullName: row.full_name,
  }));
}

async function resolveSuperadminStation(
  requestedOwnerId?: string | null
): Promise<{ tenantOwnerId: string; stations: StationOption[] }> {
  const stations = await listActiveOwnerStations();
  if (stations.length === 0) {
    throw new AuthServiceError(
      "No active Owner station exists yet. Create an Owner account in Accounts & Roles first.",
      400
    );
  }

  if (requestedOwnerId) {
    const matched = stations.find((s) => s.id === requestedOwnerId);
    if (matched) {
      return { tenantOwnerId: matched.id, stations };
    }
  }

  return { tenantOwnerId: stations[0].id, stations };
}

/**
 * Throws AuthServiceError(401 | 403) unless the caller is an active Superadmin.
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
  const session = await getRequestProfile();
  if (!session) {
    return { status: "unauthenticated" };
  }

  const profile = session.profile;
  if (!profile || !profile.is_active) {
    return {
      status: "forbidden",
      role: null,
      email: session.email,
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

export interface TenantAccessContext {
  profile: UserProfile;
  tenantOwnerId: string;
}

export type CashierAccessContext = TenantAccessContext;
export type OwnerAccessContext = TenantAccessContext;

/**
 * Hierarchical API Route guard for /api/cashier/*:
 * - cashier: access to assigned owner station (tenantOwnerId = profile.owner_id)
 * - owner: direct access to their own station (tenantOwnerId = profile.id)
 * - superadmin: direct access to selected or default active Owner station
 */
export async function requireCashierAccess(
  requestedStationId?: string | null
): Promise<CashierAccessContext> {
  const profile = await requireActiveProfile();

  if (profile.role === "owner") {
    return {
      profile,
      tenantOwnerId: profile.id,
    };
  }

  if (profile.role === "cashier") {
    if (!profile.owner_id) {
      throw new AuthServiceError(
        "This cashier account is not assigned to a station yet.",
        403
      );
    }
    return {
      profile,
      tenantOwnerId: profile.owner_id,
    };
  }

  if (profile.role === "superadmin") {
    const { tenantOwnerId } = await resolveSuperadminStation(requestedStationId);
    return {
      profile,
      tenantOwnerId,
    };
  }

  throw new AuthServiceError(
    "Cashier operations are restricted to Cashier, Owner, and Superadmin accounts.",
    403
  );
}

/**
 * Hierarchical API Route guard for /api/owner/*:
 * - owner: access to their own station (tenantOwnerId = profile.id)
 * - superadmin: direct access to selected or default active Owner station
 */
export async function requireOwnerAccess(
  requestedStationId?: string | null
): Promise<OwnerAccessContext> {
  const profile = await requireActiveProfile();

  if (profile.role === "owner") {
    return {
      profile,
      tenantOwnerId: profile.id,
    };
  }

  if (profile.role === "superadmin") {
    const { tenantOwnerId } = await resolveSuperadminStation(requestedStationId);
    return {
      profile,
      tenantOwnerId,
    };
  }

  throw new AuthServiceError(
    "Owner dashboard access is restricted to Owner and Superadmin accounts.",
    403
  );
}

/**
 * Enforces that riders can be managed by Superadmin, Owner, or Cashier accounts.
 */
export function assertRiderManagerRole(profile: UserProfile): void {
  if (
    profile.role !== "superadmin" &&
    profile.role !== "owner" &&
    profile.role !== "cashier"
  ) {
    throw new AuthServiceError(
      "Riders can only be managed by Cashier, Owner, or Superadmin accounts.",
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
      status: "ok";
      profile: UserProfile;
      tenantOwnerId: string;
      stations: StationOption[];
    };

/**
 * Non-throwing Server Component helper for /cashier page gating (Hierarchical: Superadmin > Owner > Cashier).
 */
export async function getCashierPageContext(
  requestedStationId?: string | null
): Promise<CashierPageContext> {
  const session = await getRequestProfile();
  if (!session) {
    return { status: "unauthenticated" };
  }

  const profile = session.profile;
  if (!profile || !profile.is_active) {
    return {
      status: "forbidden",
      role: null,
      email: session.email,
      reason: "Your account is inactive or missing a profile.",
    };
  }

  if (profile.role === "owner") {
    return {
      status: "ok",
      profile,
      tenantOwnerId: profile.id,
      stations: [],
    };
  }

  if (profile.role === "cashier") {
    if (!profile.owner_id) {
      return {
        status: "forbidden",
        role: profile.role,
        email: profile.email,
        reason:
          "Your cashier account has not been assigned to a station yet. Ask your administrator to assign your station.",
      };
    }

    return {
      status: "ok",
      profile,
      tenantOwnerId: profile.owner_id,
      stations: [],
    };
  }

  if (profile.role === "superadmin") {
    const stations = await listActiveOwnerStations();
    if (stations.length === 0) {
      return {
        status: "forbidden",
        role: profile.role,
        email: profile.email,
        reason:
          "No active Owner station exists yet. Create an Owner account under Accounts & Roles first.",
      };
    }
    const matched = requestedStationId
      ? stations.find((s) => s.id === requestedStationId)
      : null;

    return {
      status: "ok",
      profile,
      tenantOwnerId: matched ? matched.id : stations[0].id,
      stations,
    };
  }

  return {
    status: "forbidden",
    role: profile.role,
    email: profile.email,
    reason: "Cashier operations are restricted to Cashier, Owner, and Superadmin accounts.",
  };
}

export type OwnerPageContext =
  | { status: "unauthenticated" }
  | {
      status: "forbidden";
      role: UserRole | null;
      email: string | null;
      reason: string;
    }
  | {
      status: "ok";
      profile: UserProfile;
      tenantOwnerId: string;
      stations: StationOption[];
    };

/**
 * Non-throwing Server Component helper for /owner page gating (Hierarchical: Superadmin > Owner).
 */
export async function getOwnerPageContext(
  requestedStationId?: string | null
): Promise<OwnerPageContext> {
  const session = await getRequestProfile();
  if (!session) {
    return { status: "unauthenticated" };
  }

  const profile = session.profile;
  if (!profile || !profile.is_active) {
    return {
      status: "forbidden",
      role: null,
      email: session.email,
      reason: "Your account is inactive or missing a profile.",
    };
  }

  if (profile.role === "owner") {
    return {
      status: "ok",
      profile,
      tenantOwnerId: profile.id,
      stations: [],
    };
  }

  if (profile.role === "superadmin") {
    const stations = await listActiveOwnerStations();
    if (stations.length === 0) {
      return {
        status: "forbidden",
        role: profile.role,
        email: profile.email,
        reason:
          "No active Owner station exists yet. Create an Owner account under Accounts & Roles first.",
      };
    }
    const matched = requestedStationId
      ? stations.find((s) => s.id === requestedStationId)
      : null;

    return {
      status: "ok",
      profile,
      tenantOwnerId: matched ? matched.id : stations[0].id,
      stations,
    };
  }

  return {
    status: "forbidden",
    role: profile.role,
    email: profile.email,
    reason: "Owner dashboard is restricted to Owner and Superadmin accounts.",
  };
}

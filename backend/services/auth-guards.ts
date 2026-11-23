import "server-only";

import { createSupabaseAdminClient } from "@/backend/db/supabase";
import type { UserRole } from "@/backend/db/types";
import { AuthServiceError } from "@/backend/services/auth";
import {
  getRequestProfile,
  getSecuredOwnerIds,
  requireActiveProfile,
  type UserProfile,
} from "@/backend/services/users";

export interface StationOption {
  id: string;
  email: string;
  fullName: string | null;
}

/**
 * Lists active Owner stations accessible to Superadmin.
 * Owners who have claimed/secured their personal credentials (`credentials_claimed = true`)
 * are automatically excluded so Superadmin cannot access their private accounts for integrity.
 */
export async function listActiveOwnerStations(): Promise<StationOption[]> {
  const admin = createSupabaseAdminClient();
  const [res, securedOwnerIds] = await Promise.all([
    admin
      .from("profiles")
      .select("id, email, full_name")
      .eq("role", "owner")
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    getSecuredOwnerIds(),
  ]);

  if (res.error || !res.data) return [];
  return res.data
    .filter((row) => !securedOwnerIds.has(row.id))
    .map((row) => ({
      id: row.id,
      email: row.email,
      fullName: row.full_name,
    }));
}

async function resolveSuperadminStation(
  superadminProfile: UserProfile,
  requestedOwnerId?: string | null
): Promise<{ tenantOwnerId: string; stations: StationOption[] }> {
  const [accessibleStations, securedOwnerIds] = await Promise.all([
    listActiveOwnerStations(),
    getSecuredOwnerIds(),
  ]);

  if (requestedOwnerId && securedOwnerIds.has(requestedOwnerId)) {
    throw new AuthServiceError(
      "This owner account is secured with personal credentials and can no longer be accessed by Superadmin for integrity.",
      403
    );
  }

  // Always include Superadmin's own workspace fallback so Superadmin can still operate
  // Owner & Cashier features hierarchically even when all Owner accounts are secured.
  const stations: StationOption[] =
    accessibleStations.length > 0
      ? accessibleStations
      : [
          {
            id: superadminProfile.id,
            email: superadminProfile.email,
            fullName: superadminProfile.full_name
              ? `${superadminProfile.full_name} (Superadmin Station)`
              : "Superadmin Station",
          },
        ];

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
 * - superadmin: access to unclaimed station or own Superadmin station (never secured Owners)
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
    const { tenantOwnerId } = await resolveSuperadminStation(
      profile,
      requestedStationId
    );
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
 * - superadmin: access to unclaimed station or own Superadmin station (never secured Owners)
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
    const { tenantOwnerId } = await resolveSuperadminStation(
      profile,
      requestedStationId
    );
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
    try {
      const { tenantOwnerId, stations } = await resolveSuperadminStation(
        profile,
        requestedStationId
      );
      return {
        status: "ok",
        profile,
        tenantOwnerId,
        stations,
      };
    } catch (error) {
      return {
        status: "forbidden",
        role: profile.role,
        email: profile.email,
        reason:
          error instanceof Error
            ? error.message
            : "This station cannot be accessed.",
      };
    }
  }

  return {
    status: "forbidden",
    role: profile.role,
    email: profile.email,
    reason:
      "Cashier operations are restricted to Cashier, Owner, and Superadmin accounts.",
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
      mustChangeCredentials: boolean;
      credentialsClaimed: boolean;
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
      mustChangeCredentials: session.mustChangeCredentials,
      credentialsClaimed: session.credentialsClaimed,
    };
  }

  if (profile.role === "superadmin") {
    try {
      const { tenantOwnerId, stations } = await resolveSuperadminStation(
        profile,
        requestedStationId
      );
      return {
        status: "ok",
        profile,
        tenantOwnerId,
        stations,
        mustChangeCredentials: false,
        credentialsClaimed: false,
      };
    } catch (error) {
      return {
        status: "forbidden",
        role: profile.role,
        email: profile.email,
        reason:
          error instanceof Error
            ? error.message
            : "This station cannot be accessed.",
      };
    }
  }

  return {
    status: "forbidden",
    role: profile.role,
    email: profile.email,
    reason: "Owner dashboard is restricted to Owner and Superadmin accounts.",
  };
}

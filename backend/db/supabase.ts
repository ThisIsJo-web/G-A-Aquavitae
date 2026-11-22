import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "@/backend/config/env";
import type { Database } from "@/backend/db/types";

export const AUTH_COOKIE_FLAGS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export const AUTH_COOKIE_OPTIONS = {
  name: "av_session",
  ...AUTH_COOKIE_FLAGS,
};

/**
 * Per-request Supabase client bound to the user's HttpOnly session cookies.
 * Uses the publishable key and enforces Row Level Security (RLS).
 * Always create a fresh instance per request — never share across requests.
 */
export async function createSupabaseServerClient() {
  const { url, publishableKey } = getSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, publishableKey, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, {
              ...options,
              ...AUTH_COOKIE_FLAGS,
            });
          });
        } catch {
          // Called from a Server Component where setting cookies is disallowed.
          // Session cookie refresh is handled by proxy.ts on each request.
        }
      },
    },
  });
}

let cachedAdminClient: ReturnType<typeof createClient<Database>> | null = null;

/**
 * Privileged server-only Supabase admin client using the secret key.
 * Cached as a module-level singleton to eliminate repeated client setup overhead.
 * BYPASSES Row Level Security (RLS) — use strictly for trusted backend operations.
 */
export function createSupabaseAdminClient() {
  if (cachedAdminClient) {
    return cachedAdminClient;
  }

  const { url, secretKey } = getSupabaseEnv();

  cachedAdminClient = createClient<Database>(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cachedAdminClient;
}

export interface DatabaseConnectionStatus {
  connected: boolean;
  authReachable: boolean;
  jwksReachable: boolean;
  error?: string;
}

/**
 * Verifies live server-side connectivity to Supabase (DB/Auth API + JWKS endpoint).
 */
export async function checkDatabaseConnection(): Promise<DatabaseConnectionStatus> {
  try {
    const { url, publishableKey, secretKey, jwksUrl } = getSupabaseEnv();

    const [restRes, authHealthRes, jwksRes] = await Promise.all([
      fetch(`${url}/rest/v1/`, {
        headers: { apikey: secretKey },
        cache: "no-store",
      }),
      fetch(`${url}/auth/v1/health`, {
        headers: { apikey: publishableKey },
        cache: "no-store",
      }),
      fetch(jwksUrl, { cache: "no-store" }),
    ]);

    const connected = restRes.ok;
    const authReachable = authHealthRes.ok;
    const jwksReachable = jwksRes.ok;

    if (!connected || !authReachable || !jwksReachable) {
      return {
        connected,
        authReachable,
        jwksReachable,
        error: `Health check failed (rest=${restRes.status}, auth=${authHealthRes.status}, jwks=${jwksRes.status})`,
      };
    }

    return { connected, authReachable, jwksReachable };
  } catch (error) {
    return {
      connected: false,
      authReachable: false,
      jwksReachable: false,
      error: error instanceof Error ? error.message : "Unknown connection error",
    };
  }
}

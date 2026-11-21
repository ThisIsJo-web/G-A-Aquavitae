import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/backend/config/env";
import {
  AUTH_COOKIE_FLAGS,
  AUTH_COOKIE_OPTIONS,
} from "@/backend/db/supabase";
import type { Database } from "@/backend/db/types";

/**
 * Add route prefixes here that require an authenticated user.
 * Unauthenticated requests to these paths will redirect to /login.
 */
const PROTECTED_ROUTES: string[] = [
  "/dashboard",
  "/superadmin",
  "/owner",
  "/cashier",
];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

export async function updateSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const { url, publishableKey } = getSupabaseEnv();

  const supabase = createServerClient<Database>(url, publishableKey, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, {
            ...options,
            ...AUTH_COOKIE_FLAGS,
          });
        });

        Object.entries(headers).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
      },
    },
  });

  // Validates JWT against Supabase JWKS and refreshes expired sessions into cookies.
  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims);

  if (!isAuthenticated && isProtectedPath(request.nextUrl.pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

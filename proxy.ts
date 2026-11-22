import type { NextRequest } from "next/server";
import { updateSupabaseSession } from "@/backend/lib/supabase-proxy";

export async function proxy(request: NextRequest) {
  return updateSupabaseSession(request);
}

export const config = {
  matcher: [
    /*
     * Match page routes only (skip API routes and static assets to avoid redundant
     * middleware auth round-trips on high-frequency API calls — API Route Handlers
     * verify sessions directly via cached JWKS claims).
     */
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

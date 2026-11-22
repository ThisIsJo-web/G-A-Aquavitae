import { NextResponse } from "next/server";
import { extractRequestMeta, handleApiError } from "@/backend/lib/http";
import { scheduleActivityLog } from "@/backend/services/activity-logs";
import { signOut } from "@/backend/services/auth";
import { getRequestProfile } from "@/backend/services/users";

export async function POST(request: Request) {
  try {
    const session = await getRequestProfile().catch(() => null);
    await signOut();

    if (session?.profile) {
      const meta = extractRequestMeta(request);
      scheduleActivityLog({
        actor: {
          id: session.profile.id,
          name: session.profile.full_name || session.profile.email,
          email: session.profile.email,
          role: session.profile.role,
        },
        module: "auth",
        action: "Signed Out",
        controlLabel: "Sign out",
        route: "/api/auth/logout",
        ...meta,
      });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return handleApiError(error, { route: "/api/auth/logout", source: "auth" });
  }
}

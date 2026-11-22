import { NextResponse } from "next/server";
import {
  extractRequestMeta,
  handleApiError,
  parseJsonBody,
} from "@/backend/lib/http";
import { scheduleActivityLog } from "@/backend/services/activity-logs";
import { signIn } from "@/backend/services/auth";

interface LoginBody {
  email?: unknown;
  password?: unknown;
}

export async function POST(request: Request) {
  const body = await parseJsonBody<LoginBody>(request);

  if (
    !body ||
    typeof body.email !== "string" ||
    typeof body.password !== "string" ||
    !body.email.trim() ||
    !body.password
  ) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 }
    );
  }

  const cleanEmail = body.email.trim().toLowerCase();
  const meta = extractRequestMeta(request);

  try {
    const result = await signIn({
      email: cleanEmail,
      password: body.password,
    });

    scheduleActivityLog({
      actor: {
        id: result.user.id,
        name: result.user.fullName || result.user.email,
        email: result.user.email,
        role: result.user.role,
      },
      module: "auth",
      action: "Signed In",
      controlLabel: "Sign in",
      targetLabel: result.user.email,
      route: "/api/auth/login",
      status: "success",
      ...meta,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    scheduleActivityLog({
      actor: {
        email: cleanEmail,
        name: cleanEmail,
        role: "anonymous",
      },
      module: "auth",
      action: "Failed Sign-In Attempt",
      controlLabel: "Sign in",
      targetLabel: cleanEmail,
      route: "/api/auth/login",
      status: "failed",
      ...meta,
    });
    return handleApiError(error, { route: "/api/auth/login", source: "auth" });
  }
}

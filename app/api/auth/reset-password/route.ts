import { NextResponse } from "next/server";
import { handleApiError, parseJsonBody } from "@/backend/lib/http";
import { requestPasswordReset } from "@/backend/services/auth";

interface ResetPasswordBody {
  email?: unknown;
}

export async function POST(request: Request) {
  const body = await parseJsonBody<ResetPasswordBody>(request);

  if (!body || typeof body.email !== "string" || !body.email.trim()) {
    return NextResponse.json(
      { error: "A valid email address is required" },
      { status: 400 }
    );
  }

  try {
    const origin = new URL(request.url).origin;
    await requestPasswordReset(
      body.email.trim().toLowerCase(),
      `${origin}/api/auth/callback?next=/reset-password`
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

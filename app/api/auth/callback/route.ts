import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { sanitizeRedirectPath } from "@/backend/lib/http";
import { exchangeCodeForSession, verifyEmailOtp } from "@/backend/services/auth";

const ALLOWED_OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = sanitizeRedirectPath(searchParams.get("next"));

  try {
    if (code) {
      await exchangeCodeForSession(code);
      return NextResponse.redirect(`${origin}${next}`);
    }

    if (tokenHash && type && ALLOWED_OTP_TYPES.has(type)) {
      await verifyEmailOtp(tokenHash, type);
      return NextResponse.redirect(`${origin}${next}`);
    }
  } catch {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
  }

  return NextResponse.redirect(`${origin}/login?error=invalid_auth_callback`);
}

import "server-only";

import type { EmailOtpType, User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/backend/db/supabase";
import type { UserRole } from "@/backend/db/types";

export interface AuthUser {
  id: string;
  email: string | null;
  role: UserRole | null;
  fullName: string | null;
  emailConfirmedAt: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export class AuthServiceError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AuthServiceError";
    this.status = status;
  }
}

function toAuthUser(
  user: User,
  profile?: { role?: UserRole | null; full_name?: string | null } | null
): AuthUser {
  const appRole = user.app_metadata?.role as UserRole | undefined;
  return {
    id: user.id,
    email: user.email ?? null,
    role: profile?.role ?? appRole ?? null,
    fullName:
      profile?.full_name ??
      (typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : null),
    emailConfirmedAt: user.email_confirmed_at ?? null,
    createdAt: user.created_at,
    metadata: user.user_metadata ?? {},
  };
}

export interface SignUpInput {
  email: string;
  password: string;
  metadata?: Record<string, unknown>;
  emailRedirectTo?: string;
}

export async function signUp({
  email,
  password,
  metadata,
  emailRedirectTo,
}: SignUpInput): Promise<{
  user: AuthUser | null;
  requiresEmailConfirmation: boolean;
}> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: metadata,
      emailRedirectTo,
    },
  });

  if (error) {
    throw new AuthServiceError(error.message, error.status ?? 400);
  }

  return {
    user: data.user ? toAuthUser(data.user) : null,
    requiresEmailConfirmation: Boolean(data.user && !data.session),
  };
}

export interface SignInInput {
  email: string;
  password: string;
}

export async function signIn({
  email,
  password,
}: SignInInput): Promise<{ user: AuthUser }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    throw new AuthServiceError(
      error?.message ?? "Invalid login credentials",
      error?.status ?? 401
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, is_active")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profile && profile.is_active === false) {
    await supabase.auth.signOut();
    throw new AuthServiceError(
      "This account has been deactivated. Contact an administrator.",
      403
    );
  }

  return { user: toAuthUser(data.user, profile) };
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new AuthServiceError(error.message, error.status ?? 500);
  }
}

/**
 * Authoritative server-side user lookup via Supabase Auth.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, is_active")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profile && profile.is_active === false) {
    return null;
  }

  return toAuthUser(data.user, profile);
}

/**
 * Fast local JWT claims verification against Supabase JWKS.
 */
export async function getSessionClaims() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    return null;
  }

  return data.claims;
}

/**
 * Guard helper for protected Server Components, Server Actions, and Route Handlers.
 */
export async function requireAuth(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthServiceError("Authentication required", 401);
  }
  return user;
}

export async function requestPasswordReset(
  email: string,
  redirectTo: string
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) {
    throw new AuthServiceError(error.message, error.status ?? 400);
  }
}

export async function updatePassword(password: string): Promise<AuthUser> {
  await requireAuth();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.updateUser({ password });

  if (error || !data.user) {
    throw new AuthServiceError(
      error?.message ?? "Failed to update password",
      error?.status ?? 400
    );
  }

  return toAuthUser(data.user);
}

export async function verifyEmailOtp(
  tokenHash: string,
  type: EmailOtpType
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error) {
    throw new AuthServiceError(error.message, error.status ?? 400);
  }
}

export async function exchangeCodeForSession(code: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    throw new AuthServiceError(error.message, error.status ?? 400);
  }
}

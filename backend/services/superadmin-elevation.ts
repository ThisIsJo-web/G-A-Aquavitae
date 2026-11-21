import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "@/backend/config/env";
import {
  AUTH_COOKIE_OPTIONS,
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/backend/db/supabase";
import { AuthServiceError } from "@/backend/services/auth";
import { recordFinancialAuditEvent } from "@/backend/services/audit-ledger";

export const ELEVATION_COOKIE_NAME = "av_sa_cashier_elevation";
const ELEVATION_TTL_SECONDS = 15 * 60; // 15 minutes

export interface SuperadminElevationPayload {
  auditId: string | null;
  superadminId: string;
  targetOwnerId: string;
  targetOwnerLabel: string;
  reason: string;
  expiresAt: string;
}

function signPayload(encodedPayload: string): string {
  const { secretKey } = getSupabaseEnv();
  return createHmac("sha256", `${secretKey}:sa-cashier-elevation`)
    .update(encodedPayload)
    .digest("base64url");
}

function encodeElevationCookie(payload: SuperadminElevationPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );
  const sig = signPayload(encoded);
  return `${encoded}.${sig}`;
}

function decodeElevationCookie(
  rawValue: string | undefined
): SuperadminElevationPayload | null {
  if (!rawValue) return null;
  const parts = rawValue.split(".");
  if (parts.length !== 2) return null;

  const [encoded, providedSig] = parts;
  const expectedSig = signPayload(encoded);

  const a = Buffer.from(providedSig, "utf8");
  const b = Buffer.from(expectedSig, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as SuperadminElevationPayload;

    if (
      !parsed.superadminId ||
      !parsed.targetOwnerId ||
      !parsed.expiresAt ||
      new Date(parsed.expiresAt).getTime() <= Date.now()
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export async function getSuperadminElevationStatus(
  superadminId: string
): Promise<SuperadminElevationPayload | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(ELEVATION_COOKIE_NAME)?.value;
  const payload = decodeElevationCookie(raw);

  if (!payload || payload.superadminId !== superadminId) {
    return null;
  }

  // Verify the audit log has not been revoked
  if (payload.auditId) {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("superadmin_access_audit_logs")
      .select("revoked_at, expires_at")
      .eq("id", payload.auditId)
      .maybeSingle();

    if (!error && data) {
      if (
        data.revoked_at ||
        new Date(data.expires_at).getTime() <= Date.now()
      ) {
        return null;
      }
    }
  }

  return payload;
}

export interface TotpFactorSummary {
  hasVerifiedFactor: boolean;
  verifiedFactorId: string | null;
}

export async function getSuperadminTotpState(): Promise<TotpFactorSummary> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.mfa.listFactors();

  if (error || !data) {
    return { hasVerifiedFactor: false, verifiedFactorId: null };
  }

  const verified = data.totp.find((f) => f.status === "verified");
  return {
    hasVerifiedFactor: Boolean(verified),
    verifiedFactorId: verified?.id ?? null,
  };
}

export interface AuditTargetAccount {
  id: string;
  email: string;
  fullName: string | null;
  role: "owner" | "cashier";
  ownerId: string | null;
}

export async function listAuditTargetAccounts(): Promise<AuditTargetAccount[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, email, full_name, role, owner_id")
    .in("role", ["cashier", "owner"])
    .eq("is_active", true)
    .order("role", { ascending: true })
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role as "owner" | "cashier",
    ownerId: row.owner_id,
  }));
}

export async function enrollSuperadminTotp(): Promise<{
  factorId: string;
  qrCode: string;
  secret: string;
  uri: string;
}> {
  const supabase = await createSupabaseServerClient();

  // Remove any previously abandoned unverified TOTP factors to prevent duplicate name collisions
  const { data: existing } = await supabase.auth.mfa.listFactors();
  if (existing?.all) {
    for (const factor of existing.all) {
      if (factor.factor_type === "totp" && factor.status !== "verified") {
        await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "AquaVitae Integrity Gate",
  });

  if (error || !data) {
    throw new AuthServiceError(
      error?.message ?? "Failed to enroll authenticator app",
      400
    );
  }

  return {
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
    uri: data.totp.uri,
  };
}

export interface VerifyElevationInput {
  superadminId: string;
  superadminEmail: string;
  password: string;
  totpCode: string;
  factorId: string;
  targetAccountId: string;
  reason: string;
}

export async function verifyAndElevateSuperadmin(
  input: VerifyElevationInput
): Promise<SuperadminElevationPayload> {
  const reason = input.reason.trim();
  if (reason.length < 3) {
    throw new AuthServiceError(
      "Please enter an audit reason (at least 3 characters).",
      400
    );
  }

  const cleanCode = input.totpCode.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleanCode)) {
    throw new AuthServiceError("Enter a valid 6-digit authenticator code.", 400);
  }

  // Validate target account is an active Cashier or Owner
  const admin = createSupabaseAdminClient();
  const { data: targetProfile, error: targetErr } = await admin
    .from("profiles")
    .select("id, email, full_name, role, owner_id, is_active")
    .eq("id", input.targetAccountId)
    .single();

  if (
    targetErr ||
    !targetProfile ||
    (targetProfile.role !== "owner" && targetProfile.role !== "cashier") ||
    !targetProfile.is_active
  ) {
    throw new AuthServiceError(
      "Select a valid active Cashier or Owner account to inspect.",
      400
    );
  }

  const resolvedOwnerId =
    targetProfile.role === "owner"
      ? targetProfile.id
      : (targetProfile.owner_id ?? targetProfile.id);

  // Step 1: Re-verify Superadmin password using a stateless client
  const { url, publishableKey } = getSupabaseEnv();
  const statelessClient = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: pwErr } = await statelessClient.auth.signInWithPassword({
    email: input.superadminEmail,
    password: input.password,
  });

  if (pwErr) {
    throw new AuthServiceError("Step 1 failed: Invalid Superadmin password.", 401);
  }

  // Step 2: Verify 6-digit TOTP MFA challenge
  const supabase = await createSupabaseServerClient();
  const { error: mfaErr } = await supabase.auth.mfa.challengeAndVerify({
    factorId: input.factorId,
    code: cleanCode,
  });

  if (mfaErr) {
    throw new AuthServiceError(
      `Step 2 failed: ${mfaErr.message || "Invalid 6-digit verification code."}`,
      401
    );
  }

  const expiresAt = new Date(
    Date.now() + ELEVATION_TTL_SECONDS * 1000
  ).toISOString();

  const rolePrefix = targetProfile.role === "cashier" ? "Cashier" : "Owner";
  const targetLabel = targetProfile.full_name
    ? `${rolePrefix}: ${targetProfile.full_name} (${targetProfile.email})`
    : `${rolePrefix}: ${targetProfile.email}`;

  // Persist immutable audit log (degrade gracefully if table isn't created yet)
  let auditId: string | null = null;
  const { data: auditRow } = await admin
    .from("superadmin_access_audit_logs")
    .insert({
      superadmin_id: input.superadminId,
      target_owner_id: resolvedOwnerId,
      scope: "cashier",
      reason: `[${targetLabel}] ${reason}`.slice(0, 500),
      verified_via: "password_and_totp",
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (auditRow?.id) {
    auditId = auditRow.id;
  }

  await recordFinancialAuditEvent({
    ownerId: resolvedOwnerId,
    actor: {
      id: input.superadminId,
      name: input.superadminEmail,
      role: "superadmin",
    },
    module: "security",
    eventType: "superadmin.audit_access",
    entityType: "superadmin_elevation",
    entityId: auditId,
    referenceLabel: targetLabel,
    summary: `Superadmin entered Cashier Audit Mode (2FA verified) for ${targetLabel} · Reason: "${reason.slice(0, 200)}"`,
    metadata: {
      verified_via: "password_and_totp",
      expires_at: expiresAt,
      reason: reason.slice(0, 500),
    },
  });

  const payload: SuperadminElevationPayload = {
    auditId,
    superadminId: input.superadminId,
    targetOwnerId: resolvedOwnerId,
    targetOwnerLabel: targetLabel,
    reason: reason.slice(0, 500),
    expiresAt,
  };

  const cookieStore = await cookies();
  cookieStore.set(ELEVATION_COOKIE_NAME, encodeElevationCookie(payload), {
    ...AUTH_COOKIE_OPTIONS,
    maxAge: ELEVATION_TTL_SECONDS,
  });

  return payload;
}

export async function revokeSuperadminElevation(
  superadminId: string
): Promise<void> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(ELEVATION_COOKIE_NAME)?.value;
  const payload = decodeElevationCookie(raw);

  if (payload && payload.superadminId === superadminId && payload.auditId) {
    const admin = createSupabaseAdminClient();
    await admin
      .from("superadmin_access_audit_logs")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", payload.auditId);
  }

  cookieStore.set(ELEVATION_COOKIE_NAME, "", {
    ...AUTH_COOKIE_OPTIONS,
    maxAge: 0,
  });
}

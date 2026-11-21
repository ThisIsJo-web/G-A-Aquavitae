import "server-only";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}`);
  }
  return value;
}

export interface SupabaseEnv {
  url: string;
  publishableKey: string;
  secretKey: string;
  jwksUrl: string;
}

export function getSupabaseEnv(): SupabaseEnv {
  const url = requireEnv("SUPABASE_URL");
  const publishableKey = requireEnv("SUPABASE_PUBLISHABLE_KEY");
  const secretKey = requireEnv("SUPABASE_SECRET_KEY");
  const jwksUrl =
    process.env.SUPABASE_JWKS_URL ?? `${url}/auth/v1/.well-known/jwks.json`;

  return {
    url,
    publishableKey,
    secretKey,
    jwksUrl,
  };
}

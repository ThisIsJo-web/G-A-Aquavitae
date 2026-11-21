import "server-only";

import { checkDatabaseConnection } from "@/backend/db/supabase";

export interface HealthStatus {
  status: "ok" | "degraded";
  database: "connected" | "disconnected";
  auth: "reachable" | "unreachable";
  jwks: "reachable" | "unreachable";
  timestamp: string;
}

export async function getHealthStatus(): Promise<HealthStatus> {
  const db = await checkDatabaseConnection();
  const healthy = db.connected && db.authReachable && db.jwksReachable;

  return {
    status: healthy ? "ok" : "degraded",
    database: db.connected ? "connected" : "disconnected",
    auth: db.authReachable ? "reachable" : "unreachable",
    jwks: db.jwksReachable ? "reachable" : "unreachable",
    timestamp: new Date().toISOString(),
  };
}

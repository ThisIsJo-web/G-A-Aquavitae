import { NextResponse } from "next/server";
import { getHealthStatus } from "@/backend/services/health";

export async function GET() {
  const health = await getHealthStatus();
  return NextResponse.json(health, {
    status: health.status === "ok" ? 200 : 503,
  });
}

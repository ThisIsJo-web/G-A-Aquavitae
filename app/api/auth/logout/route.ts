import { NextResponse } from "next/server";
import { handleApiError } from "@/backend/lib/http";
import { signOut } from "@/backend/services/auth";

export async function POST() {
  try {
    await signOut();
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

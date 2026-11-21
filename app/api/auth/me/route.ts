import { NextResponse } from "next/server";
import { handleApiError } from "@/backend/lib/http";
import { getCurrentUser } from "@/backend/services/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ user: null }, { status: 401 });
    }
    return NextResponse.json({ user }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

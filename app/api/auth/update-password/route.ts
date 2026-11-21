import { NextResponse } from "next/server";
import { handleApiError, parseJsonBody } from "@/backend/lib/http";
import { updatePassword } from "@/backend/services/auth";

interface UpdatePasswordBody {
  password?: unknown;
}

export async function POST(request: Request) {
  const body = await parseJsonBody<UpdatePasswordBody>(request);

  if (!body || typeof body.password !== "string" || body.password.length < 6) {
    return NextResponse.json(
      { error: "New password must be at least 6 characters" },
      { status: 400 }
    );
  }

  try {
    const user = await updatePassword(body.password);
    return NextResponse.json({ user }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

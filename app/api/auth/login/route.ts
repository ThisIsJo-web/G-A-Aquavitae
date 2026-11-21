import { NextResponse } from "next/server";
import { handleApiError, parseJsonBody } from "@/backend/lib/http";
import { signIn } from "@/backend/services/auth";

interface LoginBody {
  email?: unknown;
  password?: unknown;
}

export async function POST(request: Request) {
  const body = await parseJsonBody<LoginBody>(request);

  if (
    !body ||
    typeof body.email !== "string" ||
    typeof body.password !== "string" ||
    !body.email.trim() ||
    !body.password
  ) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 }
    );
  }

  try {
    const result = await signIn({
      email: body.email.trim().toLowerCase(),
      password: body.password,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

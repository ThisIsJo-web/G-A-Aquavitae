import { NextResponse } from "next/server";
import { handleApiError, parseJsonBody } from "@/backend/lib/http";
import {
  createManagedUser,
  isValidRole,
  listManagedUsers,
} from "@/backend/services/users";

export async function GET() {
  try {
    const users = await listManagedUsers();
    return NextResponse.json({ users }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

interface CreateUserBody {
  email?: unknown;
  password?: unknown;
  fullName?: unknown;
  role?: unknown;
  ownerId?: unknown;
  isOwnerCashier?: unknown;
}

export async function POST(request: Request) {
  const body = await parseJsonBody<CreateUserBody>(request);

  if (
    !body ||
    typeof body.email !== "string" ||
    !body.email.trim() ||
    typeof body.password !== "string" ||
    body.password.length < 6 ||
    !isValidRole(body.role)
  ) {
    return NextResponse.json(
      {
        error:
          "Valid email, password (min 6 chars), and role (superadmin | owner | cashier | staff) are required",
      },
      { status: 400 }
    );
  }

  try {
    const user = await createManagedUser({
      email: body.email,
      password: body.password,
      fullName: typeof body.fullName === "string" ? body.fullName : undefined,
      role: body.role,
      ownerId: typeof body.ownerId === "string" ? body.ownerId : undefined,
      isOwnerCashier:
        typeof body.isOwnerCashier === "boolean"
          ? body.isOwnerCashier
          : undefined,
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

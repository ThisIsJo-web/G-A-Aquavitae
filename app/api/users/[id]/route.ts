import { NextResponse } from "next/server";
import { handleApiError, parseJsonBody } from "@/backend/lib/http";
import { isValidRole, updateManagedUser } from "@/backend/services/users";

interface UpdateUserBody {
  role?: unknown;
  isActive?: unknown;
  fullName?: unknown;
  ownerId?: unknown;
  isOwnerCashier?: unknown;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await parseJsonBody<UpdateUserBody>(request);

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Valid JSON payload is required" },
      { status: 400 }
    );
  }

  if (body.role !== undefined && !isValidRole(body.role)) {
    return NextResponse.json(
      { error: "Role must be one of: superadmin, owner, cashier, staff" },
      { status: 400 }
    );
  }

  if (body.isActive !== undefined && typeof body.isActive !== "boolean") {
    return NextResponse.json(
      { error: "isActive must be a boolean" },
      { status: 400 }
    );
  }

  if (
    body.isOwnerCashier !== undefined &&
    typeof body.isOwnerCashier !== "boolean"
  ) {
    return NextResponse.json(
      { error: "isOwnerCashier must be a boolean" },
      { status: 400 }
    );
  }

  try {
    const user = await updateManagedUser(id, {
      role: isValidRole(body.role) ? body.role : undefined,
      isActive:
        typeof body.isActive === "boolean" ? body.isActive : undefined,
      fullName:
        body.fullName === null || typeof body.fullName === "string"
          ? body.fullName
          : undefined,
      ownerId:
        body.ownerId === null || typeof body.ownerId === "string"
          ? body.ownerId
          : undefined,
      isOwnerCashier:
        typeof body.isOwnerCashier === "boolean"
          ? body.isOwnerCashier
          : undefined,
    });

    return NextResponse.json(
      { user },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store",
        },
      }
    );
  } catch (error) {
    return handleApiError(error, { route: "/api/users/[id]" });
  }
}

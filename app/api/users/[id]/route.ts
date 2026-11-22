import { NextResponse } from "next/server";
import {
  extractRequestMeta,
  handleApiError,
  parseJsonBody,
} from "@/backend/lib/http";
import { scheduleActivityLog } from "@/backend/services/activity-logs";
import {
  isValidRole,
  requireActiveProfile,
  updateManagedUser,
} from "@/backend/services/users";

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
      { error: "Role must be superadmin, owner, cashier, or staff" },
      { status: 400 }
    );
  }

  if (body.isActive !== undefined && typeof body.isActive !== "boolean") {
    return NextResponse.json(
      { error: "Active status must be true or false" },
      { status: 400 }
    );
  }

  if (
    body.isOwnerCashier !== undefined &&
    typeof body.isOwnerCashier !== "boolean"
  ) {
    return NextResponse.json(
      { error: "Owner cashier flag must be true or false" },
      { status: 400 }
    );
  }

  try {
    const actor = await requireActiveProfile();
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

    const meta = extractRequestMeta(request);
    const changeSummary =
      typeof body.isActive === "boolean"
        ? body.isActive
          ? `Activated account (${user.email})`
          : `Deactivated account (${user.email})`
        : body.role
          ? `Changed role of ${user.email} to ${user.role}`
          : `Updated account (${user.email})`;

    scheduleActivityLog({
      actor: {
        id: actor.id,
        name: actor.full_name || actor.email,
        email: actor.email,
        role: actor.role,
      },
      stationOwnerId: user.owner_id ?? (user.role === "owner" ? user.id : null),
      module: "accounts",
      action: changeSummary,
      controlLabel:
        typeof body.isActive === "boolean"
          ? body.isActive
            ? "Activate Account"
            : "Deactivate Account"
          : "Update Account",
      targetType: "account",
      targetId: user.id,
      targetLabel: user.email,
      route: "/api/users/[id]",
      ...meta,
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

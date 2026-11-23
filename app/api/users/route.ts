import { NextResponse } from "next/server";
import {
  extractRequestMeta,
  handleApiError,
  parseJsonBody,
} from "@/backend/lib/http";
import { scheduleActivityLog } from "@/backend/services/activity-logs";
import {
  createManagedUser,
  deleteManagedUsers,
  isValidRole,
  listManagedUsers,
  requireActiveProfile,
} from "@/backend/services/users";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const station = searchParams.get("station") || undefined;
    const actor = await requireActiveProfile();
    const users = await listManagedUsers(
      actor,
      actor.role === "superadmin" ? station : undefined
    );
    return NextResponse.json({ users }, { status: 200 });
  } catch (error) {
    return handleApiError(error, { route: "/api/users" });
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
          "Valid email, password (at least 6 characters), and role are required",
      },
      { status: 400 }
    );
  }

  try {
    const actor = await requireActiveProfile();
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

    const meta = extractRequestMeta(request);
    scheduleActivityLog({
      actor: {
        id: actor.id,
        name: actor.full_name || actor.email,
        email: actor.email,
        role: actor.role,
      },
      stationOwnerId: user.owner_id ?? (user.role === "owner" ? user.id : null),
      module: "accounts",
      action: `Created ${user.role} account (${user.email})`,
      controlLabel: "Create Account",
      targetType: "account",
      targetId: user.id,
      targetLabel: user.email,
      route: "/api/users",
      ...meta,
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    return handleApiError(error, { route: "/api/users" });
  }
}

interface BulkDeleteUsersBody {
  ids?: unknown;
}

export async function DELETE(request: Request) {
  const body = await parseJsonBody<BulkDeleteUsersBody>(request);
  const ids = Array.isArray(body?.ids)
    ? body.ids.filter((item): item is string => typeof item === "string")
    : [];

  if (ids.length === 0) {
    return NextResponse.json(
      { error: "Select at least one account to delete." },
      { status: 400 }
    );
  }

  try {
    const actor = await requireActiveProfile();
    const { deletedCount, deletedEmails } = await deleteManagedUsers(ids);

    const meta = extractRequestMeta(request);
    scheduleActivityLog({
      actor: {
        id: actor.id,
        name: actor.full_name || actor.email,
        email: actor.email,
        role: actor.role,
      },
      module: "accounts",
      action: `Deleted ${deletedCount} user account${deletedCount === 1 ? "" : "s"}`,
      controlLabel: "Confirm Delete",
      targetType: "account",
      targetLabel: deletedEmails.slice(0, 3).join(", "),
      route: "/api/users",
      details: { deletedCount, deletedEmails },
      ...meta,
    });

    return NextResponse.json(
      { deleted: true, deletedCount, deletedEmails },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error, { route: "/api/users" });
  }
}

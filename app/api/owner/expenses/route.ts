import { NextResponse } from "next/server";
import {
  extractRequestMeta,
  handleApiError,
  parseJsonBody,
} from "@/backend/lib/http";
import { scheduleActivityLog } from "@/backend/services/activity-logs";
import { requireOwnerAccess } from "@/backend/services/auth-guards";
import {
  createStationExpense,
  deleteStationExpense,
  deleteStationExpensesBulk,
  getOwnerDashboardSnapshot,
  isValidExpenseCategory,
  sanitizeRangeDays,
} from "@/backend/services/owner/dashboard";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { tenantOwnerId } = await requireOwnerAccess(
      searchParams.get("station")
    );
    const rangeDays = sanitizeRangeDays(searchParams.get("range"));

    const snapshot = await getOwnerDashboardSnapshot(tenantOwnerId, rangeDays);
    return NextResponse.json(
      {
        expenses: snapshot.expenses,
        expensesByCategory: snapshot.expensesByCategory,
        totalExpenses: snapshot.quickStats.totalExpenses,
        expensesSchemaMissing: snapshot.expensesSchemaMissing,
      },
      {
        status: 200,
        headers: { "Cache-Control": "private, no-store" },
      }
    );
  } catch (error) {
    return handleApiError(error, { route: "/api/owner/expenses" });
  }
}

interface CreateExpenseBody {
  category?: unknown;
  description?: unknown;
  amount?: unknown;
  expenseDate?: unknown;
  notes?: unknown;
}

export async function POST(request: Request) {
  const body = await parseJsonBody<CreateExpenseBody>(request);

  if (
    !body ||
    !isValidExpenseCategory(body.category) ||
    typeof body.description !== "string" ||
    !body.description.trim()
  ) {
    return NextResponse.json(
      { error: "Valid category, description, and amount are required." },
      { status: 400 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const { profile, tenantOwnerId } = await requireOwnerAccess(
      searchParams.get("station")
    );
    const expense = await createStationExpense(tenantOwnerId, profile.id, {
      category: body.category,
      description: body.description,
      amount: Number(body.amount),
      expenseDate:
        typeof body.expenseDate === "string" ? body.expenseDate : undefined,
      notes: typeof body.notes === "string" ? body.notes : undefined,
    });

    const meta = extractRequestMeta(request);
    scheduleActivityLog({
      actor: {
        id: profile.id,
        name: profile.full_name || profile.email,
        email: profile.email,
        role: profile.role,
      },
      stationOwnerId: tenantOwnerId,
      module: "expenses",
      action: `Recorded Expense: ${expense.description}`,
      controlLabel: "Record Expense",
      targetType: "expense",
      targetId: expense.id,
      targetLabel: `₱${Number(expense.amount).toFixed(2)} (${expense.category})`,
      route: "/api/owner/expenses",
      ...meta,
    });

    return NextResponse.json({ expense }, { status: 201 });
  } catch (error) {
    return handleApiError(error, { route: "/api/owner/expenses" });
  }
}

interface BulkDeleteExpensesBody {
  ids?: unknown;
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { profile, tenantOwnerId } = await requireOwnerAccess(
      searchParams.get("station")
    );
    const id = searchParams.get("id") ?? "";
    const meta = extractRequestMeta(request);

    if (id.trim()) {
      await deleteStationExpense(tenantOwnerId, id, profile.id);

      scheduleActivityLog({
        actor: {
          id: profile.id,
          name: profile.full_name || profile.email,
          email: profile.email,
          role: profile.role,
        },
        stationOwnerId: tenantOwnerId,
        module: "expenses",
        action: "Deleted Station Expense",
        controlLabel: "Delete Expense",
        targetType: "expense",
        targetId: id,
        route: "/api/owner/expenses",
        ...meta,
      });

      return NextResponse.json({ deleted: true, deletedCount: 1 }, { status: 200 });
    }

    const body = await parseJsonBody<BulkDeleteExpensesBody>(request);
    const ids = Array.isArray(body?.ids)
      ? body.ids.filter((item): item is string => typeof item === "string")
      : [];

    if (ids.length === 0) {
      return NextResponse.json(
        { error: "Select at least one expense to delete." },
        { status: 400 }
      );
    }

    const { deletedCount } = await deleteStationExpensesBulk(
      tenantOwnerId,
      profile.id,
      ids
    );

    scheduleActivityLog({
      actor: {
        id: profile.id,
        name: profile.full_name || profile.email,
        email: profile.email,
        role: profile.role,
      },
      stationOwnerId: tenantOwnerId,
      module: "expenses",
      action: `Deleted ${deletedCount} Station Expense${deletedCount === 1 ? "" : "s"}`,
      controlLabel: "Confirm Delete",
      targetType: "expense",
      targetLabel: `${deletedCount} selected`,
      route: "/api/owner/expenses",
      details: { deletedCount },
      ...meta,
    });

    return NextResponse.json({ deleted: true, deletedCount }, { status: 200 });
  } catch (error) {
    return handleApiError(error, { route: "/api/owner/expenses" });
  }
}

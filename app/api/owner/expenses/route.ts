import { NextResponse } from "next/server";
import { handleApiError, parseJsonBody } from "@/backend/lib/http";
import { requireOwnerAccess } from "@/backend/services/auth-guards";
import {
  createStationExpense,
  deleteStationExpense,
  getOwnerDashboardSnapshot,
  isValidExpenseCategory,
  sanitizeRangeDays,
} from "@/backend/services/owner/dashboard";

export async function GET(request: Request) {
  try {
    const owner = await requireOwnerAccess();
    const { searchParams } = new URL(request.url);
    const rangeDays = sanitizeRangeDays(searchParams.get("range"));

    const snapshot = await getOwnerDashboardSnapshot(owner.id, rangeDays);
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
    const owner = await requireOwnerAccess();
    const expense = await createStationExpense(owner.id, owner.id, {
      category: body.category,
      description: body.description,
      amount: Number(body.amount),
      expenseDate:
        typeof body.expenseDate === "string" ? body.expenseDate : undefined,
      notes: typeof body.notes === "string" ? body.notes : undefined,
    });

    return NextResponse.json({ expense }, { status: 201 });
  } catch (error) {
    return handleApiError(error, { route: "/api/owner/expenses" });
  }
}

export async function DELETE(request: Request) {
  try {
    const owner = await requireOwnerAccess();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id") ?? "";

    if (!id.trim()) {
      return NextResponse.json(
        { error: "Expense id query parameter is required." },
        { status: 400 }
      );
    }

    await deleteStationExpense(owner.id, id);
    return NextResponse.json({ deleted: true }, { status: 200 });
  } catch (error) {
    return handleApiError(error, { route: "/api/owner/expenses" });
  }
}

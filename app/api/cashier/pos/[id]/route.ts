import { NextResponse } from "next/server";
import { handleApiError, parseJsonBody } from "@/backend/lib/http";
import { requireCashierAccess } from "@/backend/services/auth-guards";
import { voidWalkInSale } from "@/backend/services/cashier/pos";

interface VoidSaleBody {
  action?: unknown;
  reason?: unknown;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { profile, tenantOwnerId } = await requireCashierAccess();
    const { id } = await params;
    const body = await parseJsonBody<VoidSaleBody>(request);

    if (!body || body.action !== "void") {
      return NextResponse.json(
        { error: "Supported action is 'void'" },
        { status: 400 }
      );
    }

    const sale = await voidWalkInSale(
      tenantOwnerId,
      id,
      typeof body.reason === "string" ? body.reason : undefined,
      profile.id
    );

    return NextResponse.json(
      { sale },
      { status: 200, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return handleApiError(error, { route: "/api/cashier/pos/[id]" });
  }
}

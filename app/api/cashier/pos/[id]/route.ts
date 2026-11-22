import { NextResponse } from "next/server";
import {
  extractRequestMeta,
  handleApiError,
  parseJsonBody,
} from "@/backend/lib/http";
import { scheduleActivityLog } from "@/backend/services/activity-logs";
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
    const { searchParams } = new URL(request.url);
    const { profile, tenantOwnerId } = await requireCashierAccess(
      searchParams.get("station")
    );
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

    const meta = extractRequestMeta(request);
    scheduleActivityLog({
      actor: {
        id: profile.id,
        name: profile.full_name || profile.email,
        email: profile.email,
        role: profile.role,
      },
      stationOwnerId: tenantOwnerId,
      module: "pos",
      action: `Voided Walk-in Sale (${sale.receipt_no})`,
      controlLabel: "Void Sale",
      targetType: "pos_sale",
      targetId: sale.id,
      targetLabel: sale.receipt_no,
      route: "/api/cashier/pos/[id]",
      ...meta,
    });

    return NextResponse.json(
      { sale },
      { status: 200, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return handleApiError(error, { route: "/api/cashier/pos/[id]" });
  }
}

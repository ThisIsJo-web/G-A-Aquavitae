import { NextResponse } from "next/server";
import { handleApiError, parseJsonBody } from "@/backend/lib/http";
import { requireCashierAccess } from "@/backend/services/auth-guards";
import { returnBorrowedGallons } from "@/backend/services/cashier/inventory";

interface ReturnBorrowedBody {
  qtyReturned?: unknown;
  businessDate?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { profile, tenantOwnerId } = await requireCashierAccess();
    const { id } = await params;
    const body = await parseJsonBody<ReturnBorrowedBody>(request);

    if (!body || !Number.isFinite(Number(body.qtyReturned))) {
      return NextResponse.json(
        { error: "Valid qtyReturned is required" },
        { status: 400 }
      );
    }

    const record = await returnBorrowedGallons(
      profile.id,
      tenantOwnerId,
      id,
      Number(body.qtyReturned),
      typeof body.businessDate === "string" ? body.businessDate : undefined
    );

    return NextResponse.json(
      { record },
      { status: 200, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return handleApiError(error, {
      route: "/api/cashier/borrowed-gallons/[id]/return",
    });
  }
}

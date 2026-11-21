import { NextResponse } from "next/server";
import type { GallonType } from "@/backend/db/types";
import { handleApiError, parseJsonBody } from "@/backend/lib/http";
import { requireCashierAccess } from "@/backend/services/auth-guards";
import { createBorrowedGallonRecord } from "@/backend/services/cashier/inventory";

interface CreateBorrowedBody {
  customerName?: unknown;
  customerPhone?: unknown;
  customerAddress?: unknown;
  gallonType?: unknown;
  qtyBorrowed?: unknown;
  depositAmount?: unknown;
  notes?: unknown;
  businessDate?: unknown;
}

export async function POST(request: Request) {
  try {
    const { profile, tenantOwnerId } = await requireCashierAccess();
    const body = await parseJsonBody<CreateBorrowedBody>(request);

    if (
      !body ||
      typeof body.customerName !== "string" ||
      !body.customerName.trim()
    ) {
      return NextResponse.json(
        { error: "Customer name is required" },
        { status: 400 }
      );
    }

    const gallonType: GallonType =
      body.gallonType === "round" ? "round" : "slim";

    const record = await createBorrowedGallonRecord(profile.id, tenantOwnerId, {
      customerName: body.customerName,
      customerPhone:
        typeof body.customerPhone === "string" ? body.customerPhone : undefined,
      customerAddress:
        typeof body.customerAddress === "string"
          ? body.customerAddress
          : undefined,
      gallonType,
      qtyBorrowed: Number(body.qtyBorrowed ?? 1),
      depositAmount:
        body.depositAmount !== undefined ? Number(body.depositAmount) : 0,
      notes: typeof body.notes === "string" ? body.notes : undefined,
      businessDate:
        typeof body.businessDate === "string" ? body.businessDate : undefined,
    });

    return NextResponse.json(
      { record },
      { status: 201, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return handleApiError(error, { route: "/api/cashier/borrowed-gallons" });
  }
}

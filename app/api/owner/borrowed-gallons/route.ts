import { NextResponse } from "next/server";
import {
  extractRequestMeta,
  handleApiError,
  parseJsonBody,
} from "@/backend/lib/http";
import { scheduleActivityLog } from "@/backend/services/activity-logs";
import { requireOwnerAccess } from "@/backend/services/auth-guards";
import { createBorrowedGallonRecord } from "@/backend/services/cashier/inventory";

interface CreateBorrowBody {
  customerName?: unknown;
  customerPhone?: unknown;
  customerAddress?: unknown;
  qtyBorrowed?: unknown;
  depositAmount?: unknown;
  notes?: unknown;
  businessDate?: unknown;
}

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { profile, tenantOwnerId } = await requireOwnerAccess(
      searchParams.get("station")
    );
    const body = await parseJsonBody<CreateBorrowBody>(request);

    if (
      !body ||
      typeof body.customerName !== "string" ||
      !body.customerName.trim() ||
      !Number.isFinite(Number(body.qtyBorrowed))
    ) {
      return NextResponse.json(
        { error: "Customer name and quantity borrowed are required." },
        { status: 400 }
      );
    }

    const record = await createBorrowedGallonRecord(profile.id, tenantOwnerId, {
      customerName: body.customerName,
      customerPhone:
        typeof body.customerPhone === "string" ? body.customerPhone : undefined,
      customerAddress:
        typeof body.customerAddress === "string"
          ? body.customerAddress
          : undefined,
      qtyBorrowed: Number(body.qtyBorrowed),
      depositAmount:
        body.depositAmount !== undefined && body.depositAmount !== ""
          ? Number(body.depositAmount)
          : 0,
      notes: typeof body.notes === "string" ? body.notes : undefined,
      businessDate:
        typeof body.businessDate === "string" ? body.businessDate : undefined,
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
      module: "inventory",
      action: `Recorded Borrowed Gallons (${record.qty_borrowed} gal)`,
      controlLabel: "Save Borrowed Gallons",
      targetType: "borrowed_gallon",
      targetId: record.id,
      targetLabel: record.customer_name,
      route: "/api/owner/borrowed-gallons",
      details: {
        qtyBorrowed: record.qty_borrowed,
        depositAmount: record.deposit_amount,
      },
      ...meta,
    });

    return NextResponse.json(
      { record },
      { status: 201, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return handleApiError(error, { route: "/api/owner/borrowed-gallons" });
  }
}

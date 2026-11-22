import { NextResponse } from "next/server";
import {
  extractRequestMeta,
  handleApiError,
  parseJsonBody,
} from "@/backend/lib/http";
import { scheduleActivityLog } from "@/backend/services/activity-logs";
import { requireOwnerAccess } from "@/backend/services/auth-guards";
import { returnBorrowedGallons } from "@/backend/services/cashier/inventory";

interface ReturnBorrowBody {
  qtyReturned?: unknown;
  businessDate?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { searchParams } = new URL(request.url);
    const { profile, tenantOwnerId } = await requireOwnerAccess(
      searchParams.get("station")
    );
    const { id } = await params;
    const body = await parseJsonBody<ReturnBorrowBody>(request);

    if (!body || !Number.isFinite(Number(body.qtyReturned))) {
      return NextResponse.json(
        { error: "Valid return quantity is required." },
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
      action: `Returned Borrowed Gallons (${Number(body.qtyReturned)} gal)`,
      controlLabel: "Return",
      targetType: "borrowed_gallon",
      targetId: record.id,
      targetLabel: record.customer_name,
      route: "/api/owner/borrowed-gallons/[id]/return",
      details: {
        qtyReturnedNow: Number(body.qtyReturned),
        totalReturned: record.qty_returned,
        qtyBorrowed: record.qty_borrowed,
      },
      ...meta,
    });

    return NextResponse.json(
      { record },
      { status: 200, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return handleApiError(error, {
      route: "/api/owner/borrowed-gallons/[id]/return",
    });
  }
}

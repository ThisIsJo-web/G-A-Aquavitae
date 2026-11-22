import { NextResponse } from "next/server";
import type {
  DeliveryPaymentMethod,
  DeliveryPaymentStatus,
} from "@/backend/db/types";
import {
  extractRequestMeta,
  handleApiError,
  parseJsonBody,
} from "@/backend/lib/http";
import { scheduleActivityLog } from "@/backend/services/activity-logs";
import { requireCashierAccess } from "@/backend/services/auth-guards";
import { updateDelivery } from "@/backend/services/cashier/deliveries";

interface PatchDeliveryBody {
  paymentStatus?: unknown;
  paymentMethod?: unknown;
  cancelled?: unknown;
  notes?: unknown;
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
    const body = await parseJsonBody<PatchDeliveryBody>(request);

    if (!body) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const canDirectCancel =
      profile.role === "owner" || profile.role === "superadmin";

    if (body.cancelled === true && !canDirectCancel) {
      return NextResponse.json(
        {
          error:
            "Cancelling a delivery requires Owner approval. Use 'Request Correction / Cancel' in the row menu.",
        },
        { status: 403 }
      );
    }

    const delivery = await updateDelivery(
      tenantOwnerId,
      id,
      {
        paymentStatus:
          body.paymentStatus === "paid" || body.paymentStatus === "unpaid"
            ? (body.paymentStatus as DeliveryPaymentStatus)
            : undefined,
        paymentMethod:
          body.paymentMethod === "cash" ||
          body.paymentMethod === "gcash" ||
          body.paymentMethod === "credit"
            ? (body.paymentMethod as DeliveryPaymentMethod)
            : undefined,
        cancelled: body.cancelled === true && canDirectCancel,
        notes: typeof body.notes === "string" ? body.notes : undefined,
      },
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
      module: "deliveries",
      action:
        body.cancelled === true
          ? `Cancelled Delivery (${delivery.customer_name})`
          : `Updated Delivery Payment (${delivery.customer_name})`,
      controlLabel:
        body.cancelled === true ? "Cancel Delivery" : "Mark Paid / Update",
      targetType: "delivery",
      targetId: delivery.id,
      targetLabel: `${delivery.customer_name} · ${delivery.destination}`,
      route: "/api/cashier/deliveries/[id]",
      ...meta,
    });

    return NextResponse.json(
      { delivery },
      { status: 200, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return handleApiError(error, { route: "/api/cashier/deliveries/[id]" });
  }
}

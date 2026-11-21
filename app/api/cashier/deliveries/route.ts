import { NextResponse } from "next/server";
import type {
  DeliveryOrderType,
  DeliveryPaymentMethod,
  DeliveryPaymentStatus,
} from "@/backend/db/types";
import { handleApiError, parseJsonBody } from "@/backend/lib/http";
import { requireCashierAccess } from "@/backend/services/auth-guards";
import {
  createDelivery,
  getDeliveriesOverview,
} from "@/backend/services/cashier/deliveries";

export async function GET(request: Request) {
  try {
    const { tenantOwnerId } = await requireCashierAccess();
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") ?? undefined;
    const overview = await getDeliveriesOverview(tenantOwnerId, date);

    return NextResponse.json(overview, {
      status: 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return handleApiError(error, { route: "/api/cashier/deliveries" });
  }
}

interface CreateDeliveryBody {
  customerId?: unknown;
  customerName?: unknown;
  customerPhone?: unknown;
  destination?: unknown;
  orderType?: unknown;
  quantity?: unknown;
  emptyGallonsReturned?: unknown;
  unitPrice?: unknown;
  deliveryFee?: unknown;
  paymentMethod?: unknown;
  paymentStatus?: unknown;
  deliveredBy?: unknown;
  notes?: unknown;
  saveAsRegularCustomer?: unknown;
  businessDate?: unknown;
}

export async function POST(request: Request) {
  try {
    const { profile, tenantOwnerId } = await requireCashierAccess();
    const body = await parseJsonBody<CreateDeliveryBody>(request);

    if (
      !body ||
      typeof body.customerName !== "string" ||
      !body.customerName.trim() ||
      typeof body.destination !== "string" ||
      !body.destination.trim()
    ) {
      return NextResponse.json(
        { error: "Customer name and area/place are required" },
        { status: 400 }
      );
    }

    const orderType: DeliveryOrderType =
      body.orderType === "gallon_with_water" ? "gallon_with_water" : "refill";
    const paymentMethod: DeliveryPaymentMethod =
      body.paymentMethod === "gcash" || body.paymentMethod === "credit"
        ? body.paymentMethod
        : "cash";
    const paymentStatus: DeliveryPaymentStatus =
      body.paymentStatus === "paid" ? "paid" : "unpaid";

    const qty = Number(body.quantity ?? 1);
    const emptyReturned =
      body.emptyGallonsReturned !== undefined &&
      body.emptyGallonsReturned !== ""
        ? Number(body.emptyGallonsReturned)
        : orderType === "refill"
          ? qty
          : 0;

    const delivery = await createDelivery(profile.id, tenantOwnerId, {
      customerId: typeof body.customerId === "string" ? body.customerId : null,
      customerName: body.customerName,
      customerPhone:
        typeof body.customerPhone === "string" ? body.customerPhone : undefined,
      destination: body.destination,
      orderType,
      quantity: qty,
      emptyGallonsReturned: emptyReturned,
      unitPrice:
        body.unitPrice !== undefined && body.unitPrice !== ""
          ? Number(body.unitPrice)
          : undefined,
      deliveryFee:
        body.deliveryFee !== undefined ? Number(body.deliveryFee) : 0,
      paymentMethod,
      paymentStatus,
      deliveredBy:
        typeof body.deliveredBy === "string" ? body.deliveredBy : undefined,
      notes: typeof body.notes === "string" ? body.notes : undefined,
      saveAsRegularCustomer: Boolean(body.saveAsRegularCustomer),
      businessDate:
        typeof body.businessDate === "string" ? body.businessDate : undefined,
    });

    return NextResponse.json(
      { delivery },
      { status: 201, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return handleApiError(error, { route: "/api/cashier/deliveries" });
  }
}

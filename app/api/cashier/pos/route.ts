import { NextResponse } from "next/server";
import type { PosPaymentMethod } from "@/backend/db/types";
import { handleApiError, parseJsonBody } from "@/backend/lib/http";
import { requireCashierAccess } from "@/backend/services/auth-guards";
import {
  createWalkInSale,
  listPosOverview,
} from "@/backend/services/cashier/pos";

const PAYMENT_METHODS = new Set<PosPaymentMethod>([
  "cash",
  "gcash",
  "bank",
  "utang",
]);

export async function GET(request: Request) {
  try {
    const { tenantOwnerId } = await requireCashierAccess();
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") ?? undefined;
    const overview = await listPosOverview(tenantOwnerId, date);

    return NextResponse.json(overview, {
      status: 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return handleApiError(error, { route: "/api/cashier/pos" });
  }
}

interface CreatePosSaleBody {
  items?: unknown;
  paymentMethod?: unknown;
  amountTendered?: unknown;
  discount?: unknown;
  customerName?: unknown;
  notes?: unknown;
  businessDate?: unknown;
}

export async function POST(request: Request) {
  try {
    const { profile, tenantOwnerId } = await requireCashierAccess();
    const body = await parseJsonBody<CreatePosSaleBody>(request);

    if (!body || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { error: "Cart items are required" },
        { status: 400 }
      );
    }

    const paymentMethod: PosPaymentMethod =
      typeof body.paymentMethod === "string" &&
      PAYMENT_METHODS.has(body.paymentMethod as PosPaymentMethod)
        ? (body.paymentMethod as PosPaymentMethod)
        : "cash";

    const items = body.items
      .filter(
        (item): item is { productId: string; quantity: number } =>
          Boolean(item) &&
          typeof (item as { productId?: unknown }).productId === "string" &&
          Number.isFinite(Number((item as { quantity?: unknown }).quantity))
      )
      .map((item) => ({
        productId: item.productId,
        quantity: Number(item.quantity),
      }));

    const sale = await createWalkInSale(profile.id, tenantOwnerId, {
      items,
      paymentMethod,
      amountTendered:
        body.amountTendered !== undefined
          ? Number(body.amountTendered)
          : undefined,
      discount: body.discount !== undefined ? Number(body.discount) : 0,
      customerName:
        typeof body.customerName === "string" ? body.customerName : undefined,
      notes: typeof body.notes === "string" ? body.notes : undefined,
      businessDate:
        typeof body.businessDate === "string" ? body.businessDate : undefined,
    });

    return NextResponse.json(
      { sale },
      { status: 201, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return handleApiError(error, { route: "/api/cashier/pos" });
  }
}

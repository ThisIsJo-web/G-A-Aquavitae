import { NextResponse } from "next/server";
import { handleApiError, parseJsonBody } from "@/backend/lib/http";
import { requireCashierAccess } from "@/backend/services/auth-guards";
import {
  createDeliveryCustomer,
  listDeliveryCustomers,
  updateDeliveryCustomer,
} from "@/backend/services/cashier/deliveries";

export async function GET() {
  try {
    const { tenantOwnerId } = await requireCashierAccess();
    const customers = await listDeliveryCustomers(tenantOwnerId);

    return NextResponse.json(
      { customers },
      { status: 200, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return handleApiError(error, { route: "/api/cashier/customers" });
  }
}

interface CreateCustomerBody {
  customerName?: unknown;
  area?: unknown;
  phone?: unknown;
  defaultUnitPrice?: unknown;
  notes?: unknown;
}

export async function POST(request: Request) {
  try {
    const { tenantOwnerId } = await requireCashierAccess();
    const body = await parseJsonBody<CreateCustomerBody>(request);

    if (
      !body ||
      typeof body.customerName !== "string" ||
      !body.customerName.trim() ||
      typeof body.area !== "string" ||
      !body.area.trim()
    ) {
      return NextResponse.json(
        { error: "Customer name and area are required" },
        { status: 400 }
      );
    }

    const customer = await createDeliveryCustomer(tenantOwnerId, {
      customerName: body.customerName,
      area: body.area,
      phone: typeof body.phone === "string" ? body.phone : undefined,
      defaultUnitPrice:
        body.defaultUnitPrice !== undefined && body.defaultUnitPrice !== ""
          ? Number(body.defaultUnitPrice)
          : undefined,
      notes: typeof body.notes === "string" ? body.notes : undefined,
    });

    return NextResponse.json(
      { customer },
      { status: 201, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return handleApiError(error, { route: "/api/cashier/customers" });
  }
}

interface UpdateCustomerBody {
  customerId?: unknown;
  customerName?: unknown;
  area?: unknown;
  phone?: unknown;
  defaultUnitPrice?: unknown;
  isActive?: unknown;
  notes?: unknown;
}

export async function PATCH(request: Request) {
  try {
    const { tenantOwnerId } = await requireCashierAccess();
    const body = await parseJsonBody<UpdateCustomerBody>(request);

    if (!body || typeof body.customerId !== "string") {
      return NextResponse.json(
        { error: "customerId is required" },
        { status: 400 }
      );
    }

    const customer = await updateDeliveryCustomer(
      tenantOwnerId,
      body.customerId,
      {
        customerName:
          typeof body.customerName === "string" ? body.customerName : undefined,
        area: typeof body.area === "string" ? body.area : undefined,
        phone:
          body.phone === null || typeof body.phone === "string"
            ? body.phone
            : undefined,
        defaultUnitPrice:
          body.defaultUnitPrice !== undefined && body.defaultUnitPrice !== ""
            ? Number(body.defaultUnitPrice)
            : undefined,
        isActive:
          typeof body.isActive === "boolean" ? body.isActive : undefined,
        notes:
          body.notes === null || typeof body.notes === "string"
            ? body.notes
            : undefined,
      }
    );

    return NextResponse.json(
      { customer },
      { status: 200, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return handleApiError(error, { route: "/api/cashier/customers" });
  }
}

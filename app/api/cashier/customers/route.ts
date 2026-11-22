import { NextResponse } from "next/server";
import {
  extractRequestMeta,
  handleApiError,
  parseJsonBody,
} from "@/backend/lib/http";
import { scheduleActivityLog } from "@/backend/services/activity-logs";
import { requireCashierAccess } from "@/backend/services/auth-guards";
import {
  createDeliveryCustomer,
  listDeliveryCustomers,
  updateDeliveryCustomer,
} from "@/backend/services/cashier/deliveries";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { tenantOwnerId } = await requireCashierAccess(
      searchParams.get("station")
    );
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
    const { searchParams } = new URL(request.url);
    const { profile, tenantOwnerId } = await requireCashierAccess(
      searchParams.get("station")
    );
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

    const meta = extractRequestMeta(request);
    scheduleActivityLog({
      actor: {
        id: profile.id,
        name: profile.full_name || profile.email,
        email: profile.email,
        role: profile.role,
      },
      stationOwnerId: tenantOwnerId,
      module: "customers",
      action: `Added Regular Customer (${customer.customer_name})`,
      controlLabel: "Add Regular Customer",
      targetType: "customer",
      targetId: customer.id,
      targetLabel: `${customer.customer_name} · ${customer.area}`,
      route: "/api/cashier/customers",
      ...meta,
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
    const { searchParams } = new URL(request.url);
    const { profile, tenantOwnerId } = await requireCashierAccess(
      searchParams.get("station")
    );
    const body = await parseJsonBody<UpdateCustomerBody>(request);

    if (!body || typeof body.customerId !== "string") {
      return NextResponse.json(
        { error: "Customer ID is required" },
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

    const meta = extractRequestMeta(request);
    scheduleActivityLog({
      actor: {
        id: profile.id,
        name: profile.full_name || profile.email,
        email: profile.email,
        role: profile.role,
      },
      stationOwnerId: tenantOwnerId,
      module: "customers",
      action: `Updated Regular Customer (${customer.customer_name})`,
      controlLabel: "Update Customer",
      targetType: "customer",
      targetId: customer.id,
      targetLabel: customer.customer_name,
      route: "/api/cashier/customers",
      ...meta,
    });

    return NextResponse.json(
      { customer },
      { status: 200, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return handleApiError(error, { route: "/api/cashier/customers" });
  }
}

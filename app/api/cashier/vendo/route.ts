import { NextResponse } from "next/server";
import {
  extractRequestMeta,
  handleApiError,
  parseJsonBody,
} from "@/backend/lib/http";
import { scheduleActivityLog } from "@/backend/services/activity-logs";
import { requireCashierAccess } from "@/backend/services/auth-guards";
import {
  createVendoCollection,
  getVendoOverview,
} from "@/backend/services/cashier/vendo";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { tenantOwnerId } = await requireCashierAccess(
      searchParams.get("station")
    );
    const date = searchParams.get("date") ?? undefined;
    const overview = await getVendoOverview(tenantOwnerId, date);

    return NextResponse.json(overview, {
      status: 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return handleApiError(error, { route: "/api/cashier/vendo" });
  }
}

interface CreateVendoBody {
  machineName?: unknown;
  collectionMonth?: unknown;
  amount?: unknown;
  meterStart?: unknown;
  meterEnd?: unknown;
  notes?: unknown;
  businessDate?: unknown;
}

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { profile, tenantOwnerId } = await requireCashierAccess(
      searchParams.get("station")
    );
    const body = await parseJsonBody<CreateVendoBody>(request);

    if (!body || !Number.isFinite(Number(body.amount))) {
      return NextResponse.json(
        { error: "Valid collection amount is required." },
        { status: 400 }
      );
    }

    const collection = await createVendoCollection(profile.id, tenantOwnerId, {
      machineName:
        typeof body.machineName === "string" ? body.machineName : undefined,
      collectionMonth:
        typeof body.collectionMonth === "string"
          ? body.collectionMonth
          : undefined,
      amount: Number(body.amount),
      meterStart:
        body.meterStart !== undefined && body.meterStart !== ""
          ? Number(body.meterStart)
          : null,
      meterEnd:
        body.meterEnd !== undefined && body.meterEnd !== ""
          ? Number(body.meterEnd)
          : null,
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
      module: "vendo",
      action: `Recorded Monthly Vendo Income (₱${collection.amount.toFixed(2)})`,
      controlLabel: "Save Monthly Vendo Income",
      targetType: "vendo",
      targetId: collection.id,
      targetLabel: `${collection.machine_name} (${collection.period_start.slice(0, 7)})`,
      route: "/api/cashier/vendo",
      ...meta,
    });

    return NextResponse.json(
      { collection },
      { status: 201, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return handleApiError(error, { route: "/api/cashier/vendo" });
  }
}

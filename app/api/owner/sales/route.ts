import { NextResponse } from "next/server";
import {
  extractRequestMeta,
  handleApiError,
  parseJsonBody,
} from "@/backend/lib/http";
import { scheduleActivityLog } from "@/backend/services/activity-logs";
import { requireOwnerAccess } from "@/backend/services/auth-guards";
import {
  deleteOwnerSalesBulk,
  type BulkDeleteSaleItem,
} from "@/backend/services/owner/dashboard";

interface BulkDeleteSalesBody {
  items?: unknown;
}

const VALID_CHANNELS = new Set(["walkin", "delivery", "vendo"]);

export async function DELETE(request: Request) {
  const body = await parseJsonBody<BulkDeleteSalesBody>(request);
  const rawItems = Array.isArray(body?.items) ? body.items : [];

  const items: BulkDeleteSaleItem[] = [];
  for (const entry of rawItems) {
    if (
      entry &&
      typeof entry === "object" &&
      typeof (entry as { id?: unknown }).id === "string" &&
      typeof (entry as { channel?: unknown }).channel === "string" &&
      VALID_CHANNELS.has((entry as { channel: string }).channel)
    ) {
      items.push({
        id: (entry as { id: string }).id,
        channel: (entry as { channel: "walkin" | "delivery" | "vendo" }).channel,
      });
    }
  }

  if (items.length === 0) {
    return NextResponse.json(
      { error: "Select at least one sale record to delete." },
      { status: 400 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const { profile, tenantOwnerId } = await requireOwnerAccess(
      searchParams.get("station")
    );

    const { deletedCount } = await deleteOwnerSalesBulk(
      tenantOwnerId,
      profile.id,
      items
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
      module: "pos",
      action: `Deleted ${deletedCount} Sales Record${deletedCount === 1 ? "" : "s"}`,
      controlLabel: "Confirm Delete",
      targetType: "sales_record",
      targetLabel: `${deletedCount} selected`,
      route: "/api/owner/sales",
      details: { deletedCount },
      ...meta,
    });

    return NextResponse.json({ deleted: true, deletedCount }, { status: 200 });
  } catch (error) {
    return handleApiError(error, { route: "/api/owner/sales" });
  }
}

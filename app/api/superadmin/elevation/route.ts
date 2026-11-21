import { NextResponse } from "next/server";
import { handleApiError, parseJsonBody } from "@/backend/lib/http";
import { requireSuperadmin } from "@/backend/services/auth-guards";
import {
  enrollSuperadminTotp,
  getSuperadminElevationStatus,
  getSuperadminTotpState,
  listAuditTargetAccounts,
  revokeSuperadminElevation,
  verifyAndElevateSuperadmin,
} from "@/backend/services/superadmin-elevation";

export async function GET() {
  try {
    const profile = await requireSuperadmin();
    const [elevation, totp, targets] = await Promise.all([
      getSuperadminElevationStatus(profile.id),
      getSuperadminTotpState(),
      listAuditTargetAccounts(),
    ]);

    return NextResponse.json(
      { elevation, totp, targets },
      { status: 200, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return handleApiError(error, { route: "/api/superadmin/elevation" });
  }
}

interface ElevationBody {
  action?: unknown;
  password?: unknown;
  totpCode?: unknown;
  factorId?: unknown;
  targetAccountId?: unknown;
  targetOwnerId?: unknown;
  reason?: unknown;
}

export async function POST(request: Request) {
  try {
    const profile = await requireSuperadmin();
    const body = await parseJsonBody<ElevationBody>(request);

    if (!body || typeof body.action !== "string") {
      return NextResponse.json(
        { error: "Action ('enroll' or 'verify') is required" },
        { status: 400 }
      );
    }

    if (body.action === "enroll") {
      const enrollment = await enrollSuperadminTotp();
      return NextResponse.json(
        { enrollment },
        { status: 200, headers: { "Cache-Control": "private, no-store" } }
      );
    }

    if (body.action === "verify") {
      const targetAccountId =
        typeof body.targetAccountId === "string"
          ? body.targetAccountId
          : typeof body.targetOwnerId === "string"
            ? body.targetOwnerId
            : "";

      if (
        typeof body.password !== "string" ||
        typeof body.totpCode !== "string" ||
        typeof body.factorId !== "string" ||
        !targetAccountId ||
        typeof body.reason !== "string"
      ) {
        return NextResponse.json(
          {
            error:
              "Password, 6-digit authenticator code, target cashier/owner account, and audit reason are all required",
          },
          { status: 400 }
        );
      }

      const elevation = await verifyAndElevateSuperadmin({
        superadminId: profile.id,
        superadminEmail: profile.email,
        password: body.password,
        totpCode: body.totpCode,
        factorId: body.factorId,
        targetAccountId,
        reason: body.reason,
      });

      return NextResponse.json(
        { elevation },
        { status: 200, headers: { "Cache-Control": "private, no-store" } }
      );
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    return handleApiError(error, { route: "/api/superadmin/elevation" });
  }
}

export async function DELETE() {
  try {
    const profile = await requireSuperadmin();
    await revokeSuperadminElevation(profile.id);
    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return handleApiError(error, { route: "/api/superadmin/elevation" });
  }
}

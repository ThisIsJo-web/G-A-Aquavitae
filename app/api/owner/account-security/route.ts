import { NextResponse } from "next/server";
import {
  extractRequestMeta,
  handleApiError,
  parseJsonBody,
} from "@/backend/lib/http";
import { scheduleActivityLog } from "@/backend/services/activity-logs";
import {
  getRequestProfile,
  updateOwnerCredentials,
} from "@/backend/services/users";

interface UpdateOwnerCredentialsBody {
  fullName?: unknown;
  newEmail?: unknown;
  newPassword?: unknown;
  currentPassword?: unknown;
}

export async function POST(request: Request) {
  const body = await parseJsonBody<UpdateOwnerCredentialsBody>(request);

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Valid account details are required." },
      { status: 400 }
    );
  }

  try {
    const session = await getRequestProfile();
    const result = await updateOwnerCredentials({
      fullName:
        typeof body.fullName === "string" ? body.fullName : undefined,
      newEmail:
        typeof body.newEmail === "string" ? body.newEmail : undefined,
      newPassword:
        typeof body.newPassword === "string" ? body.newPassword : undefined,
      currentPassword:
        typeof body.currentPassword === "string"
          ? body.currentPassword
          : undefined,
    });

    const meta = extractRequestMeta(request);
    scheduleActivityLog({
      actor: {
        id: session?.profile?.id ?? null,
        name: result.fullName || result.email,
        email: result.email,
        role: "owner",
      },
      stationOwnerId: session?.profile?.id ?? null,
      module: "accounts",
      action:
        "Owner updated personal account profile & security credentials (Account Secured)",
      controlLabel: "Save & Secure Account",
      targetType: "account",
      targetId: session?.profile?.id ?? null,
      targetLabel: result.email,
      route: "/api/owner/account-security",
      ...meta,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return handleApiError(error, { route: "/api/owner/account-security" });
  }
}

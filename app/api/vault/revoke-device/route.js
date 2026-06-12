import { NextResponse } from "next/server";
import {
  authorizeVaultRequest,
  vaultAuthFailureResponse,
} from "../../../lib/vaultAuth";
import { isVaultAdminConfigured, revokeVaultDevice } from "../../../lib/vaultAdmin";

export const dynamic = "force-dynamic";

function storageNotConfiguredResponse() {
  return NextResponse.json(
    {
      success: false,
      code: "STORAGE_NOT_CONFIGURED",
      error: "Vault storage is not configured. Set Supabase service role credentials.",
    },
    { status: 503 }
  );
}

export async function POST(req) {
  try {
    const bodyText = await req.text();
    const auth = await authorizeVaultRequest(req, {
      method: "POST",
      path: "/api/vault/revoke-device",
      bodyText,
    });

    if (!auth.ok) {
      const status = auth.code === "STORAGE_NOT_CONFIGURED" ? 503 : auth.status;
      return NextResponse.json(vaultAuthFailureResponse(auth), { status });
    }

    if (!isVaultAdminConfigured()) {
      return storageNotConfiguredResponse();
    }

    const result = await revokeVaultDevice(auth.vault_device_id);

    if (result.error) {
      return NextResponse.json(
        {
          success: false,
          code: "DEVICE_REVOKE_FAILED",
          error: result.error.message || "Unable to revoke vault device.",
        },
        { status: 502 }
      );
    }

    if (result.notFound) {
      return NextResponse.json(
        {
          success: false,
          code: "VAULT_DEVICE_NOT_REGISTERED",
          error: "Vault device is not registered.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      revoked: true,
      vault_device_id: result.registration?.vault_device_id || auth.vault_device_id,
      revoked_at: result.registration?.revoked_at || null,
    });
  } catch {
    return NextResponse.json(
      { success: false, code: "INVALID_REQUEST", error: "Invalid vault device revoke request." },
      { status: 400 }
    );
  }
}

import { NextResponse } from "next/server";
import {
  isVaultAdminConfigured,
  registerVaultDevice,
  vaultDeviceRegistered,
} from "../../../lib/vaultAdmin";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i;

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
    if (!isVaultAdminConfigured()) {
      return storageNotConfiguredResponse();
    }

    const bodyText = await req.text();
    const body = bodyText ? JSON.parse(bodyText) : {};
    const vaultDeviceId = String(body?.vault_device_id || "").trim();
    const authSecretHash = String(body?.auth_secret_hash || "").trim().toLowerCase();

    if (!UUID_PATTERN.test(vaultDeviceId)) {
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_REQUEST",
          error: "vault_device_id must be a valid UUID.",
        },
        { status: 400 }
      );
    }

    if (!SHA256_HEX_PATTERN.test(authSecretHash)) {
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_REQUEST",
          error: "auth_secret_hash must be a 64-character SHA-256 hex value.",
        },
        { status: 400 }
      );
    }

    const alreadyRegistered = await vaultDeviceRegistered(vaultDeviceId);
    if (alreadyRegistered) {
      return NextResponse.json(
        {
          success: false,
          code: "DEVICE_ALREADY_REGISTERED",
          error: "An active vault device registration already exists for this device id.",
        },
        { status: 409 }
      );
    }

    const { registration, error } = await registerVaultDevice({
      vaultDeviceId,
      authSecretHash,
      metadata: {
        registration_source: "prooforigin-vault-v0.2.5",
      },
    });

    if (error) {
      const isDuplicate = error.code === "23505";
      return NextResponse.json(
        {
          success: false,
          code: isDuplicate ? "DEVICE_ALREADY_REGISTERED" : "DEVICE_REGISTRATION_FAILED",
          error:
            error.message ||
            (isDuplicate
              ? "An active vault device registration already exists for this device id."
              : "Unable to register vault device."),
        },
        { status: isDuplicate ? 409 : 502 }
      );
    }

    return NextResponse.json({
      success: true,
      registration: {
        vault_device_id: registration.vault_device_id,
        device_public_id: registration.device_public_id,
        created_at: registration.created_at,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, code: "INVALID_REQUEST", error: "Invalid vault device registration request." },
      { status: 400 }
    );
  }
}

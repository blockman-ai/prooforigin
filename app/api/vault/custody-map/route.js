import { NextResponse } from "next/server";
import { authorizeVaultRequest, vaultAuthFailureResponse } from "../../../lib/vaultAuth";
import {
  getBoundVaultDeviceRegistration,
  hasVerifiedVaultOwnershipForDevice,
  isVaultAdminConfigured,
  listVaultCustodyDevices,
  listVaultCustodyDocuments,
  listVaultCustodyMigrations,
} from "../../../lib/vaultAdmin";
import { buildVaultCustodyMapSummary } from "../../../lib/vaultCustodyMap";

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

function upstreamErrorResponse(code, message, error) {
  return NextResponse.json(
    {
      success: false,
      code,
      error: error?.message || message,
    },
    { status: 502 }
  );
}

export async function GET(req) {
  try {
    const auth = await authorizeVaultRequest(req, {
      method: "GET",
      path: "/api/vault/custody-map",
      bodyText: "",
    });

    if (!auth.ok) {
      const status = auth.code === "STORAGE_NOT_CONFIGURED" ? 503 : auth.status;
      return NextResponse.json(vaultAuthFailureResponse(auth), { status });
    }

    if (!isVaultAdminConfigured()) {
      return storageNotConfiguredResponse();
    }

    const { registration, error: registrationError } = await getBoundVaultDeviceRegistration(
      auth.vault_device_id
    );
    if (registrationError) {
      return upstreamErrorResponse(
        "CUSTODY_MAP_BINDING_LOOKUP_FAILED",
        "Unable to determine vault custody scope.",
        registrationError
      );
    }

    if (!registration?.vault_id) {
      return NextResponse.json(
        {
          success: false,
          code: "VAULT_DEVICE_NOT_BOUND",
          error: "A bound vault device is required before loading the custody map.",
        },
        { status: 403 }
      );
    }

    const { verified, error: verifyError } = await hasVerifiedVaultOwnershipForDevice({
      vaultId: registration.vault_id,
      vaultDeviceId: auth.vault_device_id,
    });
    if (verifyError) {
      return upstreamErrorResponse(
        "CUSTODY_MAP_VERIFY_LOOKUP_FAILED",
        "Unable to determine ownership verification state.",
        verifyError
      );
    }

    if (!verified) {
      return NextResponse.json(
        {
          success: false,
          code: "OWNERSHIP_VERIFICATION_REQUIRED",
          error: "Vault ownership verification is required before loading the custody map.",
        },
        { status: 403 }
      );
    }

    const [devicesResult, documentsResult, migrationsResult] = await Promise.all([
      listVaultCustodyDevices(registration.vault_id),
      listVaultCustodyDocuments(registration.vault_id),
      listVaultCustodyMigrations(registration.vault_id),
    ]);

    if (devicesResult.error) {
      return upstreamErrorResponse(
        "CUSTODY_MAP_DEVICE_LOOKUP_FAILED",
        "Unable to load custody device summary.",
        devicesResult.error
      );
    }
    if (documentsResult.error) {
      return upstreamErrorResponse(
        "CUSTODY_MAP_DOCUMENT_LOOKUP_FAILED",
        "Unable to load custody document summary.",
        documentsResult.error
      );
    }
    if (migrationsResult.error) {
      return upstreamErrorResponse(
        "CUSTODY_MAP_MIGRATION_LOOKUP_FAILED",
        "Unable to load custody migration summary.",
        migrationsResult.error
      );
    }

    return NextResponse.json({
      success: true,
      ...buildVaultCustodyMapSummary({
        vaultId: registration.vault_id,
        currentVaultDeviceId: auth.vault_device_id,
        devices: devicesResult.devices,
        documents: documentsResult.documents,
        migrations: migrationsResult.migrations,
      }),
    });
  } catch {
    return NextResponse.json(
      { success: false, code: "INVALID_REQUEST", error: "Invalid custody map request." },
      { status: 400 }
    );
  }
}

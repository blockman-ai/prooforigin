import { NextResponse } from "next/server";
import { authorizeVaultRequest, vaultAuthFailureResponse } from "../../../lib/vaultAuth";
import {
  getBoundVaultDeviceRegistration,
  hasVerifiedVaultOwnershipForDevice,
  isVaultAdminConfigured,
  listVaultCustodyDevices,
  listVaultCustodyDocumentStateEvents,
  listVaultCustodyDocumentsForTimeline,
  listVaultCustodyMigrations,
  listVaultCustodyOwnershipVerifications,
} from "../../../lib/vaultAdmin";
import { buildVaultSentinelCustodyIntelligence } from "../../../lib/vaultSentinelCustodyIntelligence";

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

function upstreamErrorResponse(code, message) {
  return NextResponse.json(
    {
      success: false,
      code,
      error: message,
    },
    { status: 502 }
  );
}

export async function GET(req) {
  try {
    const auth = await authorizeVaultRequest(req, {
      method: "GET",
      path: "/api/vault/custody-intelligence",
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
        "CUSTODY_INTELLIGENCE_BINDING_LOOKUP_FAILED",
        "Unable to determine vault custody scope."
      );
    }

    if (!registration?.vault_id) {
      return NextResponse.json(
        {
          success: false,
          code: "VAULT_DEVICE_NOT_BOUND",
          error: "A bound vault device is required before loading custody intelligence.",
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
        "CUSTODY_INTELLIGENCE_VERIFY_LOOKUP_FAILED",
        "Unable to determine ownership verification state."
      );
    }

    if (!verified) {
      return NextResponse.json(
        {
          success: false,
          code: "OWNERSHIP_VERIFICATION_REQUIRED",
          error: "Vault ownership verification is required before loading custody intelligence.",
        },
        { status: 403 }
      );
    }

    const vaultId = registration.vault_id;
    const [
      devicesResult,
      documentsResult,
      migrationsResult,
      documentEventsResult,
      verificationsResult,
    ] = await Promise.all([
      listVaultCustodyDevices(vaultId),
      listVaultCustodyDocumentsForTimeline(vaultId),
      listVaultCustodyMigrations(vaultId),
      listVaultCustodyDocumentStateEvents(vaultId),
      listVaultCustodyOwnershipVerifications(vaultId),
    ]);

    if (devicesResult.error) {
      return upstreamErrorResponse(
        "CUSTODY_INTELLIGENCE_DEVICE_LOOKUP_FAILED",
        "Unable to load custody device intelligence."
      );
    }
    if (documentsResult.error) {
      return upstreamErrorResponse(
        "CUSTODY_INTELLIGENCE_DOCUMENT_LOOKUP_FAILED",
        "Unable to load custody document intelligence."
      );
    }
    if (migrationsResult.error) {
      return upstreamErrorResponse(
        "CUSTODY_INTELLIGENCE_MIGRATION_LOOKUP_FAILED",
        "Unable to load custody migration intelligence."
      );
    }
    if (documentEventsResult.error) {
      return upstreamErrorResponse(
        "CUSTODY_INTELLIGENCE_EVENT_LOOKUP_FAILED",
        "Unable to load custody document events."
      );
    }
    if (verificationsResult.error) {
      return upstreamErrorResponse(
        "CUSTODY_INTELLIGENCE_OWNERSHIP_LOOKUP_FAILED",
        "Unable to load ownership verification intelligence."
      );
    }

    return NextResponse.json({
      success: true,
      ...buildVaultSentinelCustodyIntelligence({
        vaultId,
        devices: devicesResult.devices,
        documents: documentsResult.documents,
        migrations: migrationsResult.migrations,
        documentStateEvents: documentEventsResult.events,
        ownershipVerifications: verificationsResult.verifications,
      }),
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        code: "INVALID_REQUEST",
        error: "Invalid custody intelligence request.",
      },
      { status: 400 }
    );
  }
}

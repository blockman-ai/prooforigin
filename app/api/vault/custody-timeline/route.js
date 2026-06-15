import { NextResponse } from "next/server";
import { authorizeVaultRequest, vaultAuthFailureResponse } from "../../../lib/vaultAuth";
import {
  getBoundVaultDeviceRegistration,
  getVaultOwnershipKey,
  hasVerifiedVaultOwnershipForDevice,
  isVaultAdminConfigured,
  listVaultCustodyDevices,
  listVaultCustodyDocumentStateEvents,
  listVaultCustodyDocumentsForTimeline,
  listVaultCustodyMigrations,
  listVaultCustodyOwnershipVerifications,
} from "../../../lib/vaultAdmin";
import { buildVaultCustodyTimeline, normalizeTimelineLimit } from "../../../lib/vaultCustodyTimeline";

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

function parseTimelineLimit(req) {
  const url = new URL(req.url);
  return normalizeTimelineLimit(url.searchParams.get("limit"));
}

export async function GET(req) {
  try {
    const auth = await authorizeVaultRequest(req, {
      method: "GET",
      path: "/api/vault/custody-timeline",
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
        "CUSTODY_TIMELINE_BINDING_LOOKUP_FAILED",
        "Unable to determine vault custody scope."
      );
    }

    if (!registration?.vault_id) {
      return NextResponse.json(
        {
          success: false,
          code: "VAULT_DEVICE_NOT_BOUND",
          error: "A bound vault device is required before loading the custody timeline.",
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
        "CUSTODY_TIMELINE_VERIFY_LOOKUP_FAILED",
        "Unable to determine ownership verification state."
      );
    }

    if (!verified) {
      return NextResponse.json(
        {
          success: false,
          code: "OWNERSHIP_VERIFICATION_REQUIRED",
          error: "Vault ownership verification is required before loading the custody timeline.",
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
      ownershipKeyResult,
    ] = await Promise.all([
      listVaultCustodyDevices(vaultId),
      listVaultCustodyDocumentsForTimeline(vaultId),
      listVaultCustodyMigrations(vaultId),
      listVaultCustodyDocumentStateEvents(vaultId),
      listVaultCustodyOwnershipVerifications(vaultId),
      getVaultOwnershipKey(vaultId),
    ]);

    if (devicesResult.error) {
      return upstreamErrorResponse(
        "CUSTODY_TIMELINE_DEVICE_LOOKUP_FAILED",
        "Unable to load custody device timeline."
      );
    }
    if (documentsResult.error) {
      return upstreamErrorResponse(
        "CUSTODY_TIMELINE_DOCUMENT_LOOKUP_FAILED",
        "Unable to load custody document timeline."
      );
    }
    if (migrationsResult.error) {
      return upstreamErrorResponse(
        "CUSTODY_TIMELINE_MIGRATION_LOOKUP_FAILED",
        "Unable to load custody migration timeline."
      );
    }
    if (documentEventsResult.error) {
      return upstreamErrorResponse(
        "CUSTODY_TIMELINE_EVENT_LOOKUP_FAILED",
        "Unable to load custody document events."
      );
    }
    if (verificationsResult.error) {
      return upstreamErrorResponse(
        "CUSTODY_TIMELINE_OWNERSHIP_LOOKUP_FAILED",
        "Unable to load ownership verification timeline."
      );
    }
    if (ownershipKeyResult.error) {
      return upstreamErrorResponse(
        "CUSTODY_TIMELINE_OWNERSHIP_KEY_LOOKUP_FAILED",
        "Unable to load ownership key timeline."
      );
    }

    return NextResponse.json({
      success: true,
      ...buildVaultCustodyTimeline({
        vaultId,
        currentVaultDeviceId: auth.vault_device_id,
        devices: devicesResult.devices,
        documents: documentsResult.documents,
        migrations: migrationsResult.migrations,
        documentStateEvents: documentEventsResult.events,
        ownershipVerifications: verificationsResult.verifications,
        ownershipKey: ownershipKeyResult.ownershipKey,
        limit: parseTimelineLimit(req),
      }),
    });
  } catch {
    return NextResponse.json(
      { success: false, code: "INVALID_REQUEST", error: "Invalid custody timeline request." },
      { status: 400 }
    );
  }
}

import { NextResponse } from "next/server";
import {
  authorizeVaultRequest,
  isVaultDocumentCompromised,
  vaultAuthFailureResponse,
} from "../../../../lib/vaultAuth";
import {
  createVaultSignedDownloadUrl,
  getBoundVaultDeviceRegistration,
  getVaultDocumentById,
  getVaultDocumentMigrationById,
  hasVerifiedVaultOwnershipForDevice,
  isVaultAdminConfigured,
  VAULT_ALLOWED_ENCRYPTION_VERSIONS,
  VAULT_DOCUMENT_AAD_VERSION_LEGACY,
  VAULT_DOCUMENT_AAD_VERSION_VAULT_SCOPED,
} from "../../../../lib/vaultAdmin";
import { VAULT_DOCUMENT_MIGRATION_STATES } from "../../../../lib/vaultDocumentMigration";
import {
  recordVaultMigrationExecutionSentinelCounter,
  VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS,
} from "../../../../lib/vaultMigrationExecutionSentinelCounters";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_SOURCE_STATES = new Set([
  VAULT_DOCUMENT_MIGRATION_STATES.PENDING,
  VAULT_DOCUMENT_MIGRATION_STATES.UPLOADING,
]);

function normalizeUuid(value, name) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error(`${name} must be a valid UUID.`);
  }
  return normalized;
}

function parseSourceRequest(bodyText) {
  const body = bodyText ? JSON.parse(bodyText) : {};
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Request body must be a JSON object.");
  }
  return {
    migrationId: normalizeUuid(body.migration_id, "migration_id"),
    sourceDocumentId: normalizeUuid(body.source_document_id, "source_document_id"),
  };
}

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

function assertEligibleSourceDocument(document) {
  if (document.deleted_at) {
    return { ok: false, status: 409, code: "SOURCE_DOCUMENT_DELETED" };
  }
  if (isVaultDocumentCompromised(document)) {
    return { ok: false, status: 423, code: "SOURCE_DOCUMENT_COMPROMISED" };
  }
  if (document.aad_version === VAULT_DOCUMENT_AAD_VERSION_VAULT_SCOPED) {
    return { ok: false, status: 409, code: "SOURCE_AAD_V3_NOT_ELIGIBLE" };
  }
  if (document.aad_version !== VAULT_DOCUMENT_AAD_VERSION_LEGACY) {
    return { ok: false, status: 409, code: "SOURCE_AAD_VERSION_UNSUPPORTED" };
  }
  if (!VAULT_ALLOWED_ENCRYPTION_VERSIONS.includes(document.encryption_version)) {
    return { ok: false, status: 409, code: "SOURCE_ENCRYPTION_VERSION_UNSUPPORTED" };
  }
  if (document.encryption_version === 1) {
    return { ok: false, status: 409, code: "SOURCE_LEGACY_ENCRYPTION_NOT_SUPPORTED" };
  }
  return { ok: true };
}

export async function POST(req) {
  recordVaultMigrationExecutionSentinelCounter(
    VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.SOURCE_URL_REQUEST_TOTAL
  );

  try {
    const bodyText = await req.text();
    const auth = await authorizeVaultRequest(req, {
      method: "POST",
      path: "/api/vault/document-migration/source-url",
      bodyText,
    });
    if (!auth.ok) {
      const status = auth.code === "STORAGE_NOT_CONFIGURED" ? 503 : auth.status;
      return NextResponse.json(vaultAuthFailureResponse(auth), { status });
    }

    if (!isVaultAdminConfigured()) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.ERROR_TOTAL
      );
      return storageNotConfiguredResponse();
    }

    const { migrationId, sourceDocumentId } = parseSourceRequest(bodyText);

    const { registration, error: registrationError } = await getBoundVaultDeviceRegistration(
      auth.vault_device_id
    );
    if (registrationError) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.ERROR_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "MIGRATION_SOURCE_BINDING_LOOKUP_FAILED",
          error: registrationError.message || "Unable to determine vault migration scope.",
        },
        { status: 502 }
      );
    }
    if (!registration?.vault_id) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.SOURCE_URL_REJECTED_TOTAL
      );
      return NextResponse.json(
        { success: false, code: "VAULT_DEVICE_NOT_BOUND", error: "Bound device required." },
        { status: 403 }
      );
    }

    const { verified, error: verifyError } = await hasVerifiedVaultOwnershipForDevice({
      vaultId: registration.vault_id,
      vaultDeviceId: auth.vault_device_id,
    });
    if (verifyError) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.ERROR_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "MIGRATION_SOURCE_VERIFY_LOOKUP_FAILED",
          error: verifyError.message || "Unable to determine ownership verification state.",
        },
        { status: 502 }
      );
    }
    if (!verified) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.SOURCE_URL_REJECTED_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "OWNERSHIP_VERIFICATION_REQUIRED",
          error: "Vault ownership verification is required before migration retrieval.",
        },
        { status: 403 }
      );
    }

    const { migration, error: migrationError } = await getVaultDocumentMigrationById(migrationId);
    if (migrationError) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.ERROR_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "MIGRATION_SOURCE_LOOKUP_FAILED",
          error: migrationError.message || "Unable to load migration record.",
        },
        { status: 502 }
      );
    }
    if (!migration) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.SOURCE_URL_REJECTED_TOTAL
      );
      return NextResponse.json(
        { success: false, code: "MIGRATION_NOT_FOUND", error: "Migration not found." },
        { status: 404 }
      );
    }
    if (!ALLOWED_SOURCE_STATES.has(migration.state)) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.SOURCE_URL_REJECTED_TOTAL
      );
      return NextResponse.json(
        { success: false, code: "MIGRATION_STATE_INVALID", error: "Migration state is not retrievable." },
        { status: 409 }
      );
    }
    if (
      migration.vault_id !== registration.vault_id ||
      migration.target_vault_device_id !== auth.vault_device_id ||
      migration.source_document_id !== sourceDocumentId
    ) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.SOURCE_URL_REJECTED_TOTAL
      );
      return NextResponse.json(
        { success: false, code: "MIGRATION_SCOPE_MISMATCH", error: "Migration scope mismatch." },
        { status: 403 }
      );
    }

    const { document: sourceDocument, error: sourceError } = await getVaultDocumentById(
      sourceDocumentId,
      { includeLabelEnvelope: true }
    );
    if (sourceError) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.ERROR_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "SOURCE_DOCUMENT_LOOKUP_FAILED",
          error: sourceError.message || "Unable to load source document.",
        },
        { status: 502 }
      );
    }
    if (
      !sourceDocument ||
      sourceDocument.vault_id !== migration.vault_id ||
      sourceDocument.vault_device_id !== migration.source_vault_device_id
    ) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.SOURCE_URL_REJECTED_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "SOURCE_DOCUMENT_SCOPE_MISMATCH",
          error: "Source document does not match migration scope.",
        },
        { status: 403 }
      );
    }

    const eligibility = assertEligibleSourceDocument(sourceDocument);
    if (!eligibility.ok) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.SOURCE_URL_REJECTED_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: eligibility.code,
          error: "Source document is not eligible for migration retrieval.",
        },
        { status: eligibility.status }
      );
    }

    const download = await createVaultSignedDownloadUrl(sourceDocument.storage_path);
    if (download.error || !download.signedUrl) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.ERROR_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "SOURCE_DOWNLOAD_URL_FAILED",
          error: download.error?.message || "Unable to create source download URL.",
        },
        { status: 502 }
      );
    }

    recordVaultMigrationExecutionSentinelCounter(
      VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.SOURCE_URL_ISSUED_TOTAL
    );
    return NextResponse.json({
      success: true,
      migration_id: migration.id,
      source_document_id: sourceDocument.id,
      source: {
        vault_id: sourceDocument.vault_id,
        vault_device_id: sourceDocument.vault_device_id,
        aad_version: sourceDocument.aad_version,
        encryption_version: sourceDocument.encryption_version,
        content_type: sourceDocument.content_type_hint,
        ciphertext_sha256: sourceDocument.ciphertext_sha256,
        ciphertext_bytes: sourceDocument.ciphertext_bytes,
        label_present: sourceDocument.label_present,
        label:
          sourceDocument.label_ciphertext && sourceDocument.label_iv
            ? {
                label_ciphertext: sourceDocument.label_ciphertext,
                label_iv: sourceDocument.label_iv,
              }
            : null,
      },
      signedUrl: download.signedUrl,
      expiresIn: download.expiresIn,
    });
  } catch {
    recordVaultMigrationExecutionSentinelCounter(
      VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.ERROR_TOTAL
    );
    return NextResponse.json(
      { success: false, code: "INVALID_REQUEST", error: "Invalid migration source retrieval request." },
      { status: 400 }
    );
  }
}

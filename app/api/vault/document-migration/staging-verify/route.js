import { NextResponse } from "next/server";
import {
  authorizeVaultRequest,
  isVaultDocumentCompromised,
  vaultAuthFailureResponse,
} from "../../../../lib/vaultAuth";
import {
  getBoundVaultDeviceRegistration,
  getVaultDocumentById,
  getVaultDocumentMigrationById,
  hasVerifiedVaultOwnershipForDevice,
  isVaultAdminConfigured,
  markVaultDocumentMigrationStagingVerified,
  verifyVaultCiphertextObject,
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
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i;
const CONTENT_TYPE_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;

function normalizeUuid(value, name) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error(`${name} must be a valid UUID.`);
  }
  return normalized;
}

function normalizeSha256(value, name) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!SHA256_HEX_PATTERN.test(normalized)) {
    throw new Error(`${name} must be a valid sha256 hex string.`);
  }
  return normalized;
}

function normalizeContentType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!CONTENT_TYPE_PATTERN.test(normalized)) {
    throw new Error("content_type must be a valid MIME type.");
  }
  return normalized;
}

function normalizePositiveInt(value, name) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric) || numeric <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return numeric;
}

function normalizeOptionalLabelEnvelope(body) {
  const labelCiphertext =
    body.target_label_ciphertext === undefined || body.target_label_ciphertext === null
      ? null
      : String(body.target_label_ciphertext).trim();
  const labelIv =
    body.target_label_iv === undefined || body.target_label_iv === null
      ? null
      : String(body.target_label_iv).trim();

  if (!labelCiphertext && !labelIv) {
    return { targetLabelCiphertext: null, targetLabelIv: null };
  }
  if (!labelCiphertext || !labelIv) {
    throw new Error("target label envelope must include ciphertext and iv.");
  }

  return { targetLabelCiphertext: labelCiphertext, targetLabelIv: labelIv };
}

function parseVerifyRequest(bodyText) {
  const body = bodyText ? JSON.parse(bodyText) : {};
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Request body must be a JSON object.");
  }
  const aadVersion = Number(body.aad_version);
  if (aadVersion !== VAULT_DOCUMENT_AAD_VERSION_VAULT_SCOPED) {
    throw new Error("aad_version must be 3.");
  }
  return {
    migrationId: normalizeUuid(body.migration_id, "migration_id"),
    sourceDocumentId: normalizeUuid(body.source_document_id, "source_document_id"),
    targetDocumentId: normalizeUuid(body.target_document_id, "target_document_id"),
    ciphertextSha256: normalizeSha256(body.ciphertext_sha256, "ciphertext_sha256"),
    ciphertextBytes: normalizePositiveInt(body.ciphertext_bytes, "ciphertext_bytes"),
    contentType: normalizeContentType(body.content_type),
    aadVersion,
    ...normalizeOptionalLabelEnvelope(body),
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

export async function POST(req) {
  recordVaultMigrationExecutionSentinelCounter(
    VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.STAGING_VERIFY_REQUEST_TOTAL
  );

  try {
    const bodyText = await req.text();
    const auth = await authorizeVaultRequest(req, {
      method: "POST",
      path: "/api/vault/document-migration/staging-verify",
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

    const parsed = parseVerifyRequest(bodyText);

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
          code: "MIGRATION_STAGING_VERIFY_BINDING_LOOKUP_FAILED",
          error: registrationError.message || "Unable to determine vault migration scope.",
        },
        { status: 502 }
      );
    }
    if (!registration?.vault_id) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.STAGING_VERIFY_FAILED_TOTAL
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
          code: "MIGRATION_STAGING_VERIFY_OWNERSHIP_LOOKUP_FAILED",
          error: verifyError.message || "Unable to determine ownership verification state.",
        },
        { status: 502 }
      );
    }
    if (!verified) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.STAGING_VERIFY_FAILED_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "OWNERSHIP_VERIFICATION_REQUIRED",
          error: "Vault ownership verification is required before staging verification.",
        },
        { status: 403 }
      );
    }

    const { migration, error: migrationError } = await getVaultDocumentMigrationById(
      parsed.migrationId
    );
    if (migrationError) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.ERROR_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "MIGRATION_STAGING_VERIFY_LOOKUP_FAILED",
          error: migrationError.message || "Unable to load migration record.",
        },
        { status: 502 }
      );
    }
    if (!migration) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.STAGING_VERIFY_FAILED_TOTAL
      );
      return NextResponse.json(
        { success: false, code: "MIGRATION_NOT_FOUND", error: "Migration not found." },
        { status: 404 }
      );
    }
    if (migration.state !== VAULT_DOCUMENT_MIGRATION_STATES.UPLOADING) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.STAGING_VERIFY_FAILED_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "MIGRATION_STATE_INVALID",
          error: "Migration is not in uploading state.",
        },
        { status: 409 }
      );
    }
    if (
      migration.vault_id !== registration.vault_id ||
      migration.target_vault_device_id !== auth.vault_device_id ||
      migration.source_document_id !== parsed.sourceDocumentId
    ) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.STAGING_VERIFY_FAILED_TOTAL
      );
      return NextResponse.json(
        { success: false, code: "MIGRATION_SCOPE_MISMATCH", error: "Migration scope mismatch." },
        { status: 403 }
      );
    }
    if (migration.target_document_id !== parsed.targetDocumentId) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.STAGING_VERIFY_FAILED_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "TARGET_DOCUMENT_ID_MISMATCH",
          error: "Target document id does not match migration record.",
        },
        { status: 409 }
      );
    }

    const { document: sourceDocument, error: sourceError } = await getVaultDocumentById(
      parsed.sourceDocumentId,
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
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.STAGING_VERIFY_FAILED_TOTAL
      );
      return NextResponse.json(
        { success: false, code: "SOURCE_DOCUMENT_SCOPE_MISMATCH", error: "Source document mismatch." },
        { status: 403 }
      );
    }
    if (sourceDocument.deleted_at) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.STAGING_VERIFY_FAILED_TOTAL
      );
      return NextResponse.json(
        { success: false, code: "SOURCE_DOCUMENT_DELETED", error: "Source document is deleted." },
        { status: 409 }
      );
    }
    if (isVaultDocumentCompromised(sourceDocument)) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.STAGING_VERIFY_FAILED_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "SOURCE_DOCUMENT_COMPROMISED",
          error: "Source document is compromised.",
        },
        { status: 423 }
      );
    }
    if (sourceDocument.label_present && (!parsed.targetLabelCiphertext || !parsed.targetLabelIv)) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.STAGING_VERIFY_FAILED_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "SOURCE_LABEL_REENCRYPTION_REQUIRED",
          error: "Source label must be re-encrypted for the target document before verification.",
        },
        { status: 409 }
      );
    }
    if (
      parsed.targetLabelCiphertext &&
      (parsed.targetLabelCiphertext === sourceDocument.label_ciphertext ||
        parsed.targetLabelIv === sourceDocument.label_iv)
    ) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.STAGING_VERIFY_FAILED_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "SOURCE_LABEL_REUSE_REJECTED",
          error: "Target label envelope must be re-encrypted and must not reuse source label ciphertext.",
        },
        { status: 409 }
      );
    }

    const stagingStoragePath = migration.metadata?.staging_storage_path;
    if (!stagingStoragePath) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.STAGING_VERIFY_FAILED_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "MIGRATION_STAGING_PATH_MISSING",
          error: "Migration staging path is missing.",
        },
        { status: 409 }
      );
    }

    const storageVerification = await verifyVaultCiphertextObject({
      storagePath: stagingStoragePath,
      expectedSha256: parsed.ciphertextSha256,
      expectedBytes: parsed.ciphertextBytes,
    });
    if (!storageVerification.ok) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.STAGING_VERIFY_FAILED_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: storageVerification.code || "MIGRATION_STAGING_VERIFY_FAILED",
          error: storageVerification.error || "Staging object verification failed.",
        },
        { status: 409 }
      );
    }

    const { migration: verifiedMigration, error: markError } =
      await markVaultDocumentMigrationStagingVerified({
        migrationId: migration.id,
        targetDocumentId: parsed.targetDocumentId,
        stagingCiphertextSha256: parsed.ciphertextSha256,
        stagingCiphertextBytes: parsed.ciphertextBytes,
        stagingContentType: parsed.contentType,
        aadVersion: parsed.aadVersion,
        targetLabelCiphertext: parsed.targetLabelCiphertext,
        targetLabelIv: parsed.targetLabelIv,
        sourceLabelPresent: sourceDocument.label_present,
      });
    if (markError || !verifiedMigration) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.ERROR_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "MIGRATION_STAGING_VERIFY_PERSIST_FAILED",
          error: markError?.message || "Unable to persist staging verification metadata.",
        },
        { status: 502 }
      );
    }

    recordVaultMigrationExecutionSentinelCounter(
      VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.STAGING_VERIFY_SUCCESS_TOTAL
    );
    return NextResponse.json({
      success: true,
      migration_id: verifiedMigration.id,
      state: verifiedMigration.state,
      target_document_id: verifiedMigration.target_document_id,
      staging_verified: Boolean(verifiedMigration.metadata?.staging_verified),
      staging_verified_at: verifiedMigration.metadata?.staging_verified_at || null,
      target_label_preserved: Boolean(verifiedMigration.metadata?.target_label_preserved),
    });
  } catch {
    recordVaultMigrationExecutionSentinelCounter(
      VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.ERROR_TOTAL
    );
    return NextResponse.json(
      {
        success: false,
        code: "INVALID_REQUEST",
        error: "Invalid migration staging verification request.",
      },
      { status: 400 }
    );
  }
}

import crypto from "crypto";
import { NextResponse } from "next/server";
import {
  authorizeVaultRequest,
  isVaultDocumentCompromised,
  vaultAuthFailureResponse,
} from "../../../../lib/vaultAuth";
import {
  createVaultSignedUploadUrlForStoragePath,
  getBoundVaultDeviceRegistration,
  getVaultDocumentById,
  getVaultDocumentMigrationById,
  hasVerifiedVaultOwnershipForDevice,
  isVaultAdminConfigured,
  startVaultDocumentMigrationUpload,
  VAULT_DOCUMENT_AAD_VERSION_VAULT_SCOPED,
  VAULT_SIGNED_URL_TTL_SECONDS,
} from "../../../../lib/vaultAdmin";
import {
  VAULT_DOCUMENT_MIGRATION_STATES,
  VAULT_DOCUMENT_MIGRATION_TARGET_DOC_ID_POLICY,
} from "../../../../lib/vaultDocumentMigration";
import {
  recordVaultMigrationExecutionSentinelCounter,
  VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS,
} from "../../../../lib/vaultMigrationExecutionSentinelCounters";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTENT_TYPE_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;

function normalizeUuid(value, name) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error(`${name} must be a valid UUID.`);
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

function parseUploadUrlRequest(bodyText) {
  const body = bodyText ? JSON.parse(bodyText) : {};
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Request body must be a JSON object.");
  }
  return {
    migrationId: normalizeUuid(body.migration_id, "migration_id"),
    sourceDocumentId: normalizeUuid(body.source_document_id, "source_document_id"),
    contentType: normalizeContentType(body.content_type),
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
    VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.STAGING_UPLOAD_REQUEST_TOTAL
  );

  try {
    const bodyText = await req.text();
    const auth = await authorizeVaultRequest(req, {
      method: "POST",
      path: "/api/vault/document-migration/staging-upload-url",
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

    const { migrationId, sourceDocumentId, contentType } = parseUploadUrlRequest(bodyText);

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
          code: "MIGRATION_STAGING_BINDING_LOOKUP_FAILED",
          error: registrationError.message || "Unable to determine vault migration scope.",
        },
        { status: 502 }
      );
    }
    if (!registration?.vault_id) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.STAGING_UPLOAD_REJECTED_TOTAL
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
          code: "MIGRATION_STAGING_VERIFY_LOOKUP_FAILED",
          error: verifyError.message || "Unable to determine ownership verification state.",
        },
        { status: 502 }
      );
    }
    if (!verified) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.STAGING_UPLOAD_REJECTED_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "OWNERSHIP_VERIFICATION_REQUIRED",
          error: "Vault ownership verification is required before staging upload.",
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
          code: "MIGRATION_STAGING_LOOKUP_FAILED",
          error: migrationError.message || "Unable to load migration record.",
        },
        { status: 502 }
      );
    }
    if (!migration) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.STAGING_UPLOAD_REJECTED_TOTAL
      );
      return NextResponse.json(
        { success: false, code: "MIGRATION_NOT_FOUND", error: "Migration not found." },
        { status: 404 }
      );
    }
    if (
      migration.vault_id !== registration.vault_id ||
      migration.target_vault_device_id !== auth.vault_device_id ||
      migration.source_document_id !== sourceDocumentId
    ) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.STAGING_UPLOAD_REJECTED_TOTAL
      );
      return NextResponse.json(
        { success: false, code: "MIGRATION_SCOPE_MISMATCH", error: "Migration scope mismatch." },
        { status: 403 }
      );
    }

    const { document: sourceDocument, error: sourceError } = await getVaultDocumentById(
      sourceDocumentId
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
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.STAGING_UPLOAD_REJECTED_TOTAL
      );
      return NextResponse.json(
        { success: false, code: "SOURCE_DOCUMENT_SCOPE_MISMATCH", error: "Source document mismatch." },
        { status: 403 }
      );
    }
    if (sourceDocument.deleted_at) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.STAGING_UPLOAD_REJECTED_TOTAL
      );
      return NextResponse.json(
        { success: false, code: "SOURCE_DOCUMENT_DELETED", error: "Source document is deleted." },
        { status: 409 }
      );
    }
    if (isVaultDocumentCompromised(sourceDocument)) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.STAGING_UPLOAD_REJECTED_TOTAL
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

    let uploadMigration = migration;
    if (migration.state === VAULT_DOCUMENT_MIGRATION_STATES.PENDING) {
      const targetDocumentId = crypto.randomUUID();
      const transition = await startVaultDocumentMigrationUpload({
        migrationId,
        targetDocumentId,
        expectedSourceCiphertextSha256: sourceDocument.ciphertext_sha256,
        aadVersion: VAULT_DOCUMENT_AAD_VERSION_VAULT_SCOPED,
        metadata: {
          target_content_type: contentType,
          target_doc_id_policy: VAULT_DOCUMENT_MIGRATION_TARGET_DOC_ID_POLICY,
        },
      });
      if (transition.error) {
        recordVaultMigrationExecutionSentinelCounter(
          VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.ERROR_TOTAL
        );
        return NextResponse.json(
          {
            success: false,
            code: "MIGRATION_STAGING_TRANSITION_FAILED",
            error: transition.error.message || "Unable to transition migration to uploading.",
          },
          { status: 502 }
        );
      }
      if (!transition.migration) {
        recordVaultMigrationExecutionSentinelCounter(
          VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.STAGING_UPLOAD_REJECTED_TOTAL
        );
        return NextResponse.json(
          { success: false, code: "MIGRATION_TRANSITION_REJECTED", error: "Migration is no longer pending." },
          { status: 409 }
        );
      }
      uploadMigration = transition.migration;
    } else if (migration.state !== VAULT_DOCUMENT_MIGRATION_STATES.UPLOADING) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.STAGING_UPLOAD_REJECTED_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "MIGRATION_STATE_INVALID",
          error: "Migration state is not valid for staging upload.",
        },
        { status: 409 }
      );
    }

    const stagingStoragePath = uploadMigration.metadata?.staging_storage_path;
    if (!stagingStoragePath || !uploadMigration.target_document_id) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.ERROR_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "MIGRATION_STAGING_METADATA_INVALID",
          error: "Migration staging metadata is incomplete.",
        },
        { status: 502 }
      );
    }
    if (stagingStoragePath.startsWith(`${auth.vault_device_id}/`)) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.ERROR_TOTAL
      );
      return NextResponse.json(
        { success: false, code: "MIGRATION_STAGING_PATH_INVALID", error: "Staging path is invalid." },
        { status: 502 }
      );
    }

    const upload = await createVaultSignedUploadUrlForStoragePath(stagingStoragePath);
    if (upload.error || !upload.signedUrl) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.ERROR_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "MIGRATION_STAGING_UPLOAD_URL_FAILED",
          error: upload.error?.message || "Unable to create migration staging upload URL.",
        },
        { status: 502 }
      );
    }

    recordVaultMigrationExecutionSentinelCounter(
      VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.STAGING_UPLOAD_ISSUED_TOTAL
    );
    return NextResponse.json({
      success: true,
      migration_id: uploadMigration.id,
      state: uploadMigration.state,
      target_document_id: uploadMigration.target_document_id,
      staging_storage_path: stagingStoragePath,
      aad_version: VAULT_DOCUMENT_AAD_VERSION_VAULT_SCOPED,
      expected_source_ciphertext_sha256:
        uploadMigration.metadata?.expected_source_ciphertext_sha256 || null,
      signedUrl: upload.signedUrl,
      token: upload.token,
      expiresIn: upload.expiresIn ?? VAULT_SIGNED_URL_TTL_SECONDS,
    });
  } catch {
    recordVaultMigrationExecutionSentinelCounter(
      VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.ERROR_TOTAL
    );
    return NextResponse.json(
      {
        success: false,
        code: "INVALID_REQUEST",
        error: "Invalid migration staging upload URL request.",
      },
      { status: 400 }
    );
  }
}

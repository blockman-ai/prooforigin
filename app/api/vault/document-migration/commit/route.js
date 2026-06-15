import { NextResponse } from "next/server";
import {
  authorizeVaultRequest,
  isVaultDocumentCompromised,
  vaultAuthFailureResponse,
} from "../../../../lib/vaultAuth";
import {
  buildVaultDocumentStoragePath,
  buildVaultMigrationStagingStoragePath,
  commitVaultDocumentMigrationAtomic,
  copyVaultStorageObject,
  deleteVaultStorageObject,
  getBoundVaultDeviceRegistration,
  getVaultDocumentByDevice,
  getVaultDocumentById,
  getVaultDocumentMigrationById,
  hasVerifiedVaultOwnershipForDevice,
  isVaultAdminConfigured,
  markVaultDocumentMigrationFailed,
  verifyVaultCiphertextObject,
  VAULT_ALLOWED_ENCRYPTION_VERSIONS,
  VAULT_DOCUMENT_AAD_VERSION_LEGACY,
  VAULT_DOCUMENT_AAD_VERSION_VAULT_SCOPED,
  VAULT_ENCRYPTION_VERSION_MVK,
} from "../../../../lib/vaultAdmin";
import {
  computeVaultDocumentStateHash,
  VAULT_DOCUMENT_EVENT_TYPES,
  VAULT_DOCUMENT_GENESIS_STATE_HASH,
} from "../../../../lib/vaultDocumentState";
import {
  VAULT_DOCUMENT_MIGRATION_FAILURE_REASONS,
  VAULT_DOCUMENT_MIGRATION_SOURCE_RETIREMENT_STATES,
  VAULT_DOCUMENT_MIGRATION_STATES,
} from "../../../../lib/vaultDocumentMigration";
import {
  recordVaultMigrationExecutionSentinelCounter,
  VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS,
} from "../../../../lib/vaultMigrationExecutionSentinelCounters";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RETENTION_WINDOW_DAYS = 7;
const RETENTION_WINDOW_MS = RETENTION_WINDOW_DAYS * 24 * 60 * 60 * 1000;

function normalizeUuid(value, name) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error(`${name} must be a valid UUID.`);
  }
  return normalized;
}

function parseCommitRequest(bodyText) {
  const body = bodyText ? JSON.parse(bodyText) : {};
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Request body must be a JSON object.");
  }
  return {
    migrationId: normalizeUuid(body.migration_id, "migration_id"),
    sourceDocumentId: normalizeUuid(body.source_document_id, "source_document_id"),
    targetDocumentId: normalizeUuid(body.target_document_id, "target_document_id"),
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

function sourceEligibilityFailure(document, migration) {
  if (!document) {
    return { status: 403, code: "SOURCE_DOCUMENT_SCOPE_MISMATCH" };
  }
  if (
    document.vault_id !== migration.vault_id ||
    document.vault_device_id !== migration.source_vault_device_id ||
    document.id !== migration.source_document_id
  ) {
    return { status: 403, code: "SOURCE_DOCUMENT_SCOPE_MISMATCH" };
  }
  if (document.deleted_at) {
    return { status: 409, code: "SOURCE_DOCUMENT_DELETED" };
  }
  if (isVaultDocumentCompromised(document)) {
    return { status: 423, code: "SOURCE_DOCUMENT_COMPROMISED" };
  }
  if (document.aad_version !== VAULT_DOCUMENT_AAD_VERSION_LEGACY) {
    return { status: 409, code: "SOURCE_AAD_VERSION_UNSUPPORTED" };
  }
  if (!VAULT_ALLOWED_ENCRYPTION_VERSIONS.includes(document.encryption_version)) {
    return { status: 409, code: "SOURCE_ENCRYPTION_VERSION_UNSUPPORTED" };
  }
  if (document.encryption_version !== VAULT_ENCRYPTION_VERSION_MVK) {
    return { status: 409, code: "SOURCE_LEGACY_ENCRYPTION_NOT_SUPPORTED" };
  }
  const expectedSourceSha = String(
    migration.metadata?.expected_source_ciphertext_sha256 || ""
  ).toLowerCase();
  if (!expectedSourceSha || String(document.ciphertext_sha256 || "").toLowerCase() !== expectedSourceSha) {
    return { status: 409, code: "SOURCE_DOCUMENT_CHANGED" };
  }
  return null;
}

function stagingMetadataFailure(migration) {
  const metadata = migration.metadata || {};
  const expectedStagingPath = buildVaultMigrationStagingStoragePath({
    vaultId: migration.vault_id,
    migrationId: migration.id,
    targetDocumentId: migration.target_document_id,
  });
  if (metadata.staging_storage_path !== expectedStagingPath) {
    return { code: "MIGRATION_STAGING_PATH_INVALID" };
  }
  if (!metadata.staging_verified) {
    return { code: "MIGRATION_STAGING_NOT_VERIFIED" };
  }
  if (!metadata.staging_ciphertext_sha256 || !metadata.staging_ciphertext_bytes) {
    return { code: "MIGRATION_STAGING_METADATA_INCOMPLETE" };
  }
  if (!metadata.staging_content_type) {
    return { code: "MIGRATION_STAGING_METADATA_INCOMPLETE" };
  }
  if (metadata.staging_aad_version !== VAULT_DOCUMENT_AAD_VERSION_VAULT_SCOPED) {
    return { code: "MIGRATION_STAGING_AAD_INVALID" };
  }
  return null;
}

async function markCommitFailed(migrationId, failureReason, metadata = {}) {
  const result = await markVaultDocumentMigrationFailed({
    migrationId,
    failureReason,
    metadata: {
      commit_failed: true,
      ...metadata,
    },
  });
  if (result.error) {
    recordVaultMigrationExecutionSentinelCounter(
      VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.ERROR_TOTAL
    );
  }
  return result;
}

export async function POST(req) {
  recordVaultMigrationExecutionSentinelCounter(
    VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.COMMIT_REQUEST_TOTAL
  );

  try {
    const bodyText = await req.text();
    const auth = await authorizeVaultRequest(req, {
      method: "POST",
      path: "/api/vault/document-migration/commit",
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

    const parsed = parseCommitRequest(bodyText);
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
          code: "MIGRATION_COMMIT_BINDING_LOOKUP_FAILED",
          error: registrationError.message || "Unable to determine vault migration scope.",
        },
        { status: 502 }
      );
    }
    if (!registration?.vault_id) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.COMMIT_REJECTED_TOTAL
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
          code: "MIGRATION_COMMIT_OWNERSHIP_LOOKUP_FAILED",
          error: verifyError.message || "Unable to determine ownership verification state.",
        },
        { status: 502 }
      );
    }
    if (!verified) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.COMMIT_REJECTED_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "OWNERSHIP_VERIFICATION_REQUIRED",
          error: "Vault ownership verification is required before migration commit.",
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
          code: "MIGRATION_COMMIT_LOOKUP_FAILED",
          error: migrationError.message || "Unable to load migration record.",
        },
        { status: 502 }
      );
    }
    if (!migration) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.COMMIT_REJECTED_TOTAL
      );
      return NextResponse.json(
        { success: false, code: "MIGRATION_NOT_FOUND", error: "Migration not found." },
        { status: 404 }
      );
    }
    if (migration.state !== VAULT_DOCUMENT_MIGRATION_STATES.UPLOADING) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.COMMIT_REJECTED_TOTAL
      );
      return NextResponse.json(
        { success: false, code: "MIGRATION_STATE_INVALID", error: "Migration is not ready to commit." },
        { status: 409 }
      );
    }
    if (
      migration.vault_id !== registration.vault_id ||
      migration.target_vault_device_id !== auth.vault_device_id ||
      migration.source_document_id !== parsed.sourceDocumentId ||
      migration.target_document_id !== parsed.targetDocumentId
    ) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.COMMIT_REJECTED_TOTAL
      );
      return NextResponse.json(
        { success: false, code: "MIGRATION_SCOPE_MISMATCH", error: "Migration scope mismatch." },
        { status: 403 }
      );
    }

    const { document: sourceDocument, error: sourceError } = await getVaultDocumentById(
      parsed.sourceDocumentId
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
    const sourceFailure = sourceEligibilityFailure(sourceDocument, migration);
    if (sourceFailure) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.COMMIT_REJECTED_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: sourceFailure.code,
          error: "Source document is not eligible for migration commit.",
        },
        { status: sourceFailure.status }
      );
    }

    const stagingFailure = stagingMetadataFailure(migration);
    if (stagingFailure) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.COMMIT_REJECTED_TOTAL
      );
      await markCommitFailed(migration.id, VAULT_DOCUMENT_MIGRATION_FAILURE_REASONS.VERIFY_FAILED, {
        commit_failure_code: stagingFailure.code,
      });
      return NextResponse.json(
        {
          success: false,
          code: stagingFailure.code,
          error: "Migration staging metadata is not ready for commit.",
        },
        { status: 409 }
      );
    }

    const { document: existingTarget, error: targetLookupError } = await getVaultDocumentByDevice(
      auth.vault_device_id
    );
    if (targetLookupError) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.ERROR_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "TARGET_SLOT_LOOKUP_FAILED",
          error: targetLookupError.message || "Unable to check target vault document slot.",
        },
        { status: 502 }
      );
    }
    if (existingTarget) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.COMMIT_SLOT_OCCUPIED_TOTAL
      );
      await markCommitFailed(migration.id, VAULT_DOCUMENT_MIGRATION_FAILURE_REASONS.SLOT_OCCUPIED, {
        commit_failure_code: "SLOT_OCCUPIED",
      });
      return NextResponse.json(
        {
          success: false,
          code: "SLOT_OCCUPIED",
          error: "Target vault device already has an active encrypted document.",
        },
        { status: 409 }
      );
    }

    const stagingPath = migration.metadata.staging_storage_path;
    const stagingSha = String(migration.metadata.staging_ciphertext_sha256).toLowerCase();
    const stagingBytes = Number(migration.metadata.staging_ciphertext_bytes);
    const stagingVerification = await verifyVaultCiphertextObject({
      storagePath: stagingPath,
      expectedSha256: stagingSha,
      expectedBytes: stagingBytes,
    });
    if (!stagingVerification.ok) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.COMMIT_FAILED_TOTAL
      );
      await markCommitFailed(migration.id, VAULT_DOCUMENT_MIGRATION_FAILURE_REASONS.VERIFY_FAILED, {
        commit_failure_code: stagingVerification.code || "MIGRATION_STAGING_VERIFY_FAILED",
      });
      return NextResponse.json(
        {
          success: false,
          code: stagingVerification.code || "MIGRATION_STAGING_VERIFY_FAILED",
          error: stagingVerification.error || "Staging object verification failed.",
        },
        { status: 409 }
      );
    }

    const liveStoragePath = buildVaultDocumentStoragePath(
      auth.vault_device_id,
      migration.target_document_id
    );
    const copyResult = await copyVaultStorageObject({
      fromPath: stagingPath,
      toPath: liveStoragePath,
    });
    if (copyResult.error) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.COMMIT_FAILED_TOTAL
      );
      await markCommitFailed(migration.id, VAULT_DOCUMENT_MIGRATION_FAILURE_REASONS.UPLOAD_FAILED, {
        commit_failure_code: "MIGRATION_LIVE_OBJECT_COPY_FAILED",
      });
      return NextResponse.json(
        {
          success: false,
          code: "MIGRATION_LIVE_OBJECT_COPY_FAILED",
          error: copyResult.error.message || "Unable to copy staging object into the live vault path.",
        },
        { status: 502 }
      );
    }

    const liveVerification = await verifyVaultCiphertextObject({
      storagePath: liveStoragePath,
      expectedSha256: stagingSha,
      expectedBytes: stagingBytes,
    });
    if (!liveVerification.ok) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.COMMIT_FAILED_TOTAL
      );
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.COMMIT_ROLLBACK_TOTAL
      );
      await deleteVaultStorageObject(liveStoragePath);
      await markCommitFailed(migration.id, VAULT_DOCUMENT_MIGRATION_FAILURE_REASONS.VERIFY_FAILED, {
        commit_failure_code: liveVerification.code || "MIGRATION_LIVE_OBJECT_VERIFY_FAILED",
      });
      return NextResponse.json(
        {
          success: false,
          code: liveVerification.code || "MIGRATION_LIVE_OBJECT_VERIFY_FAILED",
          error: liveVerification.error || "Live object verification failed.",
        },
        { status: 409 }
      );
    }

    const completedAt = new Date().toISOString();
    const retentionNotBefore = new Date(Date.parse(completedAt) + RETENTION_WINDOW_MS).toISOString();
    const eventMetadata = {
      source: "vault-document-migration-commit-v0.2.6",
      vault_device_id: auth.vault_device_id,
      vault_id: migration.vault_id,
      migration_id: migration.id,
      source_document_id: migration.source_document_id,
      source_retirement_eligible: true,
    };
    const documentSnapshot = {
      vault_device_id: auth.vault_device_id,
      vault_id: migration.vault_id,
      aad_version: VAULT_DOCUMENT_AAD_VERSION_VAULT_SCOPED,
      storage_path: liveStoragePath,
      ciphertext_sha256: stagingSha,
      ciphertext_bytes: stagingBytes,
      content_type_hint: migration.metadata.staging_content_type,
      encryption_version: VAULT_ENCRYPTION_VERSION_MVK,
      compromised_at: null,
      deleted_at: null,
    };
    const eventPreviousStateHash = VAULT_DOCUMENT_GENESIS_STATE_HASH;
    const eventStateHash = computeVaultDocumentStateHash({
      documentId: migration.target_document_id,
      eventType: VAULT_DOCUMENT_EVENT_TYPES.CREATED,
      previousStateHash: eventPreviousStateHash,
      document: documentSnapshot,
      metadata: eventMetadata,
      createdAt: completedAt,
    });
    const migrationMetadata = {
      live_storage_path: liveStoragePath,
      committed_target_document_id: migration.target_document_id,
      source_retirement_eligible: true,
      source_retirement_eligible_at: completedAt,
      source_retirement_not_before: retentionNotBefore,
      retention_window_days: RETENTION_WINDOW_DAYS,
      target_document_committed_at: completedAt,
      target_storage_path: liveStoragePath,
      target_aad_version: VAULT_DOCUMENT_AAD_VERSION_VAULT_SCOPED,
      staging_cleanup_pending: true,
      source_retirement_state_at_commit:
        VAULT_DOCUMENT_MIGRATION_SOURCE_RETIREMENT_STATES.ACTIVE,
    };

    const commitResult = await commitVaultDocumentMigrationAtomic({
      migrationId: migration.id,
      vaultId: migration.vault_id,
      sourceDocumentId: migration.source_document_id,
      sourceVaultDeviceId: migration.source_vault_device_id,
      targetVaultDeviceId: migration.target_vault_device_id,
      targetDocumentId: migration.target_document_id,
      expectedSourceCiphertextSha256: migration.metadata.expected_source_ciphertext_sha256,
      liveStoragePath,
      ciphertextSha256: stagingSha,
      ciphertextBytes: stagingBytes,
      contentTypeHint: migration.metadata.staging_content_type,
      encryptionVersion: VAULT_ENCRYPTION_VERSION_MVK,
      aadVersion: VAULT_DOCUMENT_AAD_VERSION_VAULT_SCOPED,
      completedAt,
      eventPreviousStateHash,
      eventStateHash,
      eventMetadata,
      migrationMetadata,
    });

    if (commitResult.error) {
      const isSlotConflict =
        commitResult.error.code === "23505" ||
        String(commitResult.error.message || "").includes("SLOT_OCCUPIED");
      recordVaultMigrationExecutionSentinelCounter(
        isSlotConflict
          ? VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.COMMIT_SLOT_OCCUPIED_TOTAL
          : VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.COMMIT_FAILED_TOTAL
      );
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.COMMIT_ROLLBACK_TOTAL
      );
      await deleteVaultStorageObject(liveStoragePath);
      await markCommitFailed(
        migration.id,
        isSlotConflict
          ? VAULT_DOCUMENT_MIGRATION_FAILURE_REASONS.SLOT_OCCUPIED
          : VAULT_DOCUMENT_MIGRATION_FAILURE_REASONS.COMMIT_FAILED,
        { commit_failure_code: isSlotConflict ? "SLOT_OCCUPIED" : "MIGRATION_COMMIT_FAILED" }
      );
      return NextResponse.json(
        {
          success: false,
          code: isSlotConflict ? "SLOT_OCCUPIED" : "MIGRATION_COMMIT_FAILED",
          error:
            commitResult.error.message ||
            (isSlotConflict
              ? "Target vault device already has an active encrypted document."
              : "Unable to atomically promote migration target document."),
        },
        { status: isSlotConflict ? 409 : 502 }
      );
    }

    recordVaultMigrationExecutionSentinelCounter(
      VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.COMMIT_SUCCESS_TOTAL
    );
    recordVaultMigrationExecutionSentinelCounter(
      VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.RETIREMENT_ELIGIBLE_TOTAL
    );
    return NextResponse.json({
      success: true,
      migration_id: commitResult.migration.id,
      state: commitResult.migration.state,
      target_document_id: commitResult.document.id,
      document: commitResult.document,
      source_retirement_eligible: true,
      source_retirement_not_before: retentionNotBefore,
      source_retirement_state: commitResult.migration.source_retirement_state,
      staging_cleanup_pending: true,
    });
  } catch {
    recordVaultMigrationExecutionSentinelCounter(
      VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.ERROR_TOTAL
    );
    return NextResponse.json(
      { success: false, code: "INVALID_REQUEST", error: "Invalid migration commit request." },
      { status: 400 }
    );
  }
}

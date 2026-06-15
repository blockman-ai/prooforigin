import { NextResponse } from "next/server";
import { authorizeVaultRequest, vaultAuthFailureResponse } from "../../../../lib/vaultAuth";
import {
  buildVaultMigrationStagingStoragePath,
  deleteVaultStorageObject,
  getBoundVaultDeviceRegistration,
  getVaultDocumentMigrationById,
  hasVerifiedVaultOwnershipForDevice,
  isVaultAdminConfigured,
  updateVaultDocumentMigrationMetadata,
} from "../../../../lib/vaultAdmin";
import { VAULT_DOCUMENT_MIGRATION_STATES } from "../../../../lib/vaultDocumentMigration";
import {
  recordVaultMigrationExecutionSentinelCounter,
  VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS,
} from "../../../../lib/vaultMigrationExecutionSentinelCounters";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLEANUP_VERSION = 1;
const CLEANUP_TERMINAL_STATES = new Set([
  VAULT_DOCUMENT_MIGRATION_STATES.COMPLETED,
  VAULT_DOCUMENT_MIGRATION_STATES.FAILED,
  VAULT_DOCUMENT_MIGRATION_STATES.CANCELLED,
]);

function normalizeUuid(value, name) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error(`${name} must be a valid UUID.`);
  }
  return normalized;
}

function parseCleanupRequest(bodyText) {
  const body = bodyText ? JSON.parse(bodyText) : {};
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Request body must be a JSON object.");
  }
  return {
    migrationId: normalizeUuid(body.migration_id, "migration_id"),
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

function isStorageObjectNotFound(error) {
  const code = String(error?.statusCode || error?.status || error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return code === "404" || message.includes("not found") || message.includes("not exist");
}

function buildCleanupMetadata({ migration, requestedAt, completedAt, state, errorCode = null }) {
  const previousAttempts = Number(migration.metadata?.staging_cleanup_attempts || 0);
  return {
    staging_cleanup_state: state,
    staging_cleanup_requested_at:
      migration.metadata?.staging_cleanup_requested_at || requestedAt,
    staging_cleanup_completed_at: completedAt,
    staging_cleanup_attempts: previousAttempts + 1,
    staging_cleanup_last_error_code: errorCode,
    staging_cleanup_pending: state !== "deleted",
    cleanup_version: CLEANUP_VERSION,
  };
}

function buildIdempotentCleanupResponse(migration) {
  return NextResponse.json({
    success: true,
    migration_id: migration.id,
    state: migration.state,
    staging_cleanup_state: "deleted",
    staging_cleanup_completed_at: migration.metadata?.staging_cleanup_completed_at || null,
    idempotent: true,
  });
}

export async function POST(req) {
  recordVaultMigrationExecutionSentinelCounter(
    VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.CLEANUP_REQUEST_TOTAL
  );

  try {
    const bodyText = await req.text();
    const auth = await authorizeVaultRequest(req, {
      method: "POST",
      path: "/api/vault/document-migration/staging-cleanup",
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

    const parsed = parseCleanupRequest(bodyText);
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
          code: "MIGRATION_CLEANUP_BINDING_LOOKUP_FAILED",
          error: registrationError.message || "Unable to determine vault migration scope.",
        },
        { status: 502 }
      );
    }
    if (!registration?.vault_id) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.CLEANUP_REJECTED_TOTAL
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
          code: "MIGRATION_CLEANUP_OWNERSHIP_LOOKUP_FAILED",
          error: verifyError.message || "Unable to determine ownership verification state.",
        },
        { status: 502 }
      );
    }
    if (!verified) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.CLEANUP_REJECTED_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "OWNERSHIP_VERIFICATION_REQUIRED",
          error: "Vault ownership verification is required before migration cleanup.",
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
          code: "MIGRATION_CLEANUP_LOOKUP_FAILED",
          error: migrationError.message || "Unable to load migration record.",
        },
        { status: 502 }
      );
    }
    if (!migration) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.CLEANUP_REJECTED_TOTAL
      );
      return NextResponse.json(
        { success: false, code: "MIGRATION_NOT_FOUND", error: "Migration not found." },
        { status: 404 }
      );
    }
    if (
      migration.vault_id !== registration.vault_id ||
      migration.target_vault_device_id !== auth.vault_device_id
    ) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.CLEANUP_REJECTED_TOTAL
      );
      return NextResponse.json(
        { success: false, code: "MIGRATION_SCOPE_MISMATCH", error: "Migration scope mismatch." },
        { status: 403 }
      );
    }
    if (!CLEANUP_TERMINAL_STATES.has(migration.state)) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.CLEANUP_REJECTED_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "MIGRATION_CLEANUP_STATE_INVALID",
          error: "Only terminal migrations can be cleaned up.",
        },
        { status: 409 }
      );
    }
    if (migration.metadata?.staging_cleanup_state === "deleted") {
      return buildIdempotentCleanupResponse(migration);
    }

    const expectedStagingPath = buildVaultMigrationStagingStoragePath({
      vaultId: migration.vault_id,
      migrationId: migration.id,
      targetDocumentId: migration.target_document_id,
    });
    if (
      !migration.metadata?.staging_storage_path ||
      migration.metadata.staging_storage_path !== expectedStagingPath
    ) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.CLEANUP_REJECTED_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "MIGRATION_STAGING_PATH_INVALID",
          error: "Migration staging path is not eligible for cleanup.",
        },
        { status: 409 }
      );
    }

    const requestedAt = new Date().toISOString();
    const cleanup = await deleteVaultStorageObject(expectedStagingPath);
    const missing = cleanup.error && isStorageObjectNotFound(cleanup.error);

    if (cleanup.error && !missing) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.CLEANUP_STAGING_FAILED_TOTAL
      );
      await updateVaultDocumentMigrationMetadata({
        migrationId: migration.id,
        metadata: buildCleanupMetadata({
          migration,
          requestedAt,
          completedAt: null,
          state: "failed",
          errorCode: cleanup.error.code || "STAGING_DELETE_FAILED",
        }),
        updatedAt: requestedAt,
      });
      return NextResponse.json(
        {
          success: false,
          code: "MIGRATION_STAGING_CLEANUP_FAILED",
          error: cleanup.error.message || "Unable to delete migration staging object.",
        },
        { status: 502 }
      );
    }

    const completedAt = new Date().toISOString();
    const { migration: cleanedMigration, error: updateError } =
      await updateVaultDocumentMigrationMetadata({
        migrationId: migration.id,
        metadata: buildCleanupMetadata({
          migration,
          requestedAt,
          completedAt,
          state: "deleted",
        }),
        updatedAt: completedAt,
      });
    if (updateError || !cleanedMigration) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.ERROR_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "MIGRATION_CLEANUP_METADATA_UPDATE_FAILED",
          error: updateError?.message || "Unable to persist migration cleanup metadata.",
        },
        { status: 502 }
      );
    }

    recordVaultMigrationExecutionSentinelCounter(
      missing
        ? VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.CLEANUP_STAGING_MISSING_TOTAL
        : VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.CLEANUP_STAGING_DELETED_TOTAL
    );
    return NextResponse.json({
      success: true,
      migration_id: cleanedMigration.id,
      state: cleanedMigration.state,
      staging_cleanup_state: cleanedMigration.metadata?.staging_cleanup_state,
      staging_cleanup_completed_at: cleanedMigration.metadata?.staging_cleanup_completed_at || null,
      staging_cleanup_attempts: cleanedMigration.metadata?.staging_cleanup_attempts || 0,
      idempotent: false,
    });
  } catch {
    recordVaultMigrationExecutionSentinelCounter(
      VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.ERROR_TOTAL
    );
    return NextResponse.json(
      { success: false, code: "INVALID_REQUEST", error: "Invalid migration cleanup request." },
      { status: 400 }
    );
  }
}

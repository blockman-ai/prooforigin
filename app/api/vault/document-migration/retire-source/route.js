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
  retireVaultDocumentMigrationSourceAtomic,
  VAULT_DOCUMENT_AAD_VERSION_VAULT_SCOPED,
} from "../../../../lib/vaultAdmin";
import {
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

function normalizeUuid(value, name) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error(`${name} must be a valid UUID.`);
  }
  return normalized;
}

function parseRetirementRequest(bodyText) {
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

function migrationScopeMatches({ migration, registration, auth, parsed }) {
  return (
    migration.vault_id === registration.vault_id &&
    migration.target_vault_device_id === auth.vault_device_id &&
    migration.source_document_id === parsed.sourceDocumentId &&
    migration.target_document_id === parsed.targetDocumentId
  );
}

function retirementNotBeforeFailure(migration, nowMs = Date.now()) {
  const metadata = migration.metadata || {};
  if (!metadata.source_retirement_eligible) {
    return "SOURCE_RETIREMENT_NOT_ELIGIBLE";
  }
  const notBeforeMs = Date.parse(String(metadata.source_retirement_not_before || ""));
  if (!Number.isFinite(notBeforeMs)) {
    return "SOURCE_RETIREMENT_NOT_BEFORE_MISSING";
  }
  if (notBeforeMs > nowMs) {
    return "SOURCE_RETIREMENT_NOT_BEFORE";
  }
  return null;
}

function sourceEligibilityFailure(document, migration) {
  const expectedSourceSha = String(
    migration.metadata?.expected_source_ciphertext_sha256 || ""
  ).toLowerCase();
  if (
    !document ||
    document.id !== migration.source_document_id ||
    document.vault_id !== migration.vault_id ||
    document.vault_device_id !== migration.source_vault_device_id
  ) {
    return "SOURCE_DOCUMENT_SCOPE_MISMATCH";
  }
  if (document.deleted_at) {
    return "SOURCE_DOCUMENT_DELETED";
  }
  if (document.source_retired_at) {
    return "SOURCE_DOCUMENT_ALREADY_RETIRED";
  }
  if (isVaultDocumentCompromised(document)) {
    return "SOURCE_DOCUMENT_COMPROMISED";
  }
  if (!expectedSourceSha || String(document.ciphertext_sha256 || "").toLowerCase() !== expectedSourceSha) {
    return "SOURCE_DOCUMENT_CHANGED";
  }
  return null;
}

function targetEligibilityFailure(document, migration) {
  const metadata = migration.metadata || {};
  const expectedStoragePath = metadata.live_storage_path || metadata.target_storage_path;
  if (
    !document ||
    document.id !== migration.target_document_id ||
    document.vault_id !== migration.vault_id ||
    document.vault_device_id !== migration.target_vault_device_id
  ) {
    return "TARGET_DOCUMENT_SCOPE_MISMATCH";
  }
  if (document.deleted_at) {
    return "TARGET_DOCUMENT_DELETED";
  }
  if (isVaultDocumentCompromised(document)) {
    return "TARGET_DOCUMENT_COMPROMISED";
  }
  if (document.aad_version !== VAULT_DOCUMENT_AAD_VERSION_VAULT_SCOPED) {
    return "TARGET_AAD_VERSION_INVALID";
  }
  if (document.storage_path !== expectedStoragePath) {
    return "TARGET_DOCUMENT_STORAGE_MISMATCH";
  }
  if (
    String(document.ciphertext_sha256 || "").toLowerCase() !==
    String(metadata.staging_ciphertext_sha256 || "").toLowerCase()
  ) {
    return "TARGET_DOCUMENT_HASH_MISMATCH";
  }
  if (Number(document.ciphertext_bytes) !== Number(metadata.staging_ciphertext_bytes)) {
    return "TARGET_DOCUMENT_SIZE_MISMATCH";
  }
  if (document.content_type_hint !== metadata.staging_content_type) {
    return "TARGET_DOCUMENT_CONTENT_TYPE_MISMATCH";
  }
  return null;
}

function buildRetirementSuccessResponse({ migration, sourceDocument, idempotent = false }) {
  return NextResponse.json({
    success: true,
    migration_id: migration.id,
    state: migration.state,
    source_document_id: sourceDocument.id,
    source_retirement_state: migration.source_retirement_state,
    source_retired_at: migration.source_retired_at,
    source_document_retired_at: sourceDocument.source_retired_at,
    idempotent,
  });
}

export async function POST(req) {
  recordVaultMigrationExecutionSentinelCounter(
    VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.RETIREMENT_REQUEST_TOTAL
  );

  try {
    const bodyText = await req.text();
    const auth = await authorizeVaultRequest(req, {
      method: "POST",
      path: "/api/vault/document-migration/retire-source",
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

    const parsed = parseRetirementRequest(bodyText);
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
          code: "MIGRATION_RETIREMENT_BINDING_LOOKUP_FAILED",
          error: registrationError.message || "Unable to determine vault migration scope.",
        },
        { status: 502 }
      );
    }
    if (!registration?.vault_id) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.RETIREMENT_REJECTED_TOTAL
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
          code: "MIGRATION_RETIREMENT_OWNERSHIP_LOOKUP_FAILED",
          error: verifyError.message || "Unable to determine ownership verification state.",
        },
        { status: 502 }
      );
    }
    if (!verified) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.RETIREMENT_REJECTED_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "OWNERSHIP_VERIFICATION_REQUIRED",
          error: "Vault ownership verification is required before source retirement.",
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
          code: "MIGRATION_RETIREMENT_LOOKUP_FAILED",
          error: migrationError.message || "Unable to load migration record.",
        },
        { status: 502 }
      );
    }
    if (!migration) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.RETIREMENT_REJECTED_TOTAL
      );
      return NextResponse.json(
        { success: false, code: "MIGRATION_NOT_FOUND", error: "Migration not found." },
        { status: 404 }
      );
    }
    if (!migrationScopeMatches({ migration, registration, auth, parsed })) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.RETIREMENT_REJECTED_TOTAL
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
    const { document: targetDocument, error: targetError } = await getVaultDocumentById(
      parsed.targetDocumentId
    );
    if (targetError) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.ERROR_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "TARGET_DOCUMENT_LOOKUP_FAILED",
          error: targetError.message || "Unable to load target document.",
        },
        { status: 502 }
      );
    }

    if (
      migration.state === VAULT_DOCUMENT_MIGRATION_STATES.COMPLETED &&
      migration.source_retirement_state ===
        VAULT_DOCUMENT_MIGRATION_SOURCE_RETIREMENT_STATES.SOURCE_RETIRED
    ) {
      const targetFailure = targetEligibilityFailure(targetDocument, migration);
      if (
        sourceDocument?.source_retired_at &&
        migration.source_retired_at &&
        !targetFailure
      ) {
        recordVaultMigrationExecutionSentinelCounter(
          VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.RETIREMENT_IDEMPOTENT_TOTAL
        );
        return buildRetirementSuccessResponse({
          migration,
          sourceDocument,
          idempotent: true,
        });
      }
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.RETIREMENT_REJECTED_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "SOURCE_RETIREMENT_STATE_INCONSISTENT",
          error: "Source retirement state is inconsistent.",
        },
        { status: 409 }
      );
    }

    if (migration.state !== VAULT_DOCUMENT_MIGRATION_STATES.COMPLETED) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.RETIREMENT_REJECTED_TOTAL
      );
      return NextResponse.json(
        { success: false, code: "MIGRATION_STATE_INVALID", error: "Migration is not completed." },
        { status: 409 }
      );
    }
    if (
      migration.source_retirement_state !==
      VAULT_DOCUMENT_MIGRATION_SOURCE_RETIREMENT_STATES.ACTIVE
    ) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.RETIREMENT_REJECTED_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "SOURCE_RETIREMENT_STATE_INVALID",
          error: "Source is not in an active retirement state.",
        },
        { status: 409 }
      );
    }

    const notBeforeFailure = retirementNotBeforeFailure(migration);
    if (notBeforeFailure) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.RETIREMENT_NOT_BEFORE_REJECTED_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: notBeforeFailure,
          error: "Source retirement is not yet eligible.",
        },
        { status: 409 }
      );
    }

    const sourceFailure = sourceEligibilityFailure(sourceDocument, migration);
    if (sourceFailure) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.RETIREMENT_SOURCE_INVALID_TOTAL
      );
      return NextResponse.json(
        { success: false, code: sourceFailure, error: "Source document is not retireable." },
        { status: 409 }
      );
    }

    const targetFailure = targetEligibilityFailure(targetDocument, migration);
    if (targetFailure) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.RETIREMENT_TARGET_INVALID_TOTAL
      );
      return NextResponse.json(
        { success: false, code: targetFailure, error: "Target document is not valid." },
        { status: 409 }
      );
    }

    const retiredAt = new Date().toISOString();
    const retirement = await retireVaultDocumentMigrationSourceAtomic({
      migrationId: migration.id,
      vaultId: migration.vault_id,
      sourceDocumentId: migration.source_document_id,
      sourceVaultDeviceId: migration.source_vault_device_id,
      targetVaultDeviceId: migration.target_vault_device_id,
      targetDocumentId: migration.target_document_id,
      expectedSourceCiphertextSha256: migration.metadata.expected_source_ciphertext_sha256,
      targetStoragePath: migration.metadata.live_storage_path || migration.metadata.target_storage_path,
      targetCiphertextSha256: migration.metadata.staging_ciphertext_sha256,
      targetCiphertextBytes: migration.metadata.staging_ciphertext_bytes,
      targetContentTypeHint: migration.metadata.staging_content_type,
      retiredAt,
      migrationMetadata: {
        source_retirement_executed_at: retiredAt,
        source_retirement_mode: "soft",
      },
    });
    if (retirement.error || !retirement.migration || !retirement.sourceDocument) {
      recordVaultMigrationExecutionSentinelCounter(
        VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.ERROR_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "SOURCE_RETIREMENT_FAILED",
          error: retirement.error?.message || "Unable to atomically retire migration source.",
        },
        { status: 502 }
      );
    }

    recordVaultMigrationExecutionSentinelCounter(
      VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.RETIREMENT_SUCCESS_TOTAL
    );
    return buildRetirementSuccessResponse({
      migration: retirement.migration,
      sourceDocument: retirement.sourceDocument,
      idempotent: false,
    });
  } catch {
    recordVaultMigrationExecutionSentinelCounter(
      VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.ERROR_TOTAL
    );
    return NextResponse.json(
      { success: false, code: "INVALID_REQUEST", error: "Invalid source retirement request." },
      { status: 400 }
    );
  }
}

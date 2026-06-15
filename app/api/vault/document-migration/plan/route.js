import { NextResponse } from "next/server";
import {
  authorizeVaultRequest,
  isVaultDocumentCompromised,
  vaultAuthFailureResponse,
} from "../../../../lib/vaultAuth";
import {
  createVaultDocumentMigrationRecord,
  getBoundVaultDeviceRegistration,
  getVaultDocumentById,
  hasVerifiedVaultOwnershipForDevice,
  isVaultAdminConfigured,
} from "../../../../lib/vaultAdmin";
import {
  validateVaultDocumentMigrationRecord,
  VAULT_DOCUMENT_MIGRATION_SOURCE_RETIREMENT_STATES,
  VAULT_DOCUMENT_MIGRATION_STATES,
} from "../../../../lib/vaultDocumentMigration";
import {
  recordVaultMigrationPlanningSentinelCounter,
  VAULT_MIGRATION_PLANNING_SENTINEL_COUNTERS,
} from "../../../../lib/vaultMigrationPlanningSentinelCounters";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function normalizeUuid(value, name) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error(`${name} must be a valid UUID.`);
  }
  return normalized;
}

function parsePlanRequest(bodyText) {
  const body = bodyText ? JSON.parse(bodyText) : {};
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Request body must be a JSON object.");
  }
  return {
    vaultId: normalizeUuid(body.vault_id, "vault_id"),
    sourceDocumentId: normalizeUuid(body.source_document_id, "source_document_id"),
  };
}

function buildPlanningMetadata() {
  return {
    phase: "6A",
    execution_enabled: false,
    ciphertext_movement_enabled: false,
    signed_url_issuance_enabled: false,
    source_retirement_enabled: false,
    aad_activation_enabled: false,
    aad_v3_target_document_id_requirement:
      "target_document_id must exist before client-side AAD v3 encryption.",
  };
}

function serializeMigrationPlan(migration) {
  return {
    id: migration.id,
    vault_id: migration.vault_id,
    source_document_id: migration.source_document_id,
    target_document_id: migration.target_document_id,
    source_vault_device_id: migration.source_vault_device_id,
    target_vault_device_id: migration.target_vault_device_id,
    state: migration.state,
    failure_reason: migration.failure_reason,
    source_retirement_state: migration.source_retirement_state,
    created_at: migration.created_at,
    updated_at: migration.updated_at,
    metadata: migration.metadata || {},
  };
}

export async function POST(req) {
  recordVaultMigrationPlanningSentinelCounter(
    VAULT_MIGRATION_PLANNING_SENTINEL_COUNTERS.REQUEST_TOTAL
  );

  try {
    const bodyText = await req.text();
    const auth = await authorizeVaultRequest(req, {
      method: "POST",
      path: "/api/vault/document-migration/plan",
      bodyText,
    });

    if (!auth.ok) {
      const status = auth.code === "STORAGE_NOT_CONFIGURED" ? 503 : auth.status;
      return NextResponse.json(vaultAuthFailureResponse(auth), { status });
    }

    if (!isVaultAdminConfigured()) {
      recordVaultMigrationPlanningSentinelCounter(
        VAULT_MIGRATION_PLANNING_SENTINEL_COUNTERS.ERROR_TOTAL
      );
      return storageNotConfiguredResponse();
    }

    const { vaultId, sourceDocumentId } = parsePlanRequest(bodyText);

    const { registration, error: registrationError } = await getBoundVaultDeviceRegistration(
      auth.vault_device_id
    );
    if (registrationError) {
      recordVaultMigrationPlanningSentinelCounter(
        VAULT_MIGRATION_PLANNING_SENTINEL_COUNTERS.ERROR_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "MIGRATION_PLAN_BINDING_LOOKUP_FAILED",
          error: registrationError.message || "Unable to determine vault migration scope.",
        },
        { status: 502 }
      );
    }

    if (!registration?.vault_id) {
      recordVaultMigrationPlanningSentinelCounter(
        VAULT_MIGRATION_PLANNING_SENTINEL_COUNTERS.UNVERIFIED_DEVICE_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "VAULT_DEVICE_NOT_BOUND",
          error: "A bound vault device is required before migration planning.",
        },
        { status: 403 }
      );
    }

    if (registration.vault_id !== vaultId) {
      recordVaultMigrationPlanningSentinelCounter(
        VAULT_MIGRATION_PLANNING_SENTINEL_COUNTERS.VAULT_MISMATCH_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "VAULT_MISMATCH",
          error: "Requested vault does not match the authenticated bound device.",
        },
        { status: 403 }
      );
    }

    const { verified, error: verificationError } = await hasVerifiedVaultOwnershipForDevice({
      vaultId,
      vaultDeviceId: auth.vault_device_id,
    });
    if (verificationError) {
      recordVaultMigrationPlanningSentinelCounter(
        VAULT_MIGRATION_PLANNING_SENTINEL_COUNTERS.ERROR_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "MIGRATION_PLAN_VERIFY_LOOKUP_FAILED",
          error: verificationError.message || "Unable to determine ownership verification state.",
        },
        { status: 502 }
      );
    }

    if (!verified) {
      recordVaultMigrationPlanningSentinelCounter(
        VAULT_MIGRATION_PLANNING_SENTINEL_COUNTERS.UNVERIFIED_DEVICE_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "OWNERSHIP_VERIFICATION_REQUIRED",
          error: "Vault ownership verification is required before migration planning.",
        },
        { status: 403 }
      );
    }

    const { document: sourceDocument, error: documentError } = await getVaultDocumentById(
      sourceDocumentId
    );
    if (documentError) {
      recordVaultMigrationPlanningSentinelCounter(
        VAULT_MIGRATION_PLANNING_SENTINEL_COUNTERS.ERROR_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "MIGRATION_PLAN_SOURCE_LOOKUP_FAILED",
          error: documentError.message || "Unable to load migration source document.",
        },
        { status: 502 }
      );
    }

    if (!sourceDocument || sourceDocument.vault_id !== vaultId) {
      recordVaultMigrationPlanningSentinelCounter(
        VAULT_MIGRATION_PLANNING_SENTINEL_COUNTERS.VAULT_MISMATCH_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "SOURCE_DOCUMENT_VAULT_MISMATCH",
          error: "Source document does not belong to the verified vault.",
        },
        { status: 403 }
      );
    }

    if (sourceDocument.deleted_at) {
      return NextResponse.json(
        {
          success: false,
          code: "SOURCE_DOCUMENT_DELETED",
          error: "Deleted source documents cannot be planned for migration.",
        },
        { status: 409 }
      );
    }

    if (isVaultDocumentCompromised(sourceDocument)) {
      return NextResponse.json(
        {
          success: false,
          code: "SOURCE_DOCUMENT_COMPROMISED",
          error: "Compromised source documents cannot be planned for migration.",
        },
        { status: 423 }
      );
    }

    const planRecord = validateVaultDocumentMigrationRecord({
      vault_id: vaultId,
      source_document_id: sourceDocumentId,
      source_vault_device_id: sourceDocument.vault_device_id,
      target_vault_device_id: auth.vault_device_id,
      state: VAULT_DOCUMENT_MIGRATION_STATES.PENDING,
      source_retirement_state: VAULT_DOCUMENT_MIGRATION_SOURCE_RETIREMENT_STATES.ACTIVE,
    });

    const { migration, error: migrationError } = await createVaultDocumentMigrationRecord({
      vaultId: planRecord.vault_id,
      sourceDocumentId: planRecord.source_document_id,
      targetDocumentId: null,
      sourceVaultDeviceId: planRecord.source_vault_device_id,
      targetVaultDeviceId: planRecord.target_vault_device_id,
      state: planRecord.state,
      failureReason: planRecord.failure_reason,
      sourceRetirementState: planRecord.source_retirement_state,
      completedAt: planRecord.completed_at,
      sourceRetiredAt: planRecord.source_retired_at,
      metadata: buildPlanningMetadata(),
    });
    if (migrationError) {
      recordVaultMigrationPlanningSentinelCounter(
        VAULT_MIGRATION_PLANNING_SENTINEL_COUNTERS.ERROR_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "MIGRATION_PLAN_CREATE_FAILED",
          error: migrationError.message || "Unable to create migration planning record.",
        },
        { status: 502 }
      );
    }

    recordVaultMigrationPlanningSentinelCounter(
      VAULT_MIGRATION_PLANNING_SENTINEL_COUNTERS.CREATED_TOTAL
    );

    return NextResponse.json({
      success: true,
      migration: serializeMigrationPlan(migration),
      phase_boundary: {
        execution_enabled: false,
        ciphertext_movement_enabled: false,
        signed_url_issuance_enabled: false,
        source_retirement_enabled: false,
        aad_activation_enabled: false,
      },
      aad_v3_note: "target_document_id must exist before client-side AAD v3 encryption.",
    });
  } catch {
    recordVaultMigrationPlanningSentinelCounter(
      VAULT_MIGRATION_PLANNING_SENTINEL_COUNTERS.ERROR_TOTAL
    );
    return NextResponse.json(
      { success: false, code: "INVALID_REQUEST", error: "Invalid migration planning request." },
      { status: 400 }
    );
  }
}

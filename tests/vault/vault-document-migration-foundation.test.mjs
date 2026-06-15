import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildVaultDocumentAad,
  VAULT_ALLOWED_ENCRYPTION_VERSIONS,
  VAULT_ENCRYPTION_VERSION_LEGACY,
  VAULT_ENCRYPTION_VERSION_MVK,
} from "../../app/lib/vaultDocumentClient.js";
import {
  assertMigrationStateTransition,
  assertVaultOwnershipKeyRegistrationAllowed,
  assertVaultDocumentMigrationState,
  buildVaultScopedDocumentAad,
  canRegisterVaultOwnershipKey,
  canRetireMigrationSource,
  canTransitionMigrationState,
  isVaultDocumentMigrationUploadExpired,
  isVaultDocumentMigrationState,
  validateVaultDocumentAadVersionBinding,
  validateVaultDocumentMigrationRecord,
  VAULT_DOCUMENT_AAD_VERSION_DEFAULT,
  VAULT_DOCUMENT_AAD_VERSION_FIELD,
  VAULT_DOCUMENT_AAD_VERSIONS,
  VAULT_DOCUMENT_MIGRATION_FAILURE_REASONS,
  VAULT_DOCUMENT_MIGRATION_SOURCE_RETIREMENT_STATES,
  VAULT_DOCUMENT_MIGRATION_STATES,
  VAULT_DOCUMENT_MIGRATION_STATE_VALUES,
  VAULT_DOCUMENT_MIGRATION_TARGET_DOC_ID_POLICIES,
  VAULT_DOCUMENT_MIGRATION_TARGET_DOC_ID_POLICY,
  VAULT_DOCUMENT_MIGRATION_UPLOAD_TIMEOUT_MS,
  VAULT_OWNERSHIP_KEY_REGISTRATION_POLICIES,
  VAULT_OWNERSHIP_KEY_STATES,
  VAULT_SCOPED_DOCUMENT_AAD_FORMAT_VERSION,
  VAULT_SCOPED_DOCUMENT_AAD_PREFIX,
  VAULT_SCOPED_DOCUMENT_AAD_VERSION,
} from "../../app/lib/vaultDocumentMigration.js";

const VAULT_ID = "44444444-4444-4444-8444-444444444444";
const DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const TARGET_DEVICE_ID = "55555555-5555-4555-8555-555555555555";
const DOC_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_DOC_ID = "22222222-2222-4222-8222-222222222222";
const CONTENT_TYPE = "application/pdf";

test("buildVaultScopedDocumentAad generates deterministic AAD v3", () => {
  assert.equal(VAULT_SCOPED_DOCUMENT_AAD_VERSION, 3);
  assert.equal(VAULT_SCOPED_DOCUMENT_AAD_FORMAT_VERSION, 3);
  assert.equal(VAULT_DOCUMENT_AAD_VERSION_FIELD, "aad_version");
  assert.equal(VAULT_DOCUMENT_AAD_VERSION_DEFAULT, 1);
  assert.deepEqual(VAULT_DOCUMENT_AAD_VERSIONS, {
    DEVICE_SCOPED_V1: 1,
    VAULT_SCOPED_V3: 3,
  });
  assert.equal(
    buildVaultScopedDocumentAad({
      vaultId: VAULT_ID,
      docId: DOC_ID,
      contentType: CONTENT_TYPE,
    }),
    `${VAULT_SCOPED_DOCUMENT_AAD_PREFIX}|vault_id=${VAULT_ID}|doc_id=${DOC_ID}|content_type=${CONTENT_TYPE}`
  );
});

test("buildVaultScopedDocumentAad trims inputs and rejects missing values", () => {
  assert.equal(
    buildVaultScopedDocumentAad({
      vaultId: ` ${VAULT_ID} `,
      docId: ` ${DOC_ID} `,
      contentType: ` ${CONTENT_TYPE} `,
    }),
    `${VAULT_SCOPED_DOCUMENT_AAD_PREFIX}|vault_id=${VAULT_ID}|doc_id=${DOC_ID}|content_type=${CONTENT_TYPE}`
  );

  assert.throws(
    () => buildVaultScopedDocumentAad({ vaultId: "", docId: DOC_ID, contentType: CONTENT_TYPE }),
    /vault_id is required/
  );
  assert.throws(
    () => buildVaultScopedDocumentAad({ vaultId: VAULT_ID, docId: "", contentType: CONTENT_TYPE }),
    /doc_id is required/
  );
  assert.throws(
    () => buildVaultScopedDocumentAad({ vaultId: VAULT_ID, docId: DOC_ID, contentType: "" }),
    /content_type is required/
  );
});

test("buildVaultScopedDocumentAad validates ids and normalizes content type", () => {
  assert.equal(
    buildVaultScopedDocumentAad({
      vaultId: VAULT_ID.toUpperCase(),
      docId: DOC_ID.toUpperCase(),
      contentType: "Application/PDF",
    }),
    `${VAULT_SCOPED_DOCUMENT_AAD_PREFIX}|vault_id=${VAULT_ID}|doc_id=${DOC_ID}|content_type=application/pdf`
  );

  assert.throws(
    () =>
      buildVaultScopedDocumentAad({
        vaultId: "not-a-vault-id",
        docId: DOC_ID,
        contentType: CONTENT_TYPE,
      }),
    /vault_id must be a valid UUID/
  );
  assert.throws(
    () =>
      buildVaultScopedDocumentAad({
        vaultId: VAULT_ID,
        docId: "not-a-doc-id",
        contentType: CONTENT_TYPE,
      }),
    /doc_id must be a valid UUID/
  );
  assert.throws(
    () =>
      buildVaultScopedDocumentAad({
        vaultId: VAULT_ID,
        docId: DOC_ID,
        contentType: "application/pdf|vault_id=evil",
      }),
    /content_type must be a valid MIME type/
  );
});

test("migration state constants define Phase 0 model", () => {
  assert.deepEqual(VAULT_DOCUMENT_MIGRATION_STATES, {
    PENDING: "pending",
    UPLOADING: "uploading",
    COMPLETED: "completed",
    FAILED: "failed",
    CANCELLED: "cancelled",
  });
  assert.deepEqual(VAULT_DOCUMENT_MIGRATION_STATE_VALUES, [
    "pending",
    "uploading",
    "completed",
    "failed",
    "cancelled",
  ]);

  for (const state of VAULT_DOCUMENT_MIGRATION_STATE_VALUES) {
    assert.equal(isVaultDocumentMigrationState(state), true);
    assert.equal(assertVaultDocumentMigrationState(state), state);
  }

  assert.equal(isVaultDocumentMigrationState("migrated"), false);
  assert.throws(() => assertVaultDocumentMigrationState("migrated"), /Invalid vault document/);
});

test("canTransitionMigrationState enforces terminal states", () => {
  assert.equal(canTransitionMigrationState("pending", "uploading"), true);
  assert.equal(canTransitionMigrationState("uploading", "completed"), true);
  assert.equal(canTransitionMigrationState("uploading", "failed"), true);
  assert.equal(canTransitionMigrationState("uploading", "cancelled"), true);

  assert.equal(canTransitionMigrationState("pending", "completed"), false);
  assert.equal(canTransitionMigrationState("pending", "failed"), false);
  assert.equal(canTransitionMigrationState("pending", "cancelled"), false);
  assert.equal(canTransitionMigrationState("completed", "pending"), false);
  assert.equal(canTransitionMigrationState("failed", "pending"), false);
  assert.equal(canTransitionMigrationState("cancelled", "pending"), false);
  assert.equal(assertMigrationStateTransition("pending", "uploading"), "uploading");
  assert.throws(
    () => assertMigrationStateTransition("completed", "pending"),
    /Invalid vault document migration transition/
  );
});

test("migration failure reasons stay safe and non-secret", () => {
  assert.deepEqual(VAULT_DOCUMENT_MIGRATION_FAILURE_REASONS, {
    DECRYPT_FAILED: "decrypt_failed",
    DOWNLOAD_FAILED: "download_failed",
    UPLOAD_FAILED: "upload_failed",
    SLOT_OCCUPIED: "slot_occupied",
    VERIFY_FAILED: "verify_failed",
    COMMIT_FAILED: "commit_failed",
    VAULT_MISMATCH: "vault_mismatch",
    USER_CANCELLED: "user_cancelled",
    UPLOAD_EXPIRED: "upload_expired",
  });

  const serialized = JSON.stringify(VAULT_DOCUMENT_MIGRATION_FAILURE_REASONS);
  assert.doesNotMatch(serialized, /pin|phrase|secret|mvk|key/i);
});

test("source retirement is represented separately from migration completion", () => {
  assert.deepEqual(VAULT_DOCUMENT_MIGRATION_SOURCE_RETIREMENT_STATES, {
    ACTIVE: "active",
    SOURCE_RETIRED: "source_retired",
  });
  assert.equal(VAULT_DOCUMENT_MIGRATION_STATES.COMPLETED, "completed");
  assert.equal(
    VAULT_DOCUMENT_MIGRATION_SOURCE_RETIREMENT_STATES.SOURCE_RETIRED,
    "source_retired"
  );
  assert.equal(
    canRetireMigrationSource({
      migrationState: "completed",
      sourceRetirementState: "active",
    }),
    true
  );
  assert.equal(
    canRetireMigrationSource({
      migrationState: "uploading",
      sourceRetirementState: "active",
    }),
    false
  );
  assert.equal(
    canRetireMigrationSource({
      migrationState: "completed",
      sourceRetirementState: "source_retired",
    }),
    false
  );
});

test("ownership key registration is TOFU immutable", () => {
  assert.deepEqual(VAULT_OWNERSHIP_KEY_STATES, {
    MISSING: "missing",
    ACTIVE: "active",
  });
  assert.deepEqual(VAULT_OWNERSHIP_KEY_REGISTRATION_POLICIES, {
    TOFU_IMMUTABLE: "tofu_immutable",
  });
  assert.equal(canRegisterVaultOwnershipKey({ existingPublicKey: null }), true);
  assert.equal(canRegisterVaultOwnershipKey({ existingPublicKey: "" }), true);
  assert.equal(canRegisterVaultOwnershipKey({ existingPublicKey: "public-key" }), false);
  assert.equal(assertVaultOwnershipKeyRegistrationAllowed({ existingPublicKey: null }), true);
  assert.throws(
    () => assertVaultOwnershipKeyRegistrationAllowed({ existingPublicKey: "public-key" }),
    /already registered and is immutable/
  );
});

test("stale uploading policy expires uploads after configured timeout", () => {
  const now = Date.parse("2026-06-14T16:00:00.000Z");
  const fresh = now - VAULT_DOCUMENT_MIGRATION_UPLOAD_TIMEOUT_MS;
  const stale = fresh - 1;

  assert.equal(VAULT_DOCUMENT_MIGRATION_UPLOAD_TIMEOUT_MS, 30 * 60 * 1000);
  assert.equal(isVaultDocumentMigrationUploadExpired(fresh, now), false);
  assert.equal(isVaultDocumentMigrationUploadExpired(stale, now), true);
  assert.equal(
    isVaultDocumentMigrationUploadExpired("2026-06-14T15:29:59.999Z", now),
    true
  );
  assert.throws(
    () => isVaultDocumentMigrationUploadExpired("not-a-date", now),
    /upload_started_at must be a valid timestamp/
  );
});

test("target doc id policy requires a new target document id", () => {
  assert.deepEqual(VAULT_DOCUMENT_MIGRATION_TARGET_DOC_ID_POLICIES, {
    NEW_TARGET_DOC_ID: "new_target_doc_id",
  });
  assert.equal(VAULT_DOCUMENT_MIGRATION_TARGET_DOC_ID_POLICY, "new_target_doc_id");
});

test("AAD v3 schema binding requires vault_id", () => {
  assert.equal(validateVaultDocumentAadVersionBinding({ aad_version: 1, vault_id: null }), true);
  assert.equal(validateVaultDocumentAadVersionBinding({ aad_version: 3, vault_id: VAULT_ID }), true);
  assert.throws(
    () => validateVaultDocumentAadVersionBinding({ aad_version: 3, vault_id: null }),
    /vault_id is required/
  );
  assert.throws(
    () => validateVaultDocumentAadVersionBinding({ aad_version: 2, vault_id: VAULT_ID }),
    /aad_version must be 1 or 3/
  );
});

test("validateVaultDocumentMigrationRecord normalizes and enforces model invariants", () => {
  const normalized = validateVaultDocumentMigrationRecord({
    vault_id: VAULT_ID.toUpperCase(),
    source_document_id: DOC_ID.toUpperCase(),
    target_document_id: TARGET_DOC_ID.toUpperCase(),
    source_vault_device_id: DEVICE_ID.toUpperCase(),
    target_vault_device_id: TARGET_DEVICE_ID.toUpperCase(),
    state: "pending",
  });

  assert.deepEqual(normalized, {
    vault_id: VAULT_ID,
    source_document_id: DOC_ID,
    target_document_id: TARGET_DOC_ID,
    source_vault_device_id: DEVICE_ID,
    target_vault_device_id: TARGET_DEVICE_ID,
    state: "pending",
    failure_reason: null,
    source_retirement_state: "active",
    completed_at: null,
    source_retired_at: null,
  });

  assert.throws(
    () =>
      validateVaultDocumentMigrationRecord({
        vault_id: VAULT_ID,
        source_document_id: DOC_ID,
        target_document_id: DOC_ID,
        source_vault_device_id: DEVICE_ID,
        target_vault_device_id: TARGET_DEVICE_ID,
        state: "pending",
      }),
    /target_document_id must be distinct/
  );
  assert.throws(
    () =>
      validateVaultDocumentMigrationRecord({
        vault_id: VAULT_ID,
        source_document_id: DOC_ID,
        source_vault_device_id: DEVICE_ID,
        target_vault_device_id: DEVICE_ID,
        state: "pending",
      }),
    /target_vault_device_id must differ/
  );
});

test("validateVaultDocumentMigrationRecord enforces terminal state consistency", () => {
  assert.deepEqual(
    validateVaultDocumentMigrationRecord({
      vault_id: VAULT_ID,
      source_document_id: DOC_ID,
      target_document_id: TARGET_DOC_ID,
      source_vault_device_id: DEVICE_ID,
      target_vault_device_id: TARGET_DEVICE_ID,
      state: "completed",
      completed_at: "2026-06-14T16:00:00.000Z",
    }),
    {
      vault_id: VAULT_ID,
      source_document_id: DOC_ID,
      target_document_id: TARGET_DOC_ID,
      source_vault_device_id: DEVICE_ID,
      target_vault_device_id: TARGET_DEVICE_ID,
      state: "completed",
      failure_reason: null,
      source_retirement_state: "active",
      completed_at: "2026-06-14T16:00:00.000Z",
      source_retired_at: null,
    }
  );

  assert.throws(
    () =>
      validateVaultDocumentMigrationRecord({
        vault_id: VAULT_ID,
        source_document_id: DOC_ID,
        source_vault_device_id: DEVICE_ID,
        target_vault_device_id: TARGET_DEVICE_ID,
        state: "completed",
        completed_at: "2026-06-14T16:00:00.000Z",
      }),
    /completed migration requires target_document_id/
  );
  assert.throws(
    () =>
      validateVaultDocumentMigrationRecord({
        vault_id: VAULT_ID,
        source_document_id: DOC_ID,
        source_vault_device_id: DEVICE_ID,
        target_vault_device_id: TARGET_DEVICE_ID,
        state: "failed",
      }),
    /failed migration requires/
  );
  assert.throws(
    () =>
      validateVaultDocumentMigrationRecord({
        vault_id: VAULT_ID,
        source_document_id: DOC_ID,
        source_vault_device_id: DEVICE_ID,
        target_vault_device_id: TARGET_DEVICE_ID,
        state: "cancelled",
        failure_reason: "upload_failed",
      }),
    /cancelled migration requires user_cancelled/
  );
  assert.throws(
    () =>
      validateVaultDocumentMigrationRecord({
        vault_id: VAULT_ID,
        source_document_id: DOC_ID,
        source_vault_device_id: DEVICE_ID,
        target_vault_device_id: TARGET_DEVICE_ID,
        state: "uploading",
        failure_reason: "upload_expired",
      }),
    /non-terminal migration must not have/
  );
});

test("validateVaultDocumentMigrationRecord enforces source retirement consistency", () => {
  assert.equal(
    validateVaultDocumentMigrationRecord({
      vault_id: VAULT_ID,
      source_document_id: DOC_ID,
      target_document_id: TARGET_DOC_ID,
      source_vault_device_id: DEVICE_ID,
      target_vault_device_id: TARGET_DEVICE_ID,
      state: "completed",
      completed_at: "2026-06-14T16:00:00.000Z",
      source_retirement_state: "source_retired",
      source_retired_at: "2026-06-14T16:05:00.000Z",
    }).source_retirement_state,
    "source_retired"
  );

  assert.throws(
    () =>
      validateVaultDocumentMigrationRecord({
        vault_id: VAULT_ID,
        source_document_id: DOC_ID,
        target_document_id: TARGET_DOC_ID,
        source_vault_device_id: DEVICE_ID,
        target_vault_device_id: TARGET_DEVICE_ID,
        state: "completed",
        completed_at: "2026-06-14T16:00:00.000Z",
        source_retirement_state: "source_retired",
      }),
    /source_retired requires/
  );
  assert.throws(
    () =>
      validateVaultDocumentMigrationRecord({
        vault_id: VAULT_ID,
        source_document_id: DOC_ID,
        source_vault_device_id: DEVICE_ID,
        target_vault_device_id: TARGET_DEVICE_ID,
        state: "pending",
        source_retired_at: "2026-06-14T16:05:00.000Z",
      }),
    /active source retirement state/
  );
});

test("Phase 0 preserves current device-scoped AAD and encryption version assumptions", () => {
  assert.equal(
    buildVaultDocumentAad(DEVICE_ID, DOC_ID, CONTENT_TYPE),
    `${DEVICE_ID}|${DOC_ID}|${CONTENT_TYPE}`
  );
  assert.deepEqual(VAULT_ALLOWED_ENCRYPTION_VERSIONS, [
    VAULT_ENCRYPTION_VERSION_LEGACY,
    VAULT_ENCRYPTION_VERSION_MVK,
  ]);
  assert.equal(VAULT_ALLOWED_ENCRYPTION_VERSIONS.includes(VAULT_SCOPED_DOCUMENT_AAD_VERSION), false);
  assert.equal(VAULT_ALLOWED_ENCRYPTION_VERSIONS.includes(VAULT_DOCUMENT_AAD_VERSIONS.VAULT_SCOPED_V3), false);
});

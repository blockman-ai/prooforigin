import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "node:module";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const SOURCE_DEVICE_ID = "55555555-5555-4555-8555-555555555555";
const VAULT_ID = "44444444-4444-4444-8444-444444444444";
const SOURCE_DOCUMENT_ID = "11111111-1111-4111-9111-111111111111";
const MIGRATION_ID = "99999999-9999-4999-8999-999999999999";
const TARGET_DOC_ID = "22222222-2222-4222-8222-222222222222";
const LIVE_PATH = `${DEVICE_ID}/${TARGET_DOC_ID}.enc`;
const SHA256 = "b".repeat(64);

test("completed migration commit returns idempotent success without duplicate promotion", async (t) => {
  let duplicateDocumentCreation = false;
  let duplicateEventCreation = false;
  let duplicateCopy = false;

  mock.module("../../app/lib/vaultAuth.js", {
    exports: {
      authorizeVaultRequest: async () => ({ ok: true, vault_device_id: DEVICE_ID }),
      isVaultDocumentCompromised: (document) => Boolean(document?.compromised_at),
      vaultAuthFailureResponse: (auth) => auth,
    },
  });
  mock.module("../../app/lib/vaultAdmin.js", {
    exports: {
      VAULT_ALLOWED_ENCRYPTION_VERSIONS: [1, 2],
      VAULT_DOCUMENT_AAD_VERSION_LEGACY: 1,
      VAULT_DOCUMENT_AAD_VERSION_VAULT_SCOPED: 3,
      VAULT_ENCRYPTION_VERSION_MVK: 2,
      createVaultAdminClient: () => ({}),
      buildVaultDocumentStoragePath: (deviceId, docId) => `${deviceId}/${docId}.enc`,
      buildVaultMigrationStagingStoragePath: ({ vaultId, migrationId, targetDocumentId }) =>
        `migrations/${vaultId}/${migrationId}/${targetDocumentId}.enc`,
      isVaultAdminConfigured: () => true,
      getBoundVaultDeviceRegistration: async () => ({
        registration: { vault_device_id: DEVICE_ID, vault_id: VAULT_ID },
        error: null,
      }),
      hasVerifiedVaultOwnershipForDevice: async () => ({ verified: true, error: null }),
      getVaultDocumentMigrationById: async () => ({
        migration: {
          id: MIGRATION_ID,
          vault_id: VAULT_ID,
          source_document_id: SOURCE_DOCUMENT_ID,
          target_document_id: TARGET_DOC_ID,
          source_vault_device_id: SOURCE_DEVICE_ID,
          target_vault_device_id: DEVICE_ID,
          state: "completed",
          source_retirement_state: "active",
          metadata: {
            live_storage_path: LIVE_PATH,
            staging_ciphertext_sha256: SHA256,
            staging_ciphertext_bytes: 2048,
            staging_content_type: "application/pdf",
            source_retirement_eligible: true,
            source_retirement_not_before: "2026-06-22T11:00:00.000Z",
            staging_cleanup_pending: true,
            target_label_preserved: true,
          },
        },
        error: null,
      }),
      getVaultDocumentByDevice: async () => ({
        document: {
          id: TARGET_DOC_ID,
          vault_device_id: DEVICE_ID,
          vault_id: VAULT_ID,
          aad_version: 3,
          storage_path: LIVE_PATH,
          ciphertext_sha256: SHA256,
          ciphertext_bytes: 2048,
          content_type_hint: "application/pdf",
          label_present: true,
          deleted_at: null,
        },
        error: null,
      }),
      getVaultDocumentById: async () => {
        throw new Error("source lookup should not run for completed idempotent commit");
      },
      verifyVaultCiphertextObject: async () => {
        throw new Error("storage verification should not run for completed idempotent commit");
      },
      copyVaultStorageObject: async () => {
        duplicateCopy = true;
        return { error: null };
      },
      deleteVaultStorageObject: async () => ({ error: null }),
      markVaultDocumentMigrationFailed: async () => {
        throw new Error("failure marker should not run for completed idempotent commit");
      },
      commitVaultDocumentMigrationAtomic: async () => {
        duplicateDocumentCreation = true;
        return { error: null };
      },
    },
  });
  mock.module("../../app/lib/vaultDocumentState.js", {
    exports: {
      VAULT_DOCUMENT_EVENT_TYPES: { CREATED: "created" },
      VAULT_DOCUMENT_GENESIS_STATE_HASH: "0".repeat(64),
      computeVaultDocumentStateHash: () => {
        duplicateEventCreation = true;
        return "1".repeat(64);
      },
    },
  });
  mock.module("../../app/lib/vaultMigrationExecutionSentinelCounters.js", {
    exports: {
      VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS: {
        COMMIT_REQUEST_TOTAL: "vault.migration.execution.commit.request_total",
        COMMIT_SUCCESS_TOTAL: "vault.migration.execution.commit.success_total",
        COMMIT_REJECTED_TOTAL: "vault.migration.execution.commit.rejected_total",
        COMMIT_SLOT_OCCUPIED_TOTAL: "vault.migration.execution.commit.slot_occupied_total",
        COMMIT_ROLLBACK_TOTAL: "vault.migration.execution.commit.rollback_total",
        COMMIT_FAILED_TOTAL: "vault.migration.execution.commit.failed_total",
        RETIREMENT_ELIGIBLE_TOTAL: "vault.migration.execution.retirement_eligible.total",
        ERROR_TOTAL: "vault.migration.execution.error_total",
      },
      recordVaultMigrationExecutionSentinelCounter: () => {},
    },
  });

  const { POST } = await import("../../app/api/vault/document-migration/commit/route.js");
  const response = await POST(
    new Request("http://localhost/api/vault/document-migration/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        migration_id: MIGRATION_ID,
        source_document_id: SOURCE_DOCUMENT_ID,
        target_document_id: TARGET_DOC_ID,
      }),
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.idempotent, true);
  assert.equal(json.document.id, TARGET_DOC_ID);
  assert.equal(duplicateCopy, false);
  assert.equal(duplicateDocumentCreation, false);
  assert.equal(duplicateEventCreation, false);

  t.mock.restoreAll();
});

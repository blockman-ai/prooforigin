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
const STAGING_PATH = `migrations/${VAULT_ID}/${MIGRATION_ID}/${TARGET_DOC_ID}.enc`;
const SOURCE_STORAGE_PATH = `${SOURCE_DEVICE_ID}/${SOURCE_DOCUMENT_ID}.enc`;

function baseMigration(state, metadata = {}) {
  return {
    id: MIGRATION_ID,
    vault_id: VAULT_ID,
    source_document_id: SOURCE_DOCUMENT_ID,
    target_document_id: TARGET_DOC_ID,
    source_vault_device_id: SOURCE_DEVICE_ID,
    target_vault_device_id: DEVICE_ID,
    state,
    failure_reason: state === "failed" ? "verify_failed" : null,
    source_retirement_state: "active",
    metadata: {
      source_storage_path: SOURCE_STORAGE_PATH,
      staging_storage_path: STAGING_PATH,
      staging_cleanup_state: "pending",
      staging_cleanup_attempts: 0,
      cleanup_version: 1,
      ...metadata,
    },
  };
}

test("staging cleanup deletes only migration staging objects for terminal migrations", async (t) => {
  const deletedPaths = [];
  const counters = [];
  let scenario = { migration: baseMigration("completed"), deleteError: null };
  let lastMetadataPatch = null;

  mock.module("../../app/lib/vaultAuth.js", {
    exports: {
      authorizeVaultRequest: async () => ({ ok: true, vault_device_id: DEVICE_ID }),
      vaultAuthFailureResponse: (auth) => auth,
    },
  });
  mock.module("../../app/lib/vaultAdmin.js", {
    exports: {
      buildVaultMigrationStagingStoragePath: ({ vaultId, migrationId, targetDocumentId }) =>
        `migrations/${vaultId}/${migrationId}/${targetDocumentId}.enc`,
      deleteVaultStorageObject: async (storagePath) => {
        deletedPaths.push(storagePath);
        return { storagePath, error: scenario.deleteError };
      },
      getBoundVaultDeviceRegistration: async () => ({
        registration: { vault_device_id: DEVICE_ID, vault_id: VAULT_ID },
        error: null,
      }),
      getVaultDocumentMigrationById: async () => ({
        migration: scenario.migration,
        error: null,
      }),
      hasVerifiedVaultOwnershipForDevice: async () => ({ verified: true, error: null }),
      isVaultAdminConfigured: () => true,
      updateVaultDocumentMigrationMetadata: async ({ metadata }) => {
        lastMetadataPatch = metadata;
        scenario.migration = {
          ...scenario.migration,
          metadata: {
            ...scenario.migration.metadata,
            ...metadata,
          },
        };
        return { migration: scenario.migration, error: null };
      },
    },
  });
  mock.module("../../app/lib/vaultMigrationExecutionSentinelCounters.js", {
    exports: {
      VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS: {
        CLEANUP_REQUEST_TOTAL: "vault.migration.execution.cleanup.request_total",
        CLEANUP_STAGING_DELETED_TOTAL: "vault.migration.execution.cleanup.staging.deleted_total",
        CLEANUP_STAGING_MISSING_TOTAL: "vault.migration.execution.cleanup.staging.missing_total",
        CLEANUP_STAGING_FAILED_TOTAL: "vault.migration.execution.cleanup.staging.failed_total",
        CLEANUP_REJECTED_TOTAL: "vault.migration.execution.cleanup.rejected_total",
        ERROR_TOTAL: "vault.migration.execution.error_total",
      },
      recordVaultMigrationExecutionSentinelCounter: (key) => counters.push(key),
    },
  });

  const { POST } = await import("../../app/api/vault/document-migration/staging-cleanup/route.js");
  async function cleanupFor(migration, deleteError = null) {
    scenario = { migration, deleteError };
    lastMetadataPatch = null;
    const response = await POST(
      new Request("http://localhost/api/vault/document-migration/staging-cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ migration_id: MIGRATION_ID }),
      })
    );
    return { response, json: await response.json(), patch: lastMetadataPatch };
  }

  for (const state of ["completed", "failed", "cancelled"]) {
    const { response, json, patch } = await cleanupFor(baseMigration(state));
    assert.equal(response.status, 200);
    assert.equal(json.success, true);
    assert.equal(json.staging_cleanup_state, "deleted");
    assert.equal(patch.staging_cleanup_state, "deleted");
    assert.equal(patch.staging_cleanup_attempts, 1);
    assert.equal(patch.cleanup_version, 1);
  }

  const missing = await cleanupFor(baseMigration("completed"), {
    statusCode: "404",
    message: "Object not found",
  });
  assert.equal(missing.response.status, 200);
  assert.equal(missing.json.success, true);
  assert.equal(missing.json.staging_cleanup_state, "deleted");

  const idempotent = await cleanupFor(
    baseMigration("completed", {
      staging_cleanup_state: "deleted",
      staging_cleanup_completed_at: "2026-06-15T11:00:00.000Z",
    })
  );
  assert.equal(idempotent.response.status, 200);
  assert.equal(idempotent.json.idempotent, true);
  assert.equal(idempotent.patch, null);

  assert.equal(deletedPaths.every((path) => path === STAGING_PATH), true);
  assert.equal(deletedPaths.includes(SOURCE_STORAGE_PATH), false);
  assert.equal(counters.includes("vault.migration.execution.cleanup.staging.deleted_total"), true);
  assert.equal(counters.includes("vault.migration.execution.cleanup.staging.missing_total"), true);

  t.mock.restoreAll();
});

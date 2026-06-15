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

test("staging-verify rejects wrong size", async (t) => {
  mock.module("../../app/lib/vaultAuth.js", {
    exports: {
      authorizeVaultRequest: async () => ({ ok: true, vault_device_id: DEVICE_ID }),
      isVaultDocumentCompromised: (document) => Boolean(document?.compromised_at),
      vaultAuthFailureResponse: (auth) => auth,
    },
  });
  mock.module("../../app/lib/vaultAdmin.js", {
    exports: {
      VAULT_DOCUMENT_AAD_VERSION_VAULT_SCOPED: 3,
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
          state: "uploading",
          metadata: { staging_storage_path: `migrations/${VAULT_ID}/${MIGRATION_ID}/${TARGET_DOC_ID}.enc` },
        },
        error: null,
      }),
      getVaultDocumentById: async () => ({
        document: {
          id: SOURCE_DOCUMENT_ID,
          vault_id: VAULT_ID,
          vault_device_id: SOURCE_DEVICE_ID,
          deleted_at: null,
          compromised_at: null,
        },
        error: null,
      }),
      verifyVaultCiphertextObject: async () => ({
        ok: false,
        code: "STORAGE_SIZE_MISMATCH",
        error: "size mismatch",
      }),
      markVaultDocumentMigrationStagingVerified: async () => ({ migration: null, error: null }),
    },
  });
  mock.module("../../app/lib/vaultMigrationExecutionSentinelCounters.js", {
    exports: {
      VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS: {
        SOURCE_URL_REQUEST_TOTAL: "vault.migration.execution.source_url.request_total",
        SOURCE_URL_ISSUED_TOTAL: "vault.migration.execution.source_url.issued_total",
        SOURCE_URL_REJECTED_TOTAL: "vault.migration.execution.source_url.rejected_total",
        STAGING_UPLOAD_REQUEST_TOTAL: "vault.migration.execution.staging_upload.request_total",
        STAGING_UPLOAD_ISSUED_TOTAL: "vault.migration.execution.staging_upload.issued_total",
        STAGING_UPLOAD_REJECTED_TOTAL: "vault.migration.execution.staging_upload.rejected_total",
        STAGING_VERIFY_REQUEST_TOTAL: "vault.migration.execution.staging_verify.request_total",
        STAGING_VERIFY_SUCCESS_TOTAL: "vault.migration.execution.staging_verify.success_total",
        STAGING_VERIFY_FAILED_TOTAL: "vault.migration.execution.staging_verify.failed_total",
        ERROR_TOTAL: "vault.migration.execution.error_total",
      },
      recordVaultMigrationExecutionSentinelCounter: () => {},
    },
  });

  const { POST } = await import("../../app/api/vault/document-migration/staging-verify/route.js");
  const response = await POST(
    new Request("http://localhost/api/vault/document-migration/staging-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        migration_id: MIGRATION_ID,
        source_document_id: SOURCE_DOCUMENT_ID,
        target_document_id: TARGET_DOC_ID,
        ciphertext_sha256: "b".repeat(64),
        ciphertext_bytes: 2048,
        content_type: "application/pdf",
        aad_version: 3,
      }),
    })
  );
  const json = await response.json();

  assert.equal(response.status, 409);
  assert.equal(json.code, "STORAGE_SIZE_MISMATCH");

  t.mock.restoreAll();
});

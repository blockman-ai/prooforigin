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
const RETIRED_AT = "2026-06-30T11:00:00.000Z";

function migration(overrides = {}) {
  return {
    id: MIGRATION_ID,
    vault_id: VAULT_ID,
    source_document_id: SOURCE_DOCUMENT_ID,
    target_document_id: TARGET_DOC_ID,
    source_vault_device_id: SOURCE_DEVICE_ID,
    target_vault_device_id: DEVICE_ID,
    state: "completed",
    source_retirement_state: "active",
    source_retired_at: null,
    metadata: {
      expected_source_ciphertext_sha256: SHA256,
      source_retirement_eligible: true,
      source_retirement_not_before: "2020-01-01T00:00:00.000Z",
      live_storage_path: LIVE_PATH,
      staging_ciphertext_sha256: SHA256,
      staging_ciphertext_bytes: 2048,
      staging_content_type: "application/pdf",
    },
    ...overrides,
  };
}

function document({ id, deviceId, sourceRetiredAt = null }) {
  return {
    id,
    vault_device_id: deviceId,
    vault_id: VAULT_ID,
    aad_version: 3,
    storage_path: deviceId === DEVICE_ID ? LIVE_PATH : `${SOURCE_DEVICE_ID}/${SOURCE_DOCUMENT_ID}.enc`,
    ciphertext_sha256: SHA256,
    ciphertext_bytes: 2048,
    content_type_hint: "application/pdf",
    encryption_version: 2,
    compromised_at: null,
    source_retired_at: sourceRetiredAt,
    deleted_at: null,
  };
}

test("retire-source enforces auth, not-before, soft retirement, and idempotency", async (t) => {
  let scenario = {};
  let retirePayload = null;

  mock.module("../../app/lib/vaultAuth.js", {
    exports: {
      authorizeVaultRequest: async () =>
        scenario.authFailure || { ok: true, vault_device_id: DEVICE_ID },
      isVaultDocumentCompromised: (doc) => Boolean(doc?.compromised_at),
      vaultAuthFailureResponse: (auth) => auth,
    },
  });
  mock.module("../../app/lib/vaultAdmin.js", {
    exports: {
      VAULT_DOCUMENT_AAD_VERSION_VAULT_SCOPED: 3,
      getBoundVaultDeviceRegistration: async () => ({
        registration: { vault_device_id: DEVICE_ID, vault_id: VAULT_ID },
        error: null,
      }),
      getVaultDocumentById: async (documentId) => ({
        document:
          documentId === SOURCE_DOCUMENT_ID
            ? scenario.sourceDocument
            : scenario.targetDocument,
        error: null,
      }),
      getVaultDocumentMigrationById: async () => ({
        migration: scenario.migration,
        error: null,
      }),
      hasVerifiedVaultOwnershipForDevice: async () => ({ verified: true, error: null }),
      isVaultAdminConfigured: () => true,
      retireVaultDocumentMigrationSourceAtomic: async (payload) => {
        retirePayload = payload;
        return {
          sourceDocument: {
            ...scenario.sourceDocument,
            source_retired_at: RETIRED_AT,
            deleted_at: null,
          },
          migration: {
            ...scenario.migration,
            source_retirement_state: "source_retired",
            source_retired_at: RETIRED_AT,
          },
          error: null,
        };
      },
    },
  });
  mock.module("../../app/lib/vaultMigrationExecutionSentinelCounters.js", {
    exports: {
      VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS: {
        RETIREMENT_REQUEST_TOTAL: "vault.migration.execution.retirement.request_total",
        RETIREMENT_SUCCESS_TOTAL: "vault.migration.execution.retirement.success_total",
        RETIREMENT_REJECTED_TOTAL: "vault.migration.execution.retirement.rejected_total",
        RETIREMENT_IDEMPOTENT_TOTAL: "vault.migration.execution.retirement.idempotent_total",
        RETIREMENT_NOT_BEFORE_REJECTED_TOTAL:
          "vault.migration.execution.retirement.not_before_rejected_total",
        RETIREMENT_TARGET_INVALID_TOTAL:
          "vault.migration.execution.retirement.target_invalid_total",
        RETIREMENT_SOURCE_INVALID_TOTAL:
          "vault.migration.execution.retirement.source_invalid_total",
        ERROR_TOTAL: "vault.migration.execution.error_total",
      },
      recordVaultMigrationExecutionSentinelCounter: () => {},
    },
  });

  const { POST } = await import("../../app/api/vault/document-migration/retire-source/route.js");
  async function retire() {
    const response = await POST(
      new Request("http://localhost/api/vault/document-migration/retire-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          migration_id: MIGRATION_ID,
          source_document_id: SOURCE_DOCUMENT_ID,
          target_document_id: TARGET_DOC_ID,
        }),
      })
    );
    return { response, json: await response.json() };
  }

  scenario = {
    authFailure: { ok: false, status: 401, code: "AUTH_FAILED" },
    migration: migration(),
    sourceDocument: document({ id: SOURCE_DOCUMENT_ID, deviceId: SOURCE_DEVICE_ID }),
    targetDocument: document({ id: TARGET_DOC_ID, deviceId: DEVICE_ID }),
  };
  const unauthorized = await retire();
  assert.equal(unauthorized.response.status, 401);
  assert.equal(unauthorized.json.code, "AUTH_FAILED");

  scenario = {
    migration: migration({
      metadata: {
        ...migration().metadata,
        source_retirement_not_before: "2999-01-01T00:00:00.000Z",
      },
    }),
    sourceDocument: document({ id: SOURCE_DOCUMENT_ID, deviceId: SOURCE_DEVICE_ID }),
    targetDocument: document({ id: TARGET_DOC_ID, deviceId: DEVICE_ID }),
  };
  const tooEarly = await retire();
  assert.equal(tooEarly.response.status, 409);
  assert.equal(tooEarly.json.code, "SOURCE_RETIREMENT_NOT_BEFORE");

  retirePayload = null;
  scenario = {
    migration: migration(),
    sourceDocument: document({ id: SOURCE_DOCUMENT_ID, deviceId: SOURCE_DEVICE_ID }),
    targetDocument: document({ id: TARGET_DOC_ID, deviceId: DEVICE_ID }),
  };
  const success = await retire();
  assert.equal(success.response.status, 200);
  assert.equal(success.json.success, true);
  assert.equal(success.json.idempotent, false);
  assert.equal(success.json.source_retirement_state, "source_retired");
  assert.equal(success.json.source_document_retired_at, RETIRED_AT);
  assert.equal(retirePayload.sourceDocumentId, SOURCE_DOCUMENT_ID);
  assert.equal(retirePayload.targetDocumentId, TARGET_DOC_ID);
  assert.equal(retirePayload.migrationMetadata.source_retirement_mode, "soft");

  retirePayload = null;
  scenario = {
    migration: migration({
      source_retirement_state: "source_retired",
      source_retired_at: RETIRED_AT,
    }),
    sourceDocument: document({
      id: SOURCE_DOCUMENT_ID,
      deviceId: SOURCE_DEVICE_ID,
      sourceRetiredAt: RETIRED_AT,
    }),
    targetDocument: document({ id: TARGET_DOC_ID, deviceId: DEVICE_ID }),
  };
  const idempotent = await retire();
  assert.equal(idempotent.response.status, 200);
  assert.equal(idempotent.json.success, true);
  assert.equal(idempotent.json.idempotent, true);
  assert.equal(idempotent.json.source_retired_at, RETIRED_AT);
  assert.equal(retirePayload, null);

  t.mock.restoreAll();
});

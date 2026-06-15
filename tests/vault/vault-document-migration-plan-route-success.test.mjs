import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "node:module";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const SOURCE_DEVICE_ID = "55555555-5555-4555-8555-555555555555";
const VAULT_ID = "44444444-4444-4444-8444-444444444444";
const SOURCE_DOCUMENT_ID = "11111111-1111-4111-9111-111111111111";

test("migration planning creates pending record only after ownership verification", async (t) => {
  let capturedPayload = null;
  const counterCalls = [];

  mock.module("../../app/lib/vaultAuth.js", {
    exports: {
      authorizeVaultRequest: async () => ({ ok: true, vault_device_id: DEVICE_ID }),
      isVaultDocumentCompromised: (document) => Boolean(document?.compromised_at),
      vaultAuthFailureResponse: (auth) => auth,
    },
  });

  mock.module("../../app/lib/vaultAdmin.js", {
    exports: {
      isVaultAdminConfigured: () => true,
      getBoundVaultDeviceRegistration: async () => ({
        registration: { vault_device_id: DEVICE_ID, vault_id: VAULT_ID },
        error: null,
      }),
      hasVerifiedVaultOwnershipForDevice: async () => ({ verified: true, error: null }),
      getVaultDocumentById: async () => ({
        document: {
          id: SOURCE_DOCUMENT_ID,
          vault_device_id: SOURCE_DEVICE_ID,
          vault_id: VAULT_ID,
        },
        error: null,
      }),
      createVaultDocumentMigrationRecord: async (payload) => {
        capturedPayload = payload;
        return {
          migration: {
            id: "99999999-9999-4999-8999-999999999999",
            vault_id: payload.vaultId,
            source_document_id: payload.sourceDocumentId,
            target_document_id: payload.targetDocumentId,
            source_vault_device_id: payload.sourceVaultDeviceId,
            target_vault_device_id: payload.targetVaultDeviceId,
            state: payload.state,
            failure_reason: payload.failureReason,
            source_retirement_state: payload.sourceRetirementState,
            created_at: "2026-06-14T18:00:00.000Z",
            updated_at: "2026-06-14T18:00:00.000Z",
            metadata: payload.metadata,
          },
          error: null,
        };
      },
    },
  });

  mock.module("../../app/lib/vaultMigrationPlanningSentinelCounters.js", {
    exports: {
      VAULT_MIGRATION_PLANNING_SENTINEL_COUNTERS: {
        REQUEST_TOTAL: "vault.migration.planning.request_total",
        CREATED_TOTAL: "vault.migration.planning.created_total",
        UNVERIFIED_DEVICE_TOTAL: "vault.migration.planning.unverified_device_total",
        VAULT_MISMATCH_TOTAL: "vault.migration.planning.vault_mismatch_total",
        ERROR_TOTAL: "vault.migration.planning.error_total",
      },
      recordVaultMigrationPlanningSentinelCounter: (key) => counterCalls.push(key),
    },
  });

  const { POST } = await import("../../app/api/vault/document-migration/plan/route.js");
  const response = await POST(
    new Request("http://localhost/api/vault/document-migration/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vault_id: VAULT_ID,
        source_document_id: SOURCE_DOCUMENT_ID,
      }),
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.migration.vault_id, VAULT_ID);
  assert.equal(json.migration.source_document_id, SOURCE_DOCUMENT_ID);
  assert.equal(json.migration.target_document_id, null);
  assert.equal(json.migration.source_vault_device_id, SOURCE_DEVICE_ID);
  assert.equal(json.migration.target_vault_device_id, DEVICE_ID);
  assert.equal(json.migration.state, "pending");
  assert.equal(json.migration.failure_reason, null);
  assert.equal(json.migration.source_retirement_state, "active");
  assert.equal(json.phase_boundary.execution_enabled, false);
  assert.equal(json.phase_boundary.ciphertext_movement_enabled, false);
  assert.equal(json.phase_boundary.signed_url_issuance_enabled, false);
  assert.equal(json.phase_boundary.source_retirement_enabled, false);
  assert.equal(json.phase_boundary.aad_activation_enabled, false);
  assert.match(json.aad_v3_note, /target_document_id must exist before/i);

  assert.equal(capturedPayload.vaultId, VAULT_ID);
  assert.equal(capturedPayload.sourceDocumentId, SOURCE_DOCUMENT_ID);
  assert.equal(capturedPayload.targetDocumentId, null);
  assert.equal(capturedPayload.sourceVaultDeviceId, SOURCE_DEVICE_ID);
  assert.equal(capturedPayload.targetVaultDeviceId, DEVICE_ID);
  assert.equal(capturedPayload.state, "pending");
  assert.equal(capturedPayload.failureReason, null);
  assert.equal(capturedPayload.sourceRetirementState, "active");
  assert.equal(capturedPayload.completedAt, null);
  assert.equal(capturedPayload.sourceRetiredAt, null);
  assert.equal(capturedPayload.metadata.execution_enabled, false);
  assert.equal(capturedPayload.metadata.ciphertext_movement_enabled, false);
  assert.equal(capturedPayload.metadata.signed_url_issuance_enabled, false);
  assert.equal(capturedPayload.metadata.source_retirement_enabled, false);
  assert.equal(capturedPayload.metadata.aad_activation_enabled, false);

  assert.deepEqual(counterCalls, [
    "vault.migration.planning.request_total",
    "vault.migration.planning.created_total",
  ]);

  t.mock.restoreAll();
});

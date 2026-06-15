import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "node:module";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const VAULT_ID = "44444444-4444-4444-8444-444444444444";
const SOURCE_DOCUMENT_ID = "11111111-1111-4111-9111-111111111111";

test("migration planning rejects unverified device", async (t) => {
  let createCalled = false;
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
      hasVerifiedVaultOwnershipForDevice: async () => ({ verified: false, error: null }),
      getVaultDocumentById: async () => {
        throw new Error("source lookup must not run before verification");
      },
      createVaultDocumentMigrationRecord: async () => {
        createCalled = true;
        return { migration: null, error: null };
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

  assert.equal(response.status, 403);
  assert.equal(json.success, false);
  assert.equal(json.code, "OWNERSHIP_VERIFICATION_REQUIRED");
  assert.equal(createCalled, false);
  assert.equal(counterCalls.includes("vault.migration.planning.unverified_device_total"), true);
  assert.equal(counterCalls.includes("vault.migration.planning.created_total"), false);

  t.mock.restoreAll();
});

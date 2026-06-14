import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "node:module";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const VAULT_ID = "44444444-4444-4444-8444-444444444444";

function buildAuthOk() {
  return {
    ok: true,
    vault_device_id: DEVICE_ID,
  };
}

test("migration discovery returns bound vault scoped candidates and redacts sensitive metadata", async (t) => {
  let migrationRecordCreateCalled = false;

  mock.module("../../app/lib/vaultAuth.js", {
    exports: {
      authorizeVaultRequest: async () => buildAuthOk(),
      vaultAuthFailureResponse: (auth) => auth,
    },
  });

  mock.module("../../app/lib/vaultAdmin.js", {
    exports: {
      isVaultAdminConfigured: () => true,
      getBoundVaultDeviceRegistration: async () => ({
        registration: {
          vault_device_id: DEVICE_ID,
          vault_id: VAULT_ID,
        },
        error: null,
      }),
      getVaultOwnershipKey: async () => ({
        ownershipKey: { id: "own-1", vault_id: VAULT_ID },
        error: null,
      }),
      listVaultDiscoveryDocuments: async () => ({
        documents: [
          {
            document_id: "99999999-9999-4999-8999-999999999999",
            aad_version: 1,
            encryption_version: 2,
            label_present: true,
            created_at: "2026-06-14T00:00:00.000Z",
            updated_at: "2026-06-14T01:00:00.000Z",
            storage_path: "should-not-return",
            content_type_hint: "application/pdf",
            ciphertext_bytes: 123,
            label_ciphertext: "abc",
            label_iv: "def",
            signed_url: "https://example.com/signed",
          },
        ],
        error: null,
      }),
      countLegacyUnboundVaultDocuments: async () => ({ count: 3, error: null }),
      createVaultDocumentMigrationRecord: async () => {
        migrationRecordCreateCalled = true;
        return { migration: null, error: null };
      },
    },
  });

  const counterCalls = [];
  mock.module("../../app/lib/vaultMigrationDiscoverySentinelCounters.js", {
    exports: {
      VAULT_MIGRATION_DISCOVERY_SENTINEL_COUNTERS: {
        REQUEST_TOTAL: "vault.migration.discovery.request_total",
        SUCCESS_TOTAL: "vault.migration.discovery.success_total",
        UNBOUND_DEVICE_TOTAL: "vault.migration.discovery.unbound_device_total",
        OWNERSHIP_KEY_ABSENT_TOTAL: "vault.migration.discovery.ownership_key_absent_total",
        ERROR_TOTAL: "vault.migration.discovery.error_total",
      },
      recordVaultMigrationDiscoverySentinelCounter: (key) => {
        counterCalls.push(key);
      },
    },
  });

  const { POST } = await import("../../app/api/vault/document-migration/discover/route.js");
  const response = await POST(
    new Request("http://localhost/api/vault/document-migration/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vault_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    })
  );

  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.success, true);
  assert.equal(json.discovery.vault_id, VAULT_ID);
  assert.equal(json.discovery.ownership.ownership_key_registered, true);
  assert.equal(json.discovery.ownership.migration_authority_verified, false);
  assert.equal(
    json.discovery.ownership.required_next_step,
    "ownership_proof_verification_required"
  );
  assert.equal(json.discovery.legacy_unbound_candidate_count, 3);
  assert.equal(json.discovery.documents.length, 1);

  const candidate = json.discovery.documents[0];
  assert.equal(candidate.document_id, "99999999-9999-4999-8999-999999999999");
  assert.equal(candidate.aad_version, 1);
  assert.equal(candidate.encryption_version, 2);
  assert.equal(candidate.label_present, true);
  assert.equal(candidate.storage_path, undefined);
  assert.equal(candidate.content_type_hint, undefined);
  assert.equal(candidate.ciphertext_bytes, undefined);
  assert.equal(candidate.label_ciphertext, undefined);
  assert.equal(candidate.label_iv, undefined);
  assert.equal(candidate.signed_url, undefined);
  assert.equal(Array.isArray(candidate.blocker_codes), true);

  assert.equal(migrationRecordCreateCalled, false);
  assert.equal(counterCalls.includes("vault.migration.discovery.request_total"), true);
  assert.equal(counterCalls.includes("vault.migration.discovery.success_total"), true);

  t.mock.restoreAll();
});

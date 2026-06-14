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

test("migration discovery marks ownership key absent while staying non-actionable", async (t) => {
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
      getVaultOwnershipKey: async () => ({ ownershipKey: null, error: null }),
      hasVerifiedVaultOwnershipForDevice: async () => ({ verified: false, error: null }),
      listVaultDiscoveryDocuments: async () => ({ documents: [], error: null }),
      countLegacyUnboundVaultDocuments: async () => ({ count: 0, error: null }),
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
      body: "{}",
    })
  );

  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.discovery.ownership.ownership_key_registered, false);
  assert.equal(json.discovery.ownership.migration_authority_verified, false);
  assert.equal(json.discovery.ownership.required_next_step, "ownership_key_registration_required");
  assert.equal(counterCalls.includes("vault.migration.discovery.ownership_key_absent_total"), true);

  t.mock.restoreAll();
});

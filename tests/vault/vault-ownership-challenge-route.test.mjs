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

test("ownership challenge route creates one-time challenge with nonce hash only", async (t) => {
  let challengeInsert = null;
  const counters = [];

  mock.module("../../app/lib/vaultAuth.js", {
    exports: {
      authorizeVaultRequest: async () => buildAuthOk(),
      vaultAuthFailureResponse: (auth) => auth,
    },
  });

  mock.module("../../app/lib/vaultAdmin.js", {
    exports: {
      isVaultAdminConfigured: () => true,
      VAULT_OWNERSHIP_KEY_ALGORITHM: "ECDSA-P256-SHA256",
      getBoundVaultDeviceRegistration: async () => ({
        registration: { vault_id: VAULT_ID, vault_device_id: DEVICE_ID },
        error: null,
      }),
      getVaultOwnershipKey: async () => ({
        ownershipKey: { id: "own-1", vault_id: VAULT_ID, algorithm: "ECDSA-P256-SHA256" },
        error: null,
      }),
      createVaultOwnershipVerificationChallenge: async (payload) => {
        challengeInsert = payload;
        return {
          verification: {
            id: "11111111-1111-4111-8111-111111111111",
            challenge_id: "22222222-2222-4222-8222-222222222222",
          },
          error: null,
        };
      },
    },
  });

  mock.module("../../app/lib/vaultOwnershipVerificationSentinelCounters.js", {
    exports: {
      VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS: {
        CHALLENGE_REQUEST_TOTAL: "vault.ownership.challenge.request_total",
        CHALLENGE_CREATED_TOTAL: "vault.ownership.challenge.created_total",
        CHALLENGE_MISSING_KEY_TOTAL: "vault.ownership.challenge.missing_key_total",
        CHALLENGE_ERROR_TOTAL: "vault.ownership.challenge.error_total",
      },
      recordVaultOwnershipVerificationSentinelCounter: (key) => counters.push(key),
    },
  });

  const { POST } = await import("../../app/api/vault/ownership/challenge/route.js");
  const response = await POST(
    new Request("http://localhost/api/vault/ownership/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
  );

  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.success, true);
  assert.equal(json.challenge_id, "22222222-2222-4222-8222-222222222222");
  assert.equal(json.challenge.challenge_type, "migration_authority_verify");
  assert.equal(json.challenge.action, "migration_authority_verify");
  assert.equal(json.challenge.vault_id, VAULT_ID);
  assert.equal(json.challenge.vault_device_id, DEVICE_ID);
  assert.equal(typeof json.challenge.challenge_nonce, "string");
  assert.equal(json.challenge.challenge_nonce.length > 20, true);
  assert.equal(typeof json.challenge.issued_at, "string");
  assert.equal(typeof json.challenge.expires_at, "string");
  assert.equal(json.challenge.challenge_nonce_hash, undefined);

  assert.equal(challengeInsert.challengeType, "migration_authority_verify");
  assert.equal(challengeInsert.vaultId, VAULT_ID);
  assert.equal(challengeInsert.vaultDeviceId, DEVICE_ID);
  assert.equal(typeof challengeInsert.challengeNonceHash, "string");
  assert.equal(challengeInsert.challengeNonceHash.length, 64);

  assert.equal(counters.includes("vault.ownership.challenge.request_total"), true);
  assert.equal(counters.includes("vault.ownership.challenge.created_total"), true);
  assert.equal(counters.includes("vault.ownership.challenge.error_total"), false);

  t.mock.restoreAll();
});

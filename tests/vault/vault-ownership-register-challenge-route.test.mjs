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

test("ownership register challenge route scenarios", async (t) => {
  const state = {
    ownershipKey: null,
    challengeInsert: null,
    counters: [],
  };

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
      getVaultOwnershipKey: async () => ({
        ownershipKey: state.ownershipKey,
        error: null,
      }),
      createVaultOwnershipVerificationChallenge: async (payload) => {
        state.challengeInsert = payload;
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
        REGISTER_CHALLENGE_REQUEST_TOTAL: "vault.ownership.register.challenge.request_total",
        REGISTER_CHALLENGE_CREATED_TOTAL: "vault.ownership.register.challenge.created_total",
        REGISTER_CHALLENGE_ERROR_TOTAL: "vault.ownership.register.challenge.error_total",
        REGISTER_CHALLENGE_ALREADY_REGISTERED_TOTAL:
          "vault.ownership.register.challenge.already_registered_total",
      },
      recordVaultOwnershipVerificationSentinelCounter: (key) => state.counters.push(key),
    },
  });

  const { POST } = await import("../../app/api/vault/ownership/register/challenge/route.js");

  state.ownershipKey = null;
  state.challengeInsert = null;
  state.counters = [];
  const createResponse = await POST(
    new Request("http://localhost/api/vault/ownership/register/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vault_id: VAULT_ID }),
    })
  );

  assert.equal(createResponse.status, 200);
  const createJson = await createResponse.json();
  assert.equal(createJson.success, true);
  assert.equal(createJson.challenge.challenge_type, "ownership_key_register");
  assert.equal(createJson.challenge.vault_id, VAULT_ID);
  assert.equal(createJson.challenge.vault_device_id, DEVICE_ID);
  assert.equal(typeof createJson.challenge.challenge_nonce, "string");
  assert.equal(createJson.challenge.challenge_nonce.length > 20, true);
  assert.equal(createJson.ownership_key_registered, false);

  assert.equal(state.challengeInsert.challengeType, "ownership_key_register");
  assert.equal(state.challengeInsert.vaultId, VAULT_ID);
  assert.equal(state.challengeInsert.vaultDeviceId, DEVICE_ID);
  assert.equal(state.challengeInsert.ownershipKeyId, null);
  assert.equal(typeof state.challengeInsert.challengeNonceHash, "string");
  assert.equal(state.challengeInsert.challengeNonceHash.length, 64);

  assert.equal(state.counters.includes("vault.ownership.register.challenge.request_total"), true);
  assert.equal(state.counters.includes("vault.ownership.register.challenge.created_total"), true);

  state.ownershipKey = { id: "own-1", vault_id: VAULT_ID };
  const rejectResponse = await POST(
    new Request("http://localhost/api/vault/ownership/register/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vault_id: VAULT_ID }),
    })
  );

  assert.equal(rejectResponse.status, 409);
  assert.equal((await rejectResponse.json()).code, "OWNERSHIP_KEY_ALREADY_REGISTERED");

  t.mock.restoreAll();
});

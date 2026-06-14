import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "node:module";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const VAULT_ID = "44444444-4444-4444-8444-444444444444";
const CHALLENGE_ID = "22222222-2222-4222-8222-222222222222";

function baseVerification() {
  return {
    id: "v-1",
    challenge_id: CHALLENGE_ID,
    challenge_type: "migration_authority_verify",
    challenge_nonce_hash: "f".repeat(64),
    issued_at: "2026-06-14T17:00:00.000Z",
    expires_at: "2099-06-14T17:05:00.000Z",
    status: "pending",
    consumed_at: null,
    vault_id: VAULT_ID,
    vault_device_id: DEVICE_ID,
  };
}

test("ownership verify route rejects wrong vault, wrong device, and wrong action", async (t) => {
  const counters = [];
  let mode = "vault";

  mock.module("../../app/lib/vaultAuth.js", {
    exports: {
      authorizeVaultRequest: async () => ({
        ok: true,
        vault_device_id: mode === "device" ? "77777777-7777-4777-8777-777777777777" : DEVICE_ID,
      }),
      vaultAuthFailureResponse: (auth) => auth,
    },
  });

  mock.module("../../app/lib/vaultAdmin.js", {
    exports: {
      isVaultAdminConfigured: () => true,
      VAULT_OWNERSHIP_KEY_ALGORITHM: "ECDSA-P256-SHA256",
      getVaultOwnershipVerificationChallengeById: async () => ({
        verification: {
          ...baseVerification(),
          challenge_type: mode === "action" ? "migration_authority_verify" : "migration_authority_verify",
        },
        error: null,
      }),
      getVaultOwnershipKey: async () => ({ ownershipKey: null, error: null }),
      verifyVaultOwnershipChallenge: async () => ({ verification: null, error: null }),
      bindVaultDeviceToVault: async () => ({ registration: null, error: null }),
    },
  });

  mock.module("../../app/lib/vaultOwnershipVerificationSentinelCounters.js", {
    exports: {
      VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS: {
        VERIFY_REQUEST_TOTAL: "vault.ownership.verify.request_total",
        VERIFY_VAULT_MISMATCH_TOTAL: "vault.ownership.verify.vault_mismatch_total",
        VERIFY_DEVICE_MISMATCH_TOTAL: "vault.ownership.verify.device_mismatch_total",
        VERIFY_ACTION_MISMATCH_TOTAL: "vault.ownership.verify.action_mismatch_total",
        VERIFY_ERROR_TOTAL: "vault.ownership.verify.error_total",
      },
      recordVaultOwnershipVerificationSentinelCounter: (key) => counters.push(key),
    },
  });

  const { POST } = await import("../../app/api/vault/ownership/verify/route.js");

  mode = "vault";
  const wrongVault = await POST(
    new Request("http://localhost/api/vault/ownership/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        challenge_id: CHALLENGE_ID,
        challenge_nonce: "abc",
        signature: "abc",
        challenge: { challenge_type: "migration_authority_verify", action: "migration_authority_verify", vault_id: "11111111-1111-4111-8111-111111111111" },
      }),
    })
  );
  assert.equal(wrongVault.status, 409);
  assert.equal((await wrongVault.json()).code, "CHALLENGE_VAULT_MISMATCH");

  mode = "device";
  const wrongDevice = await POST(
    new Request("http://localhost/api/vault/ownership/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        challenge_id: CHALLENGE_ID,
        challenge_nonce: "abc",
        signature: "abc",
        challenge: { challenge_type: "migration_authority_verify", action: "migration_authority_verify", vault_id: VAULT_ID },
      }),
    })
  );
  assert.equal(wrongDevice.status, 409);
  assert.equal((await wrongDevice.json()).code, "CHALLENGE_DEVICE_MISMATCH");

  mode = "action";
  const wrongAction = await POST(
    new Request("http://localhost/api/vault/ownership/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        challenge_id: CHALLENGE_ID,
        challenge_nonce: "abc",
        signature: "abc",
        challenge: { challenge_type: "register", action: "register", vault_id: VAULT_ID },
      }),
    })
  );
  assert.equal(wrongAction.status, 409);
  assert.equal((await wrongAction.json()).code, "CHALLENGE_ACTION_MISMATCH");

  assert.equal(counters.includes("vault.ownership.verify.vault_mismatch_total"), true);
  assert.equal(counters.includes("vault.ownership.verify.device_mismatch_total"), true);
  assert.equal(counters.includes("vault.ownership.verify.action_mismatch_total"), true);

  t.mock.restoreAll();
});

import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "node:module";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const VAULT_ID = "44444444-4444-4444-8444-444444444444";
const CHALLENGE_ID = "22222222-2222-4222-8222-222222222222";

test("ownership verify route rejects expired challenge", async (t) => {
  const counters = [];

  mock.module("../../app/lib/vaultAuth.js", {
    exports: {
      authorizeVaultRequest: async () => ({ ok: true, vault_device_id: DEVICE_ID }),
      vaultAuthFailureResponse: (auth) => auth,
    },
  });

  mock.module("../../app/lib/vaultAdmin.js", {
    exports: {
      isVaultAdminConfigured: () => true,
      VAULT_OWNERSHIP_KEY_ALGORITHM: "ECDSA-P256-SHA256",
      getVaultOwnershipVerificationChallengeById: async () => ({
        verification: {
          id: "v-1",
          challenge_id: CHALLENGE_ID,
          challenge_type: "migration_authority_verify",
          challenge_nonce_hash: "f".repeat(64),
          issued_at: "2026-06-14T17:00:00.000Z",
          expires_at: "2001-06-14T17:05:00.000Z",
          status: "pending",
          consumed_at: null,
          vault_id: VAULT_ID,
          vault_device_id: DEVICE_ID,
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
        VERIFY_EXPIRED_TOTAL: "vault.ownership.verify.expired_total",
        VERIFY_ERROR_TOTAL: "vault.ownership.verify.error_total",
      },
      recordVaultOwnershipVerificationSentinelCounter: (key) => counters.push(key),
    },
  });

  const { POST } = await import("../../app/api/vault/ownership/verify/route.js");
  const response = await POST(
    new Request("http://localhost/api/vault/ownership/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        challenge_id: CHALLENGE_ID,
        challenge_nonce: "abc",
        signature: "abc",
        challenge: { challenge_type: "migration_authority_verify", vault_id: VAULT_ID },
      }),
    })
  );

  assert.equal(response.status, 410);
  const json = await response.json();
  assert.equal(json.code, "CHALLENGE_EXPIRED");
  assert.equal(counters.includes("vault.ownership.verify.expired_total"), true);

  t.mock.restoreAll();
});

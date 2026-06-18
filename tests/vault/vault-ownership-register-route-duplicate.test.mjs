import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "node:module";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const VAULT_ID = "44444444-4444-4444-8444-444444444444";

test("ownership register route rejects duplicates and does not bind again", async (t) => {
  let bindCalled = false;

  mock.module("../../app/lib/vaultAuth.js", {
    exports: {
      authorizeVaultRequest: async () => ({
        ok: true,
        vault_device_id: DEVICE_ID,
      }),
      vaultAuthFailureResponse: (auth) => auth,
    },
  });

  mock.module("../../app/lib/vaultAdmin.js", {
    exports: {
      isVaultAdminConfigured: () => true,
      VAULT_OWNERSHIP_KEY_ALGORITHM: "ECDSA-P256-SHA256",
      getVaultOwnershipKey: async () => ({
        ownershipKey: { id: "own-existing", vault_id: VAULT_ID },
        error: null,
      }),
      getVaultOwnershipVerificationChallengeById: async () => ({
        verification: null,
        error: null,
      }),
      createVaultOwnershipKey: async () => ({
        ownershipKey: null,
        error: { code: "23505", message: "duplicate key" },
      }),
      verifyVaultOwnershipChallenge: async () => ({ verification: null, error: null }),
      bindVaultDeviceToVault: async () => {
        bindCalled = true;
        return { registration: null, error: null };
      },
    },
  });

  mock.module("../../app/lib/vaultOwnershipVerificationSentinelCounters.js", {
    exports: {
      VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS: {
        REGISTER_REQUEST_TOTAL: "vault.ownership.register.request_total",
      },
      recordVaultOwnershipVerificationSentinelCounter: () => {},
    },
  });

  const { POST } = await import("../../app/api/vault/ownership/register/route.js");
  const response = await POST(
    new Request("http://localhost/api/vault/ownership/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vault_id: VAULT_ID,
        ownership_key_algorithm: "ECDSA-P256-SHA256",
        ownership_public_key_jwk: { kty: "EC", crv: "P-256", x: "x", y: "y" },
        challenge_id: "22222222-2222-4222-8222-222222222222",
        challenge_nonce: "unused-nonce",
        signature: "unused-signature",
        challenge: {
          version: "prooforigin-vault-ownership-challenge-v1",
          action: "ownership_key_register",
          challenge_type: "ownership_key_register",
          vault_id: VAULT_ID,
          vault_device_id: DEVICE_ID,
        },
        ownership_proof: {
          public_key_fingerprint: "a".repeat(64),
        },
      }),
    })
  );

  assert.equal(response.status, 409);
  const json = await response.json();
  assert.equal(json.code, "OWNERSHIP_KEY_ALREADY_REGISTERED");
  assert.equal(bindCalled, false);

  t.mock.restoreAll();
});

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

test("ownership register route rejects legacy client-side challenge payloads", async (t) => {
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
      getVaultOwnershipKey: async () => ({ ownershipKey: null, error: null }),
      getVaultOwnershipVerificationChallengeById: async () => ({
        verification: null,
        error: null,
      }),
      createVaultOwnershipKey: async () => ({ ownershipKey: null, error: null }),
      verifyVaultOwnershipChallenge: async () => ({ verification: null, error: null }),
      bindVaultDeviceToVault: async () => ({ registration: null, error: null }),
    },
  });

  mock.module("../../app/lib/vaultOwnershipVerificationSentinelCounters.js", {
    exports: {
      VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS: {
        REGISTER_REQUEST_TOTAL: "vault.ownership.register.request_total",
        REGISTER_ERROR_TOTAL: "vault.ownership.register.error_total",
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
        ownership_public_key_jwk: {
          kty: "EC",
          crv: "P-256",
          x: "x",
          y: "y",
        },
        ownership_proof: {
          challenge: "legacy-client-challenge",
          challenge_hash: "a".repeat(64),
          signature: "sig-1",
        },
      }),
    })
  );

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /challenge_id, challenge_nonce, signature/);

  t.mock.restoreAll();
});

import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "node:module";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const VAULT_ID = "44444444-4444-4444-8444-444444444444";

test("ownership register route keeps Phase 3 as authenticated TOFU registration", async (t) => {
  let createPayload = null;
  let bindPayload = null;

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
      getVaultOwnershipKey: async () => ({ ownershipKey: null, error: null }),
      createVaultOwnershipKey: async (payload) => {
        createPayload = payload;
        return {
          ownershipKey: { id: "own-1", vault_id: payload.vaultId },
          error: null,
        };
      },
      bindVaultDeviceToVault: async (payload) => {
        bindPayload = payload;
        return {
          registration: {
            vault_device_id: payload.vaultDeviceId,
            vault_id: payload.vaultId,
            vault_id_bound_at: "2026-06-14T18:00:00.000Z",
          },
          error: null,
        };
      },
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
        ownership_proof: {
          signature: "sig-1",
          challenge: "challenge-1",
          challenge_hash: "a".repeat(64),
        },
      }),
    })
  );

  assert.equal(response.status, 200);
  assert.equal(createPayload?.vaultId, VAULT_ID);
  assert.equal(bindPayload?.vaultDeviceId, DEVICE_ID);
  assert.equal(bindPayload?.vaultId, VAULT_ID);

  t.mock.restoreAll();
});

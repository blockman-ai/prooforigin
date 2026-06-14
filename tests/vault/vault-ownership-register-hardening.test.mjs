import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "node:module";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const VAULT_ID = "44444444-4444-4444-8444-444444444444";

test("ownership register route rejects public jwk containing private members", async (t) => {
  let createCalled = false;
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
      getVaultOwnershipKey: async () => ({ ownershipKey: null, error: null }),
      createVaultOwnershipKey: async () => {
        createCalled = true;
        return { ownershipKey: null, error: null };
      },
      bindVaultDeviceToVault: async () => {
        bindCalled = true;
        return { registration: null, error: null };
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
        ownership_public_key_jwk: {
          kty: "EC",
          crv: "P-256",
          x: "x",
          y: "y",
          d: "private",
        },
        ownership_proof: {
          signature: "sig-1",
          challenge: "challenge-1",
          challenge_hash: "a".repeat(64),
        },
      }),
    })
  );

  assert.equal(response.status, 400);
  const json = await response.json();
  assert.equal(json.code, "INVALID_REQUEST");
  assert.match(json.error, /private key material/);
  assert.equal(createCalled, false);
  assert.equal(bindCalled, false);

  t.mock.restoreAll();
});


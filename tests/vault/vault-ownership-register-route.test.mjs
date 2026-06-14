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

test("ownership register route persists key, binds device, and returns migration boundary", async (t) => {
  let createPayload = null;
  let bindPayload = null;

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
        ownership_public_key_jwk: {
          kty: "EC",
          crv: "P-256",
          x: "x",
          y: "y",
        },
        ownership_proof: {
          challenge: "challenge-1",
          challenge_hash: "a".repeat(64),
          signature: "sig-1",
          public_key_fingerprint: "f".repeat(64),
        },
      }),
    })
  );

  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.success, true);
  assert.equal(json.device_bound, true);
  assert.equal(json.migration_ready_boundary.old_recovery_kits, "identity_restore_only");
  assert.equal(
    json.migration_ready_boundary.new_recovery_kit_required_for_migration_proof,
    true
  );

  assert.equal(createPayload?.vaultId, VAULT_ID);
  assert.equal(createPayload?.publicKeyJwk?.d, undefined);
  assert.equal(bindPayload?.vaultDeviceId, DEVICE_ID);
  assert.equal(bindPayload?.vaultId, VAULT_ID);

  t.mock.restoreAll();
});


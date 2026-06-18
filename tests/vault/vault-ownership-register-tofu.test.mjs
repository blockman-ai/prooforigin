import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "node:module";
import { webcrypto } from "node:crypto";
import {
  buildVaultOwnershipChallengeMessage,
  hashOwnershipChallengeNonce,
  VAULT_OWNERSHIP_CHALLENGE_TYPE_OWNERSHIP_KEY_REGISTER,
} from "../../app/lib/vaultOwnershipVerification.js";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const VAULT_ID = "44444444-4444-4444-8444-444444444444";
const CHALLENGE_ID = "22222222-2222-4222-8222-222222222222";
const NONCE = "ZmFrZS1ub25jZS0xMjM0";

test("ownership register route requires authenticated server challenge proof", async (t) => {
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

  const keyPair = await webcrypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const publicJwk = await webcrypto.subtle.exportKey("jwk", keyPair.publicKey);
  const message = buildVaultOwnershipChallengeMessage({
    challengeId: CHALLENGE_ID,
    challengeType: VAULT_OWNERSHIP_CHALLENGE_TYPE_OWNERSHIP_KEY_REGISTER,
    vaultId: VAULT_ID,
    vaultDeviceId: DEVICE_ID,
    challengeNonce: NONCE,
    issuedAt: "2026-06-14T17:00:00.000Z",
    expiresAt: "2099-06-14T17:05:00.000Z",
    version: "prooforigin-vault-ownership-challenge-v1",
  });
  const signatureBuffer = await webcrypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keyPair.privateKey,
    new TextEncoder().encode(message)
  );

  mock.module("../../app/lib/vaultAdmin.js", {
    exports: {
      isVaultAdminConfigured: () => true,
      VAULT_OWNERSHIP_KEY_ALGORITHM: "ECDSA-P256-SHA256",
      getVaultOwnershipKey: async () => ({ ownershipKey: null, error: null }),
      getVaultOwnershipVerificationChallengeById: async () => ({
        verification: {
          id: "11111111-1111-4111-8111-111111111111",
          challenge_id: CHALLENGE_ID,
          challenge_type: VAULT_OWNERSHIP_CHALLENGE_TYPE_OWNERSHIP_KEY_REGISTER,
          challenge_nonce_hash: hashOwnershipChallengeNonce(NONCE),
          issued_at: "2026-06-14T17:00:00.000Z",
          expires_at: "2099-06-14T17:05:00.000Z",
          status: "pending",
          consumed_at: null,
          vault_id: VAULT_ID,
          vault_device_id: DEVICE_ID,
        },
        error: null,
      }),
      createVaultOwnershipKey: async (payload) => {
        createPayload = payload;
        return {
          ownershipKey: { id: "own-1", vault_id: payload.vaultId },
          error: null,
        };
      },
      verifyVaultOwnershipChallenge: async () => ({
        verification: { id: "11111111-1111-4111-8111-111111111111", status: "verified" },
        error: null,
      }),
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

  mock.module("../../app/lib/vaultOwnershipVerificationSentinelCounters.js", {
    exports: {
      VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS: {
        REGISTER_REQUEST_TOTAL: "vault.ownership.register.request_total",
        REGISTER_SUCCESS_TOTAL: "vault.ownership.register.success_total",
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
        ownership_public_key_jwk: publicJwk,
        challenge_id: CHALLENGE_ID,
        challenge_nonce: NONCE,
        signature: Buffer.from(new Uint8Array(signatureBuffer)).toString("base64"),
        challenge: {
          version: "prooforigin-vault-ownership-challenge-v1",
          action: VAULT_OWNERSHIP_CHALLENGE_TYPE_OWNERSHIP_KEY_REGISTER,
          challenge_type: VAULT_OWNERSHIP_CHALLENGE_TYPE_OWNERSHIP_KEY_REGISTER,
          vault_id: VAULT_ID,
          vault_device_id: DEVICE_ID,
          issued_at: "2026-06-14T17:00:00.000Z",
          expires_at: "2099-06-14T17:05:00.000Z",
        },
        ownership_proof: {
          public_key_fingerprint: "f".repeat(64),
        },
      }),
    })
  );

  assert.equal(response.status, 200);
  assert.equal(createPayload?.vaultId, VAULT_ID);
  assert.equal(createPayload?.metadata?.signature_verified, true);
  assert.equal(bindPayload?.vaultDeviceId, DEVICE_ID);
  assert.equal(bindPayload?.vaultId, VAULT_ID);

  t.mock.restoreAll();
});

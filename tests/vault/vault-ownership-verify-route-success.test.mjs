import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "node:module";
import { webcrypto } from "node:crypto";
import { buildVaultOwnershipChallengeMessage } from "../../app/lib/vaultOwnershipVerification.js";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const VAULT_ID = "44444444-4444-4444-8444-444444444444";
const CHALLENGE_ID = "22222222-2222-4222-8222-222222222222";
const NONCE = "ZmFrZS1ub25jZS0xMjM0";

function buildAuthOk() {
  return {
    ok: true,
    vault_device_id: DEVICE_ID,
  };
}

test("ownership verify route validates signature and marks migration authority verified", async (t) => {
  const counters = [];
  let bindPayload = null;
  let verifyPersistPayload = null;

  mock.module("../../app/lib/vaultAuth.js", {
    exports: {
      authorizeVaultRequest: async () => buildAuthOk(),
      vaultAuthFailureResponse: (auth) => auth,
    },
  });

  const keyPair = await webcrypto.subtle.generateKey(
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    true,
    ["sign", "verify"]
  );
  const publicJwk = await webcrypto.subtle.exportKey("jwk", keyPair.publicKey);
  const message = buildVaultOwnershipChallengeMessage({
    challengeId: CHALLENGE_ID,
    challengeType: "migration_authority_verify",
    vaultId: VAULT_ID,
    vaultDeviceId: DEVICE_ID,
    challengeNonce: NONCE,
    issuedAt: "2026-06-14T17:00:00.000Z",
    expiresAt: "2099-06-14T17:05:00.000Z",
    version: "prooforigin-vault-ownership-challenge-v1",
  });
  const signatureBuffer = await webcrypto.subtle.sign(
    {
      name: "ECDSA",
      hash: "SHA-256",
    },
    keyPair.privateKey,
    new TextEncoder().encode(message)
  );
  const signatureBase64 = Buffer.from(new Uint8Array(signatureBuffer)).toString("base64");

  mock.module("../../app/lib/vaultAdmin.js", {
    exports: {
      isVaultAdminConfigured: () => true,
      VAULT_OWNERSHIP_KEY_ALGORITHM: "ECDSA-P256-SHA256",
      getVaultOwnershipVerificationChallengeById: async () => ({
        verification: {
          id: "33333333-3333-4333-8333-333333333333",
          challenge_id: CHALLENGE_ID,
          challenge_type: "migration_authority_verify",
          challenge_nonce_hash:
            "f3f202f2bfd4647989aaf5bd936c981544155fc3266bb1e3fdef2afb5c5b09b3",
          issued_at: "2026-06-14T17:00:00.000Z",
          expires_at: "2099-06-14T17:05:00.000Z",
          status: "pending",
          consumed_at: null,
          vault_id: VAULT_ID,
          vault_device_id: DEVICE_ID,
        },
        error: null,
      }),
      getVaultOwnershipKey: async () => ({
        ownershipKey: {
          id: "own-1",
          vault_id: VAULT_ID,
          algorithm: "ECDSA-P256-SHA256",
          public_key_jwk: publicJwk,
        },
        error: null,
      }),
      verifyVaultOwnershipChallenge: async (payload) => {
        verifyPersistPayload = payload;
        return {
          verification: { id: "33333333-3333-4333-8333-333333333333", status: "verified" },
          error: null,
        };
      },
      bindVaultDeviceToVault: async (payload) => {
        bindPayload = payload;
        return {
          registration: { vault_device_id: DEVICE_ID, vault_id: VAULT_ID },
          error: null,
        };
      },
    },
  });

  mock.module("../../app/lib/vaultOwnershipVerificationSentinelCounters.js", {
    exports: {
      VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS: {
        VERIFY_REQUEST_TOTAL: "vault.ownership.verify.request_total",
        VERIFY_SUCCESS_TOTAL: "vault.ownership.verify.success_total",
        VERIFY_EXPIRED_TOTAL: "vault.ownership.verify.expired_total",
        VERIFY_REPLAY_REJECTED_TOTAL: "vault.ownership.verify.replay_rejected_total",
        VERIFY_SIGNATURE_FAILED_TOTAL: "vault.ownership.verify.signature_failed_total",
        VERIFY_VAULT_MISMATCH_TOTAL: "vault.ownership.verify.vault_mismatch_total",
        VERIFY_DEVICE_MISMATCH_TOTAL: "vault.ownership.verify.device_mismatch_total",
        VERIFY_ACTION_MISMATCH_TOTAL: "vault.ownership.verify.action_mismatch_total",
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
        challenge_nonce: NONCE,
        signature: signatureBase64,
        challenge: {
          version: "prooforigin-vault-ownership-challenge-v1",
          action: "migration_authority_verify",
          challenge_type: "migration_authority_verify",
          vault_id: VAULT_ID,
          vault_device_id: DEVICE_ID,
          issued_at: "2026-06-14T17:00:00.000Z",
          expires_at: "2099-06-14T17:05:00.000Z",
        },
      }),
    })
  );

  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.success, true);
  assert.equal(json.migration_authority_verified, true);
  assert.equal(json.challenge_id, CHALLENGE_ID);
  assert.equal(json.vault_id, VAULT_ID);
  assert.equal(json.vault_device_id, DEVICE_ID);

  assert.equal(bindPayload.vaultId, VAULT_ID);
  assert.equal(bindPayload.vaultDeviceId, DEVICE_ID);
  assert.equal(bindPayload.vaultOwnershipProofMetadata.signature_verified, true);
  assert.equal(bindPayload.vaultOwnershipProofMetadata.signature, undefined);

  assert.equal(verifyPersistPayload.ownershipKeyId, "own-1");
  assert.equal(verifyPersistPayload.metadata.signature_hash.length, 64);
  assert.equal(verifyPersistPayload.metadata.signature, undefined);

  assert.equal(counters.includes("vault.ownership.verify.request_total"), true);
  assert.equal(counters.includes("vault.ownership.verify.success_total"), true);

  t.mock.restoreAll();
});

import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "node:module";
import { webcrypto } from "node:crypto";
import { buildVaultOwnershipChallengeMessage } from "../../app/lib/vaultOwnershipVerification.js";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const VAULT_ID = "44444444-4444-4444-8444-444444444444";
const CHALLENGE_ID = "22222222-2222-4222-8222-222222222222";

test("ownership verify route rejects invalid signature", async (t) => {
  const counters = [];

  mock.module("../../app/lib/vaultAuth.js", {
    exports: {
      authorizeVaultRequest: async () => ({ ok: true, vault_device_id: DEVICE_ID }),
      vaultAuthFailureResponse: (auth) => auth,
    },
  });

  const signingPair = await webcrypto.subtle.generateKey(
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    true,
    ["sign", "verify"]
  );
  const otherPair = await webcrypto.subtle.generateKey(
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    true,
    ["sign", "verify"]
  );
  const publicJwk = await webcrypto.subtle.exportKey("jwk", otherPair.publicKey);
  const message = buildVaultOwnershipChallengeMessage({
    challengeId: CHALLENGE_ID,
    challengeType: "migration_authority_verify",
    vaultId: VAULT_ID,
    vaultDeviceId: DEVICE_ID,
    challengeNonce: "ZmFrZS1ub25jZS0xMjM0",
    issuedAt: "2026-06-14T17:00:00.000Z",
    expiresAt: "2099-06-14T17:05:00.000Z",
    version: "prooforigin-vault-ownership-challenge-v1",
  });
  const signatureBuffer = await webcrypto.subtle.sign(
    {
      name: "ECDSA",
      hash: "SHA-256",
    },
    signingPair.privateKey,
    new TextEncoder().encode(message)
  );
  const invalidSignature = Buffer.from(new Uint8Array(signatureBuffer)).toString("base64");

  mock.module("../../app/lib/vaultAdmin.js", {
    exports: {
      isVaultAdminConfigured: () => true,
      VAULT_OWNERSHIP_KEY_ALGORITHM: "ECDSA-P256-SHA256",
      getVaultOwnershipVerificationChallengeById: async () => ({
        verification: {
          id: "v-1",
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
      verifyVaultOwnershipChallenge: async () => ({ verification: null, error: null }),
      bindVaultDeviceToVault: async () => ({ registration: null, error: null }),
    },
  });

  mock.module("../../app/lib/vaultOwnershipVerificationSentinelCounters.js", {
    exports: {
      VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS: {
        VERIFY_REQUEST_TOTAL: "vault.ownership.verify.request_total",
        VERIFY_SIGNATURE_FAILED_TOTAL: "vault.ownership.verify.signature_failed_total",
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
        challenge_nonce: "ZmFrZS1ub25jZS0xMjM0",
        signature: invalidSignature,
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

  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "OWNERSHIP_SIGNATURE_INVALID");
  assert.equal(counters.includes("vault.ownership.verify.signature_failed_total"), true);

  t.mock.restoreAll();
});

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

test("ownership client requests server challenge and registers with signed proof", async (t) => {
  const storage = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
  };

  mock.module("../../app/lib/vaultGenesis.js", {
    exports: {
      ensureVaultGenesis: async () => ({ vault_id: VAULT_ID }),
      readVaultGenesis: () => ({ vault_id: VAULT_ID }),
    },
  });

  mock.module("../../app/lib/vaultSession.js", {
    exports: {
      getVaultSessionUnlockKeys: () => ({
        mode: "mvk",
        masterVaultKey: new Uint8Array(32),
      }),
    },
  });

  mock.module("../../app/lib/vaultDevice.js", {
    exports: {
      getVaultDevice: () => ({ vault_device_id: DEVICE_ID }),
      createSignedVaultAuthHeaders: async () => ({}),
    },
  });

  const keyPair = await webcrypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const publicJwk = await webcrypto.subtle.exportKey("jwk", keyPair.publicKey);

  mock.module("../../app/lib/vaultOwnershipKey.js", {
    exports: {
      clearWrappedVaultOwnershipPrivateJwk: () => {},
      computeVaultOwnershipPublicKeyFingerprint: async () => "f".repeat(64),
      exportVaultOwnershipPrivateJwk: async () => ({ d: "private", kty: "EC", crv: "P-256" }),
      exportVaultOwnershipPublicJwk: async () => publicJwk,
      generateVaultOwnershipKeyPair: async () => ({
        publicKey: keyPair.publicKey,
        privateKey: keyPair.privateKey,
      }),
      importVaultOwnershipPrivateJwk: async () => keyPair.privateKey,
      loadWrappedVaultOwnershipPrivateJwk: async () => null,
      signVaultOwnershipChallenge: async ({ privateKey, challenge }) => {
        const signatureBuffer = await webcrypto.subtle.sign(
          { name: "ECDSA", hash: "SHA-256" },
          privateKey,
          new TextEncoder().encode(challenge)
        );
        return Buffer.from(new Uint8Array(signatureBuffer)).toString("base64");
      },
      storeWrappedVaultOwnershipPrivateJwk: async () => ({}),
    },
  });

  mock.module("../../app/lib/vaultRecoveryStatus.js", {
    exports: {
      markVaultRecoveryKitOwnershipKeyBoundary: () => ({}),
      readVaultRecoveryKitConfirmation: () => null,
    },
  });

  const {
    registerVaultOwnershipKeyWithServer,
    resetVaultOwnershipClientForTests,
  } = await import("../../app/lib/vaultOwnershipClient.js");

  let registerPayload = null;
  const result = await registerVaultOwnershipKeyWithServer({
    requestOwnershipRegisterChallenge: async () => ({
      ok: true,
      status: 200,
      data: {
        success: true,
        challenge_id: CHALLENGE_ID,
        challenge: {
          version: "prooforigin-vault-ownership-challenge-v1",
          challenge_type: "ownership_key_register",
          vault_id: VAULT_ID,
          vault_device_id: DEVICE_ID,
          challenge_nonce: NONCE,
          issued_at: "2026-06-14T17:00:00.000Z",
          expires_at: "2099-06-14T17:05:00.000Z",
        },
      },
    }),
    requestOwnershipRegistration: async (payload) => {
      registerPayload = payload;
      return {
        ok: true,
        status: 200,
        data: { success: true, ownership_key_registered: true },
      };
    },
  });

  assert.equal(result.success, true);
  assert.equal(result.ownership_key_registered, true);
  assert.equal(registerPayload.challenge_id, CHALLENGE_ID);
  assert.equal(registerPayload.challenge_nonce, NONCE);
  assert.equal(typeof registerPayload.signature, "string");
  assert.equal(registerPayload.ownership_public_key_jwk.d, undefined);

  const expectedMessage = buildVaultOwnershipChallengeMessage({
    challengeId: CHALLENGE_ID,
    challengeType: "ownership_key_register",
    vaultId: VAULT_ID,
    vaultDeviceId: DEVICE_ID,
    challengeNonce: NONCE,
    issuedAt: "2026-06-14T17:00:00.000Z",
    expiresAt: "2099-06-14T17:05:00.000Z",
    version: "prooforigin-vault-ownership-challenge-v1",
  });
  const signatureValid = await webcrypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    keyPair.publicKey,
    Buffer.from(registerPayload.signature, "base64"),
    new TextEncoder().encode(expectedMessage)
  );
  assert.equal(signatureValid, true);

  resetVaultOwnershipClientForTests();
  t.mock.restoreAll();
  delete globalThis.window;
  storage.clear();
});

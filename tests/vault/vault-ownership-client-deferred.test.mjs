import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "node:module";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const VAULT_ID = "44444444-4444-4444-8444-444444444444";
const storage = new Map();

test("ownership client defers 403 authority responses and skips repeat unlock calls", async (t) => {
  globalThis.window = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => {
        storage.set(key, value);
      },
      removeItem: (key) => {
        storage.delete(key);
      },
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

  mock.module("../../app/lib/vaultOwnershipKey.js", {
    exports: {
      clearWrappedVaultOwnershipPrivateJwk: () => {},
      computeVaultOwnershipPublicKeyFingerprint: async () => "f".repeat(64),
      exportVaultOwnershipPrivateJwk: async () => ({ d: "private", kty: "EC", crv: "P-256" }),
      exportVaultOwnershipPublicJwk: async () => ({
        kty: "EC",
        crv: "P-256",
        x: "x",
        y: "y",
      }),
      generateVaultOwnershipKeyPair: async () => ({
        publicKey: {},
        privateKey: {},
      }),
      importVaultOwnershipPrivateJwk: async () => ({}),
      loadWrappedVaultOwnershipPrivateJwk: async () => null,
      signVaultOwnershipChallenge: async () => "signature",
      storeWrappedVaultOwnershipPrivateJwk: async () => ({}),
    },
  });

  mock.module("../../app/lib/vaultRecoveryStatus.js", {
    exports: {
      markVaultRecoveryKitOwnershipKeyBoundary: () => ({}),
      readVaultRecoveryKitConfirmation: () => null,
    },
  });

  const { registerVaultOwnershipKeyWithServer, resetVaultOwnershipClientForTests } = await import(
    "../../app/lib/vaultOwnershipClient.js"
  );

  let requestCount = 0;
  const challengeResponse = {
    ok: true,
    status: 200,
    data: {
      success: true,
      challenge_id: "22222222-2222-4222-8222-222222222222",
      challenge: {
        version: "prooforigin-vault-ownership-challenge-v1",
        challenge_type: "ownership_key_register",
        vault_id: VAULT_ID,
        vault_device_id: DEVICE_ID,
        challenge_nonce: "ZmFrZS1ub25jZS0xMjM0",
        issued_at: "2026-06-14T17:00:00.000Z",
        expires_at: "2099-06-14T17:05:00.000Z",
      },
    },
  };

  const first = await registerVaultOwnershipKeyWithServer({
    requestOwnershipRegisterChallenge: async () => challengeResponse,
    requestOwnershipRegistration: async () => {
      requestCount += 1;
      return {
        ok: false,
        status: 403,
        data: { code: "OWNERSHIP_AUTHORITY_REQUIRED" },
      };
    },
  });

  assert.equal(first.success, true);
  assert.equal(first.deferred, true);
  assert.equal(first.ownership_key_registered, false);
  assert.equal(requestCount, 1);

  const second = await registerVaultOwnershipKeyWithServer({
    requestOwnershipRegisterChallenge: async () => challengeResponse,
    requestOwnershipRegistration: async () => {
      requestCount += 1;
      return { ok: true, status: 200, data: { success: true } };
    },
  });

  assert.equal(second.success, true);
  assert.equal(second.deferred, true);
  assert.equal(second.skipped_network, true);
  assert.equal(requestCount, 1);

  resetVaultOwnershipClientForTests();
  t.mock.restoreAll();
  delete globalThis.window;
  storage.clear();
});

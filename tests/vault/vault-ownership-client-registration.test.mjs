import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "node:module";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const VAULT_ID = "44444444-4444-4444-8444-444444444444";
const storage = new Map();

test("ownership client treats duplicate registration as no-op and skips repeat calls", async (t) => {
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

  const {
    registerVaultOwnershipKeyWithServer,
    resetVaultOwnershipClientForTests,
    VAULT_OWNERSHIP_REGISTRATION_STORAGE_KEY,
  } = await import("../../app/lib/vaultOwnershipClient.js");

  let requestCount = 0;
  let firstPayload = null;
  const first = await registerVaultOwnershipKeyWithServer({
    requestOwnershipRegistration: async (payload) => {
      requestCount += 1;
      firstPayload = payload;
      return {
        ok: false,
        status: 409,
        data: { code: "OWNERSHIP_KEY_ALREADY_REGISTERED" },
      };
    },
  });

  assert.equal(first.success, true);
  assert.equal(first.already_registered, true);
  assert.equal(requestCount, 1);
  assert.equal(firstPayload.ownership_public_key_jwk.d, undefined);

  const storedMarker = JSON.parse(storage.get(VAULT_OWNERSHIP_REGISTRATION_STORAGE_KEY));
  assert.equal(storedMarker.vault_id, VAULT_ID);
  assert.equal(storedMarker.registered, true);

  const second = await registerVaultOwnershipKeyWithServer({
    requestOwnershipRegistration: async () => {
      requestCount += 1;
      return { ok: true, status: 200, data: { success: true } };
    },
  });

  assert.equal(second.success, true);
  assert.equal(second.skipped_network, true);
  assert.equal(requestCount, 1);

  resetVaultOwnershipClientForTests();
  t.mock.restoreAll();
  delete globalThis.window;
  storage.clear();
});


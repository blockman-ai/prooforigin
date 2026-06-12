import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  buildPasskeyWrapRecord,
  computePasskeyPrfSalt,
  normalizePasskeyWrapKey,
} from "../../app/lib/vaultPasskey.js";
import {
  resetPasskeyWrapStorageForTests,
  storePasskeyWrapRecord,
} from "../../app/lib/vaultPasskeyStorage.js";
import { generateRandomBytes } from "../../app/lib/vaultCrypto.js";
import {
  resolveVaultUnlockKeys,
  resolveVaultUnlockKeysWithPasskey,
  VaultPasskeyUnlockCancelledError,
} from "../../app/lib/vaultUnlock.js";
import {
  resetVaultKeyRingStorageForTests,
} from "../../app/lib/vaultKeyRingStorage.js";
import { clearVaultPinRecord } from "../../app/lib/vaultPin.js";

const TEST_PIN = "123456";
const TEST_VAULT_ID = "11111111-1111-4111-8111-111111111111";
const TEST_CREDENTIAL_ID = "dGVzdC1jcmVkZW50aWFsLWlk";
const storage = new Map();

const supportedCapabilities = {
  webauthn: true,
  platformAuthenticator: true,
  prf: true,
  passkeyUnlockSupported: true,
};

beforeEach(() => {
  storage.clear();
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
});

afterEach(() => {
  resetVaultKeyRingStorageForTests();
  resetPasskeyWrapStorageForTests();
  clearVaultPinRecord();
  delete globalThis.window;
});

async function storePasskeyRecordForKeys({ masterVaultKey, legacyPinKey, prfOutput }) {
  const passkeyWrapKey = await normalizePasskeyWrapKey(prfOutput);
  const prfSalt = await computePasskeyPrfSalt(TEST_VAULT_ID, TEST_CREDENTIAL_ID);
  const record = await buildPasskeyWrapRecord({
    vaultId: TEST_VAULT_ID,
    credentialId: TEST_CREDENTIAL_ID,
    masterVaultKey,
    legacyPinKey,
    passkeyWrapKey,
    prfSalt,
  });

  storePasskeyWrapRecord(record);
  return { record, prfOutput };
}

test("passkey unlock success with mocked PRF returns MVK session shape", async () => {
  const pinKeys = await resolveVaultUnlockKeys(TEST_PIN, { isSetup: true });
  const prfOutput = generateRandomBytes(32);
  await storePasskeyRecordForKeys({
    masterVaultKey: pinKeys.masterVaultKey,
    legacyPinKey: pinKeys.legacyPinKey,
    prfOutput,
  });

  const keys = await resolveVaultUnlockKeysWithPasskey({
    detectCapabilities: async () => supportedCapabilities,
    evaluatePrf: async () => prfOutput,
    getRpId: () => "vault.prooforigin.test",
  });

  assert.equal(keys.mode, "mvk");
  assert.ok(keys.masterVaultKey instanceof Uint8Array);
  assert.ok(keys.legacyPinKey instanceof Uint8Array);
  assert.equal(keys.masterVaultKey.length, 32);
  assert.equal(keys.legacyPinKey.length, 32);
  assert.deepEqual(Array.from(keys.masterVaultKey), Array.from(pinKeys.masterVaultKey));
  assert.deepEqual(Array.from(keys.legacyPinKey), Array.from(pinKeys.legacyPinKey));
});

test("passkey unlock fails when no passkey record exists", async () => {
  await assert.rejects(
    () =>
      resolveVaultUnlockKeysWithPasskey({
        detectCapabilities: async () => supportedCapabilities,
        evaluatePrf: async () => generateRandomBytes(32),
        getRpId: () => "vault.prooforigin.test",
      }),
    /No passkey enrolled/
  );
});

test("passkey unlock fails when PRF is unsupported", async () => {
  const pinKeys = await resolveVaultUnlockKeys(TEST_PIN, { isSetup: true });
  const prfOutput = generateRandomBytes(32);
  await storePasskeyRecordForKeys({
    masterVaultKey: pinKeys.masterVaultKey,
    legacyPinKey: pinKeys.legacyPinKey,
    prfOutput,
  });

  await assert.rejects(
    () =>
      resolveVaultUnlockKeysWithPasskey({
        detectCapabilities: async () => ({
          webauthn: true,
          platformAuthenticator: true,
          prf: false,
          passkeyUnlockSupported: false,
        }),
        evaluatePrf: async () => prfOutput,
        getRpId: () => "vault.prooforigin.test",
      }),
    /requires WebAuthn PRF support/
  );
});

test("passkey unlock fails with PIN fallback message when wrap key is wrong", async () => {
  const pinKeys = await resolveVaultUnlockKeys(TEST_PIN, { isSetup: true });
  const prfOutput = generateRandomBytes(32);
  await storePasskeyRecordForKeys({
    masterVaultKey: pinKeys.masterVaultKey,
    legacyPinKey: pinKeys.legacyPinKey,
    prfOutput,
  });

  await assert.rejects(
    () =>
      resolveVaultUnlockKeysWithPasskey({
        detectCapabilities: async () => supportedCapabilities,
        evaluatePrf: async () => generateRandomBytes(32),
        getRpId: () => "vault.prooforigin.test",
      }),
    /Try your PIN instead/
  );
});

test("passkey unlock user cancellation is graceful", async () => {
  const pinKeys = await resolveVaultUnlockKeys(TEST_PIN, { isSetup: true });
  const prfOutput = generateRandomBytes(32);
  await storePasskeyRecordForKeys({
    masterVaultKey: pinKeys.masterVaultKey,
    legacyPinKey: pinKeys.legacyPinKey,
    prfOutput,
  });

  const cancelError = new Error("The operation was cancelled.");
  cancelError.name = "NotAllowedError";

  await assert.rejects(
    () =>
      resolveVaultUnlockKeysWithPasskey({
        detectCapabilities: async () => supportedCapabilities,
        evaluatePrf: async () => {
          throw cancelError;
        },
        getRpId: () => "vault.prooforigin.test",
      }),
    VaultPasskeyUnlockCancelledError
  );
});

test("PIN unlock MVK path remains unchanged", async () => {
  await resolveVaultUnlockKeys(TEST_PIN, { isSetup: true });

  const keys = await resolveVaultUnlockKeys(TEST_PIN);

  assert.equal(keys.mode, "mvk");
  assert.ok(keys.masterVaultKey instanceof Uint8Array);
  assert.ok(keys.legacyPinKey instanceof Uint8Array);
});

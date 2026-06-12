import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { resolveVaultUnlockKeys } from "../../app/lib/vaultUnlock.js";
import {
  resetVaultKeyRingStorageForTests,
} from "../../app/lib/vaultKeyRingStorage.js";
import {
  clearVaultPinRecord,
  setupVaultPin,
  VAULT_PIN_STORAGE_KEY,
} from "../../app/lib/vaultPin.js";
import { VAULT_WRAPPED_MVK_STORAGE_KEY } from "../../app/lib/vaultKeyRingStorage.js";

const TEST_PIN = "123456";
const storage = new Map();

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
  clearVaultPinRecord();
  delete globalThis.window;
});

test("legacy unlock returns legacy mode and PIN-derived key only", async () => {
  await setupVaultPin(TEST_PIN);

  const keys = await resolveVaultUnlockKeys(TEST_PIN);

  assert.equal(keys.mode, "legacy");
  assert.equal(keys.masterVaultKey, null);
  assert.ok(keys.legacyPinKey instanceof Uint8Array);
  assert.equal(keys.legacyPinKey.length, 32);
  assert.equal(storage.has(VAULT_WRAPPED_MVK_STORAGE_KEY), false);
});

test("MVK setup returns MVK and legacy PIN key", async () => {
  const keys = await resolveVaultUnlockKeys(TEST_PIN, { isSetup: true });

  assert.equal(keys.mode, "mvk");
  assert.ok(keys.masterVaultKey instanceof Uint8Array);
  assert.ok(keys.legacyPinKey instanceof Uint8Array);
  assert.notDeepEqual(Array.from(keys.masterVaultKey), Array.from(keys.legacyPinKey));
  assert.equal(storage.has(VAULT_PIN_STORAGE_KEY), true);
  assert.equal(storage.has(VAULT_WRAPPED_MVK_STORAGE_KEY), true);
});

test("MVK unlock unwraps stored MVK and legacy PIN key", async () => {
  await resolveVaultUnlockKeys(TEST_PIN, { isSetup: true });

  const keys = await resolveVaultUnlockKeys(TEST_PIN);

  assert.equal(keys.mode, "mvk");
  assert.ok(keys.masterVaultKey instanceof Uint8Array);
  assert.ok(keys.legacyPinKey instanceof Uint8Array);
});

test("wrong PIN fails unlock", async () => {
  await setupVaultPin(TEST_PIN);

  await assert.rejects(
    () => resolveVaultUnlockKeys("654321"),
    /Incorrect PIN/
  );
});

test("wrong PIN fails MVK unlock", async () => {
  await resolveVaultUnlockKeys(TEST_PIN, { isSetup: true });

  await assert.rejects(
    () => resolveVaultUnlockKeys("654321"),
    /Incorrect PIN/
  );
});

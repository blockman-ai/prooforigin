import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  VAULT_WRAPPED_MVK_STORAGE_KEY,
  clearWrappedMasterVaultKeyRecord,
  initializeMasterVaultKeyForNewVault,
  isVaultUsingMasterVaultKey,
  loadWrappedMasterVaultKeyRecord,
  resetVaultKeyRingStorageForTests,
  storeWrappedMasterVaultKeyRecord,
} from "../../app/lib/vaultKeyRingStorage.js";
import {
  generateMasterVaultKey,
  unwrapMasterVaultKeyWithPin,
  wrapMasterVaultKeyWithPin,
} from "../../app/lib/vaultKeyRing.js";

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
  delete globalThis.window;
});

test("legacy vault has no wrapped MVK record", () => {
  assert.equal(isVaultUsingMasterVaultKey(), false);
  assert.equal(loadWrappedMasterVaultKeyRecord(), null);
});

test("store and load wrapped MVK record round trip", async () => {
  const mvk = generateMasterVaultKey();
  const wrapped = await wrapMasterVaultKeyWithPin(mvk, TEST_PIN);

  storeWrappedMasterVaultKeyRecord(wrapped);
  const loaded = loadWrappedMasterVaultKeyRecord();

  assert.ok(loaded);
  assert.equal(loaded.version, wrapped.version);
  assert.equal(loaded.wrap_method, wrapped.wrap_method);
  assert.equal(loaded.ciphertext, wrapped.ciphertext);
  assert.equal(isVaultUsingMasterVaultKey(), true);
  assert.ok(storage.has(VAULT_WRAPPED_MVK_STORAGE_KEY));
});

test("clearWrappedMasterVaultKeyRecord removes MVK mode", async () => {
  const mvk = generateMasterVaultKey();
  storeWrappedMasterVaultKeyRecord(await wrapMasterVaultKeyWithPin(mvk, TEST_PIN));

  clearWrappedMasterVaultKeyRecord();

  assert.equal(isVaultUsingMasterVaultKey(), false);
  assert.equal(loadWrappedMasterVaultKeyRecord(), null);
});

test("initializeMasterVaultKeyForNewVault stores PIN-wrapped MVK", async () => {
  const result = await initializeMasterVaultKeyForNewVault(TEST_PIN);

  assert.equal(result.usingMasterVaultKey, true);
  assert.ok(result.created_at);
  assert.equal(isVaultUsingMasterVaultKey(), true);

  const loaded = loadWrappedMasterVaultKeyRecord();
  const unwrapped = await unwrapMasterVaultKeyWithPin(loaded, TEST_PIN);

  assert.ok(unwrapped instanceof Uint8Array);
  assert.equal(unwrapped.length, 32);
});

test("initializeMasterVaultKeyForNewVault rejects duplicate setup", async () => {
  await initializeMasterVaultKeyForNewVault(TEST_PIN);

  await assert.rejects(
    () => initializeMasterVaultKeyForNewVault(TEST_PIN),
    /Master vault key storage already exists/
  );
});

test("stored wrapped record does not expose raw MVK", async () => {
  await initializeMasterVaultKeyForNewVault(TEST_PIN);
  const raw = storage.get(VAULT_WRAPPED_MVK_STORAGE_KEY);

  assert.ok(typeof raw === "string");
  assert.equal(JSON.parse(raw).master_vault_key, undefined);
  assert.equal(JSON.parse(raw).mvk, undefined);
});

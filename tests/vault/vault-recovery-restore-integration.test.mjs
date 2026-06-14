import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { generateMasterVaultKey } from "../../app/lib/vaultKeyRing.js";
import {
  resetVaultKeyRingStorageForTests,
  VAULT_WRAPPED_MVK_STORAGE_KEY,
} from "../../app/lib/vaultKeyRingStorage.js";
import { resetPasskeyWrapStorageForTests } from "../../app/lib/vaultPasskeyStorage.js";
import { clearVaultPinRecord, VAULT_PIN_STORAGE_KEY } from "../../app/lib/vaultPin.js";
import {
  exportRecoveryKit,
  generateRecoveryPhrase,
  serializeRecoveryKit,
} from "../../app/lib/vaultRecovery.js";
import { clearVaultRecoveryKitConfirmationForTests } from "../../app/lib/vaultRecoveryStatus.js";
import {
  resetVaultBootstrapForTests,
  VAULT_BOOTSTRAP_CHOICES,
  writeVaultBootstrapChoice,
} from "../../app/lib/vaultBootstrap.js";
import {
  readVaultGenesis,
  resetVaultGenesisForTests,
} from "../../app/lib/vaultGenesis.js";
import {
  ensureVaultDevice,
  isVaultDeviceRegisteredLocally,
  registerVaultDeviceWithServer,
  VAULT_DEVICE_REGISTERED_KEY,
  VAULT_DEVICE_STORAGE_KEY,
} from "../../app/lib/vaultDevice.js";
import { isVaultBootstrapPending } from "../../app/lib/vaultBootstrap.js";
import { fetchVaultDocumentMetadata } from "../../app/lib/vaultDocumentClient.js";
import { resolveVaultUnlockKeys } from "../../app/lib/vaultUnlock.js";
import { completeRecoveryImport } from "../../app/lib/vaultRecoveryImport.js";

const TEST_VAULT_ID = "44444444-4444-4444-8444-444444444444";
const TEST_PIN = "123456";
const storage = new Map();
let fetchCalls = [];

async function buildTestRecoveryKit() {
  const masterVaultKey = generateMasterVaultKey();
  const recoveryPhrase = generateRecoveryPhrase();
  const kit = await exportRecoveryKit({
    vaultId: TEST_VAULT_ID,
    masterVaultKey,
    recoveryPhrase,
  });

  return { recoveryPhrase, kit, serializedKit: serializeRecoveryKit(kit) };
}

function installBrowserStorage() {
  storage.clear();
  fetchCalls = [];

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

  globalThis.fetch = async (url, init = {}) => {
    fetchCalls.push({ url: String(url), init });

    if (String(url).includes("/api/vault/register-device")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          registration: {
            vault_device_id: JSON.parse(init.body).vault_device_id,
            device_public_id: "device-public-test",
            created_at: new Date().toISOString(),
          },
        }),
      };
    }

    if (String(url).includes("/api/vault/document") && !String(url).includes("/history")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          document: null,
        }),
      };
    }

    throw new Error(`Unexpected fetch in integration test: ${url}`);
  };

  writeVaultBootstrapChoice(VAULT_BOOTSTRAP_CHOICES.RESTORE);
}

beforeEach(() => {
  installBrowserStorage();
});

afterEach(() => {
  resetVaultBootstrapForTests();
  resetVaultGenesisForTests();
  resetVaultKeyRingStorageForTests();
  clearVaultPinRecord();
  resetPasskeyWrapStorageForTests();
  clearVaultRecoveryKitConfirmationForTests();
  storage.delete(VAULT_DEVICE_STORAGE_KEY);
  storage.delete(VAULT_DEVICE_REGISTERED_KEY);
  delete globalThis.window;
  delete globalThis.fetch;
});

test("restore integration unlocks, registers device, and loads empty document shell", async () => {
  const staleDeviceId = "99999999-9999-4999-8999-999999999999";
  storage.set(
    VAULT_DEVICE_STORAGE_KEY,
    JSON.stringify({
      vault_device_id: staleDeviceId,
      vault_auth_secret: "c3RhbGUtZGV2aWNlLXNlY3JldA==",
      created_at: "2026-01-01T00:00:00.000Z",
    })
  );
  storage.set(VAULT_DEVICE_REGISTERED_KEY, staleDeviceId);

  const { recoveryPhrase, serializedKit } = await buildTestRecoveryKit();

  await completeRecoveryImport({
    recoveryPhrase,
    recoveryKit: serializedKit,
    pin: TEST_PIN,
    confirmPin: TEST_PIN,
  });

  assert.equal(isVaultBootstrapPending(), false);
  assert.equal(readVaultGenesis()?.vault_id, TEST_VAULT_ID);
  assert.equal(storage.has(VAULT_DEVICE_STORAGE_KEY), false);
  assert.equal(storage.has(VAULT_DEVICE_REGISTERED_KEY), false);
  assert.equal(storage.has(VAULT_PIN_STORAGE_KEY), true);
  assert.equal(storage.has(VAULT_WRAPPED_MVK_STORAGE_KEY), true);

  const unlockKeys = await resolveVaultUnlockKeys(TEST_PIN);
  assert.equal(unlockKeys.mode, "mvk");

  const device = ensureVaultDevice();
  assert.notEqual(device.vault_device_id, staleDeviceId);
  assert.equal(isVaultDeviceRegisteredLocally(), false);

  await registerVaultDeviceWithServer();
  assert.equal(isVaultDeviceRegisteredLocally(), true);

  const metadataResult = await fetchVaultDocumentMetadata();
  assert.equal(metadataResult.ok, true);
  assert.equal(metadataResult.data.document, null);
  assert.ok(fetchCalls.some((call) => call.url.includes("/api/vault/register-device")));
  assert.ok(fetchCalls.some((call) => call.url.includes("/api/vault/document")));
});

import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { register } from "node:module";
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
} from "../../app/lib/vaultRecovery.js";
import {
  clearVaultRecoveryKitConfirmationForTests,
  VAULT_RECOVERY_KIT_CONFIRMED_STORAGE_KEY,
} from "../../app/lib/vaultRecoveryStatus.js";
import {
  readVaultBootstrapChoice,
  resetVaultBootstrapForTests,
  VAULT_BOOTSTRAP_CHOICES,
  writeVaultBootstrapChoice,
} from "../../app/lib/vaultBootstrap.js";
import {
  resetVaultGenesisForTests,
  VAULT_GENESIS_STORAGE_KEY,
} from "../../app/lib/vaultGenesis.js";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const TEST_VAULT_ID = "55555555-5555-4555-8555-555555555555";
const TEST_PIN = "123456";
const storage = new Map();

async function buildTestRecoveryKit() {
  const masterVaultKey = generateMasterVaultKey();
  const recoveryPhrase = generateRecoveryPhrase();
  const kit = await exportRecoveryKit({
    vaultId: TEST_VAULT_ID,
    masterVaultKey,
    recoveryPhrase,
  });

  return { masterVaultKey, recoveryPhrase, kit };
}

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

  writeVaultBootstrapChoice(VAULT_BOOTSTRAP_CHOICES.RESTORE);
});

afterEach(() => {
  mock.reset();
  resetVaultBootstrapForTests();
  resetVaultGenesisForTests();
  resetVaultKeyRingStorageForTests();
  clearVaultPinRecord();
  resetPasskeyWrapStorageForTests();
  clearVaultRecoveryKitConfirmationForTests();
  delete globalThis.window;
});

test("applyImportedVaultState rolls back when genesis import fails", async () => {
  const genesisModule = await import("../../app/lib/vaultGenesis.js");

  mock.module("../../app/lib/vaultGenesis.js", {
    namedExports: {
      ...genesisModule,
      importVaultGenesisFromRecovery: async () => {
        throw new Error("Simulated genesis failure");
      },
    },
  });

  const { applyImportedVaultState } = await import("../../app/lib/vaultRecoveryImport.js");
  const { masterVaultKey, kit } = await buildTestRecoveryKit();

  await assert.rejects(
    () =>
      applyImportedVaultState({
        masterVaultKey,
        pin: TEST_PIN,
        recoveryKit: kit,
      }),
    (error) => error.code === "APPLY_FAILED"
  );

  assert.equal(storage.has(VAULT_GENESIS_STORAGE_KEY), false);
  assert.equal(storage.has(VAULT_PIN_STORAGE_KEY), false);
  assert.equal(storage.has(VAULT_WRAPPED_MVK_STORAGE_KEY), false);
  assert.equal(storage.has(VAULT_RECOVERY_KIT_CONFIRMED_STORAGE_KEY), false);
  assert.equal(readVaultBootstrapChoice(), VAULT_BOOTSTRAP_CHOICES.RESTORE);
});

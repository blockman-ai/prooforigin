import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { generateMasterVaultKey } from "../../app/lib/vaultKeyRing.js";
import {
  resetVaultKeyRingStorageForTests,
  VAULT_WRAPPED_MVK_STORAGE_KEY,
} from "../../app/lib/vaultKeyRingStorage.js";
import {
  buildPasskeyWrapRecord,
  normalizePasskeyWrapKey,
} from "../../app/lib/vaultPasskey.js";
import {
  resetPasskeyWrapStorageForTests,
  storePasskeyWrapRecord,
  VAULT_PASSKEY_WRAP_STORAGE_KEY,
} from "../../app/lib/vaultPasskeyStorage.js";
import { clearVaultPinRecord, setupVaultPin, VAULT_PIN_STORAGE_KEY } from "../../app/lib/vaultPin.js";
import {
  exportRecoveryKit,
  generateRecoveryPhrase,
  serializeRecoveryKit,
  VAULT_RECOVERY_KIT_VERSION,
} from "../../app/lib/vaultRecovery.js";
import {
  clearVaultRecoveryKitConfirmationForTests,
  readVaultRecoveryKitConfirmation,
  VAULT_RECOVERY_KIT_CONFIRMED_STORAGE_KEY,
} from "../../app/lib/vaultRecoveryStatus.js";
import {
  resetVaultBootstrapForTests,
  VAULT_BOOTSTRAP_CHOICES,
  writeVaultBootstrapChoice,
} from "../../app/lib/vaultBootstrap.js";
import {
  readVaultGenesis,
  resetVaultGenesisForTests,
  VAULT_GENESIS_STORAGE_KEY,
} from "../../app/lib/vaultGenesis.js";
import {
  applyImportedVaultState,
  completeRecoveryImport,
  getRecoveryImportBlockReason,
  unwrapMvkForImport,
  validateRecoveryImportInputs,
  VaultRecoveryImportError,
} from "../../app/lib/vaultRecoveryImport.js";

const TEST_VAULT_ID = "22222222-2222-4222-8222-222222222222";
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
  resetVaultBootstrapForTests();
  resetVaultGenesisForTests();
  resetVaultKeyRingStorageForTests();
  clearVaultPinRecord();
  resetPasskeyWrapStorageForTests();
  clearVaultRecoveryKitConfirmationForTests();
  delete globalThis.window;
});

test("validateRecoveryImportInputs requires phrase and kit", () => {
  assert.throws(
    () => validateRecoveryImportInputs({ recoveryPhrase: "", recoveryKit: null }),
    (error) => error instanceof VaultRecoveryImportError && error.code === "INPUT_REQUIRED"
  );

  assert.throws(
    () => validateRecoveryImportInputs({ recoveryPhrase: "amber anchor", recoveryKit: null }),
    (error) => error instanceof VaultRecoveryImportError && error.code === "KIT_REQUIRED"
  );
});

test("validateRecoveryImportInputs rejects phrase-only input", () => {
  assert.throws(
    () =>
      validateRecoveryImportInputs({
        recoveryPhrase: generateRecoveryPhrase(),
        recoveryKit: null,
      }),
    (error) => error instanceof VaultRecoveryImportError && error.code === "KIT_REQUIRED"
  );
});

test("validateRecoveryImportInputs rejects kit-only input", async () => {
  const { kit } = await buildTestRecoveryKit();

  assert.throws(
    () => validateRecoveryImportInputs({ recoveryPhrase: "", recoveryKit: kit }),
    (error) => error instanceof VaultRecoveryImportError && error.code === "PHRASE_REQUIRED"
  );
});

test("validateRecoveryImportInputs rejects invalid kit JSON", () => {
  assert.throws(
    () =>
      validateRecoveryImportInputs({
        recoveryPhrase: generateRecoveryPhrase(),
        recoveryKit: "{not-json",
      }),
    (error) => error instanceof VaultRecoveryImportError && error.code === "KIT_INVALID"
  );
});

test("unwrapMvkForImport fails closed on wrong phrase", async () => {
  const { kit } = await buildTestRecoveryKit();

  await assert.rejects(
    () => unwrapMvkForImport(kit, generateRecoveryPhrase()),
    (error) => error instanceof VaultRecoveryImportError && error.code === "PHRASE_MISMATCH"
  );

  assert.equal(storage.has(VAULT_GENESIS_STORAGE_KEY), false);
  assert.equal(storage.has(VAULT_WRAPPED_MVK_STORAGE_KEY), false);
});

test("completeRecoveryImport happy path writes imported state", async () => {
  const { masterVaultKey, recoveryPhrase, kit } = await buildTestRecoveryKit();
  const serializedKit = serializeRecoveryKit(kit);
  const mvkPlaintextHex = Array.from(masterVaultKey)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  const passkeyWrapKey = await normalizePasskeyWrapKey(crypto.getRandomValues(new Uint8Array(32)));
  const passkeyRecord = await buildPasskeyWrapRecord({
    vaultId: "old-vault-id",
    credentialId: "cred-test",
    masterVaultKey: generateMasterVaultKey(),
    legacyPinKey: generateMasterVaultKey(),
    passkeyWrapKey,
    prfSalt: crypto.getRandomValues(new Uint8Array(32)),
  });
  storePasskeyWrapRecord(passkeyRecord);

  assert.equal(storage.has(VAULT_PASSKEY_WRAP_STORAGE_KEY), true);

  const result = await completeRecoveryImport({
    recoveryPhrase,
    recoveryKit: serializedKit,
    pin: TEST_PIN,
    confirmPin: TEST_PIN,
  });

  assert.equal(result.vault_id, TEST_VAULT_ID);
  assert.equal(readVaultGenesis()?.vault_id, TEST_VAULT_ID);
  assert.equal(readVaultRecoveryKitConfirmation()?.vault_id, TEST_VAULT_ID);
  assert.equal(readVaultRecoveryKitConfirmation()?.kit_version, VAULT_RECOVERY_KIT_VERSION);
  assert.equal(storage.has(VAULT_PIN_STORAGE_KEY), true);
  assert.equal(storage.has(VAULT_WRAPPED_MVK_STORAGE_KEY), true);
  assert.equal(storage.has(VAULT_PASSKEY_WRAP_STORAGE_KEY), false);
  assert.equal(storage.has(VAULT_RECOVERY_KIT_CONFIRMED_STORAGE_KEY), true);

  const wrappedRaw = storage.get(VAULT_WRAPPED_MVK_STORAGE_KEY) || "";
  assert.ok(!wrappedRaw.includes(recoveryPhrase));
  assert.ok(!wrappedRaw.includes(mvkPlaintextHex));

  for (const value of storage.values()) {
    assert.ok(!String(value).includes(recoveryPhrase));
    assert.ok(!String(value).includes(mvkPlaintextHex));
  }
});

test("applyImportedVaultState writes imported genesis vault_id", async () => {
  const { masterVaultKey, kit } = await buildTestRecoveryKit();

  const result = await applyImportedVaultState({
    masterVaultKey,
    pin: TEST_PIN,
    recoveryKit: kit,
  });

  assert.equal(result.vault_id, TEST_VAULT_ID);
  assert.equal(readVaultGenesis()?.vault_id, TEST_VAULT_ID);
  assert.equal(readVaultRecoveryKitConfirmation()?.vault_id, TEST_VAULT_ID);
});

test("completeRecoveryImport does not persist state on wrong phrase", async () => {
  const { kit } = await buildTestRecoveryKit();

  await assert.rejects(
    () =>
      completeRecoveryImport({
        recoveryPhrase: generateRecoveryPhrase(),
        recoveryKit: kit,
        pin: TEST_PIN,
      }),
    (error) => error instanceof VaultRecoveryImportError && error.code === "PHRASE_MISMATCH"
  );

  assert.equal(storage.has(VAULT_GENESIS_STORAGE_KEY), false);
  assert.equal(storage.has(VAULT_WRAPPED_MVK_STORAGE_KEY), false);
  assert.equal(storage.has(VAULT_PIN_STORAGE_KEY), false);
});

test("completeRecoveryImport rejects missing phrase", async () => {
  const { kit } = await buildTestRecoveryKit();

  await assert.rejects(
    () =>
      completeRecoveryImport({
        recoveryPhrase: "",
        recoveryKit: kit,
        pin: TEST_PIN,
      }),
    (error) => error instanceof VaultRecoveryImportError && error.code === "PHRASE_REQUIRED"
  );
});

test("completeRecoveryImport rejects missing kit", async () => {
  await assert.rejects(
    () =>
      completeRecoveryImport({
        recoveryPhrase: generateRecoveryPhrase(),
        recoveryKit: null,
        pin: TEST_PIN,
      }),
    (error) => error instanceof VaultRecoveryImportError && error.code === "KIT_REQUIRED"
  );
});

test("completeRecoveryImport rejects invalid kit payload", async () => {
  await assert.rejects(
    () =>
      completeRecoveryImport({
        recoveryPhrase: generateRecoveryPhrase(),
        recoveryKit: '{"version":"recovery-kit-v0"}',
        pin: TEST_PIN,
      }),
    (error) => error instanceof VaultRecoveryImportError && error.code === "KIT_INVALID"
  );
});

test("getRecoveryImportBlockReason reports genesis, pin, and mvk conflicts", async () => {
  assert.equal(getRecoveryImportBlockReason(), null);

  await setupVaultPin(TEST_PIN);
  assert.equal(getRecoveryImportBlockReason()?.code, "PIN_EXISTS");

  clearVaultPinRecord();
  const { masterVaultKey, kit } = await buildTestRecoveryKit();
  await applyImportedVaultState({
    masterVaultKey,
    pin: TEST_PIN,
    recoveryKit: kit,
  });

  assert.equal(getRecoveryImportBlockReason()?.code, "GENESIS_EXISTS");
});

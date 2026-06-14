import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, test } from "node:test";
import { generateMasterVaultKey } from "../../app/lib/vaultKeyRing.js";
import {
  resetVaultKeyRingStorageForTests,
  VAULT_WRAPPED_MVK_STORAGE_KEY,
} from "../../app/lib/vaultKeyRingStorage.js";
import {
  resetPasskeyWrapStorageForTests,
  storePasskeyWrapRecord,
  VAULT_PASSKEY_WRAP_STORAGE_KEY,
} from "../../app/lib/vaultPasskeyStorage.js";
import {
  buildPasskeyWrapRecord,
  normalizePasskeyWrapKey,
} from "../../app/lib/vaultPasskey.js";
import { clearVaultPinRecord, VAULT_PIN_STORAGE_KEY } from "../../app/lib/vaultPin.js";
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
import { completeRecoveryImport, VaultRecoveryImportError } from "../../app/lib/vaultRecoveryImport.js";
import {
  getNextWizardStep,
  getPreviousWizardStep,
  RECOVERY_WIZARD_STEPS,
  validateRecoveryKitUpload,
  validateRecoveryPhraseStep,
  verifyRecoveryPhraseForWizard,
} from "../../app/lib/vaultRecoveryImportWizard.js";

const TEST_VAULT_ID = "33333333-3333-4333-8333-333333333333";
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

  return { masterVaultKey, recoveryPhrase, kit, serializedKit: serializeRecoveryKit(kit) };
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

test("wizard navigation advances and retreats in order", () => {
  assert.equal(getNextWizardStep(RECOVERY_WIZARD_STEPS.KIT), RECOVERY_WIZARD_STEPS.PHRASE);
  assert.equal(getNextWizardStep(RECOVERY_WIZARD_STEPS.PHRASE), RECOVERY_WIZARD_STEPS.PIN);
  assert.equal(getNextWizardStep(RECOVERY_WIZARD_STEPS.PIN), RECOVERY_WIZARD_STEPS.COMPLETE);
  assert.equal(getNextWizardStep(RECOVERY_WIZARD_STEPS.COMPLETE), null);

  assert.equal(getPreviousWizardStep(RECOVERY_WIZARD_STEPS.PHRASE), RECOVERY_WIZARD_STEPS.KIT);
  assert.equal(getPreviousWizardStep(RECOVERY_WIZARD_STEPS.KIT), null);
});

test("validateRecoveryKitUpload rejects kit-only empty upload", () => {
  assert.throws(
    () => validateRecoveryKitUpload(null),
    (error) => error instanceof VaultRecoveryImportError && error.code === "KIT_REQUIRED"
  );

  assert.throws(
    () => validateRecoveryKitUpload(""),
    (error) => error instanceof VaultRecoveryImportError && error.code === "KIT_REQUIRED"
  );
});

test("validateRecoveryKitUpload rejects invalid kit JSON", () => {
  assert.throws(
    () => validateRecoveryKitUpload("{bad-json"),
    (error) => error instanceof VaultRecoveryImportError && error.code === "KIT_INVALID"
  );
});

test("validateRecoveryPhraseStep rejects phrase-only input", async () => {
  const { kit } = await buildTestRecoveryKit();

  assert.throws(
    () => validateRecoveryPhraseStep({ recoveryPhrase: "", recoveryKit: kit }),
    (error) => error instanceof VaultRecoveryImportError && error.code === "PHRASE_REQUIRED"
  );
});

test("verifyRecoveryPhraseForWizard fails closed on wrong phrase", async () => {
  const { kit } = await buildTestRecoveryKit();

  await assert.rejects(
    () => verifyRecoveryPhraseForWizard({ recoveryPhrase: generateRecoveryPhrase(), recoveryKit: kit }),
    (error) => error instanceof VaultRecoveryImportError && error.code === "PHRASE_MISMATCH"
  );
});

test("wizard success path restores imported vault state", async () => {
  const { recoveryPhrase, serializedKit } = await buildTestRecoveryKit();

  const passkeyWrapKey = await normalizePasskeyWrapKey(crypto.getRandomValues(new Uint8Array(32)));
  storePasskeyWrapRecord(
    await buildPasskeyWrapRecord({
      vaultId: "old-vault",
      credentialId: "cred-test",
      masterVaultKey: generateMasterVaultKey(),
      legacyPinKey: generateMasterVaultKey(),
      passkeyWrapKey,
      prfSalt: crypto.getRandomValues(new Uint8Array(32)),
    })
  );

  const parsedKit = validateRecoveryKitUpload(serializedKit);
  await verifyRecoveryPhraseForWizard({ recoveryPhrase, recoveryKit: parsedKit.kit });

  const result = await completeRecoveryImport({
    recoveryPhrase,
    recoveryKit: parsedKit.kit,
    pin: TEST_PIN,
    confirmPin: TEST_PIN,
  });

  assert.equal(result.vault_id, TEST_VAULT_ID);
  assert.equal(readVaultGenesis()?.vault_id, TEST_VAULT_ID);
  assert.equal(storage.has(VAULT_WRAPPED_MVK_STORAGE_KEY), true);
  assert.equal(storage.has(VAULT_PASSKEY_WRAP_STORAGE_KEY), false);
  assert.equal(readVaultRecoveryKitConfirmation()?.vault_id, TEST_VAULT_ID);
  assert.equal(readVaultRecoveryKitConfirmation()?.kit_version, VAULT_RECOVERY_KIT_VERSION);
});

test("restore route and wizard include security and migration copy", () => {
  const page = readFileSync("app/vault/restore/page.jsx", "utf8");
  const wizard = readFileSync("components/vault/RecoveryImportWizard.jsx", "utf8");
  const vaultPage = readFileSync("app/vault/page.jsx", "utf8");

  assert.match(page, /RecoveryImportWizard/);
  assert.match(page, /Restore from Recovery Kit/);
  assert.match(wizard, /ProofOrigin will never ask for/);
  assert.match(wizard, /Recovery Phrase/);
  assert.match(wizard, /Recovery Kit contents/);
  assert.match(wizard, /Vault identity restored/);
  assert.match(wizard, /Documents from your previous device are not available on this device yet/);
  assert.match(wizard, /Cross-device document migration is a future phase/);
  assert.match(wizard, /data-error-code/);
  assert.match(vaultPage, /Go to Restore Wizard/);
  assert.match(vaultPage, /\/vault\/restore/);
});

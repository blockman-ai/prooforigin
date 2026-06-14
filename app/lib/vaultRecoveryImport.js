import { clearVaultBootstrapChoice } from "./vaultBootstrap.js";
import {
  importVaultGenesisFromRecovery,
  readVaultGenesis,
} from "./vaultGenesis.js";
import { wipeSensitiveBytes, wrapMasterVaultKeyWithPin } from "./vaultKeyRing.js";
import {
  loadWrappedMasterVaultKeyRecord,
  storeWrappedMasterVaultKeyRecord,
} from "./vaultKeyRingStorage.js";
import { clearPasskeyWrapRecord } from "./vaultPasskeyStorage.js";
import { hasVaultPinConfigured, isValidPinFormat, setupVaultPin, VAULT_PIN_MIN_LENGTH } from "./vaultPin.js";
import {
  parseRecoveryKit,
  unwrapMasterVaultKeyFromRecoveryKit,
  validateRecoveryPhrase,
  VAULT_RECOVERY_KIT_VERSION,
} from "./vaultRecovery.js";
import { markVaultRecoveryKitConfirmed } from "./vaultRecoveryStatus.js";

export class VaultRecoveryImportError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "VaultRecoveryImportError";
    this.code = code;
  }
}

function assertBrowserStorage() {
  if (typeof window === "undefined") {
    throw new VaultRecoveryImportError(
      "Recovery import is only available in the browser.",
      "BROWSER_REQUIRED"
    );
  }
}

function resolveRecoveryKitInput(recoveryKit) {
  if (recoveryKit == null) {
    return null;
  }

  if (typeof recoveryKit === "string") {
    const trimmed = recoveryKit.trim();
    if (!trimmed) {
      return null;
    }

    return parseRecoveryKit(trimmed);
  }

  if (typeof recoveryKit === "object") {
    return parseRecoveryKit(JSON.stringify(recoveryKit));
  }

  return null;
}

function assertImportTargetAvailable() {
  if (readVaultGenesis()) {
    throw new VaultRecoveryImportError(
      "Vault genesis already exists on this device.",
      "GENESIS_EXISTS"
    );
  }

  if (hasVaultPinConfigured()) {
    throw new VaultRecoveryImportError(
      "Vault PIN already exists on this device.",
      "PIN_EXISTS"
    );
  }

  if (loadWrappedMasterVaultKeyRecord()) {
    throw new VaultRecoveryImportError(
      "Wrapped master vault key already exists on this device.",
      "MVK_STORAGE_EXISTS"
    );
  }
}

export function validateRecoveryImportInputs({ recoveryPhrase, recoveryKit }) {
  assertBrowserStorage();

  const phraseValidation = validateRecoveryPhrase(recoveryPhrase);
  const hasPhrase = Boolean(String(recoveryPhrase || "").trim());
  const hasKitInput =
    recoveryKit != null &&
    !(typeof recoveryKit === "string" && !recoveryKit.trim());

  if (!hasKitInput && !hasPhrase) {
    throw new VaultRecoveryImportError(
      "Recovery kit and recovery phrase are required.",
      "INPUT_REQUIRED"
    );
  }

  if (!hasKitInput) {
    throw new VaultRecoveryImportError(
      "Recovery kit file is required. Phrase alone is not enough.",
      "KIT_REQUIRED"
    );
  }

  if (!hasPhrase) {
    throw new VaultRecoveryImportError(
      "Recovery phrase is required. Kit alone is not enough.",
      "PHRASE_REQUIRED"
    );
  }

  if (!phraseValidation.valid) {
    throw new VaultRecoveryImportError(
      phraseValidation.error || "Recovery phrase is invalid.",
      "PHRASE_INVALID"
    );
  }

  let kit;
  try {
    kit = resolveRecoveryKitInput(recoveryKit);
  } catch (error) {
    throw new VaultRecoveryImportError(
      error?.message || "Recovery kit is invalid or unsupported.",
      "KIT_INVALID"
    );
  }

  if (!kit) {
    throw new VaultRecoveryImportError(
      "Recovery kit file is required. Phrase alone is not enough.",
      "KIT_REQUIRED"
    );
  }

  return {
    recoveryKit: kit,
    normalizedPhrase: phraseValidation.normalized,
  };
}

export async function unwrapMvkForImport(recoveryKit, recoveryPhrase) {
  const { recoveryKit: kit, normalizedPhrase } = validateRecoveryImportInputs({
    recoveryPhrase,
    recoveryKit,
  });

  const masterVaultKey = await unwrapMasterVaultKeyFromRecoveryKit(kit, normalizedPhrase);

  if (!masterVaultKey) {
    throw new VaultRecoveryImportError(
      "Recovery phrase does not match this kit.",
      "PHRASE_MISMATCH"
    );
  }

  return {
    masterVaultKey,
    recoveryKit: kit,
    normalizedPhrase,
  };
}

export async function applyImportedVaultState({ masterVaultKey, pin, recoveryKit }) {
  assertBrowserStorage();
  assertImportTargetAvailable();

  if (!(masterVaultKey instanceof Uint8Array) || masterVaultKey.length !== 32) {
    throw new VaultRecoveryImportError(
      "Recovered master vault key is invalid.",
      "MVK_INVALID"
    );
  }

  if (!isValidPinFormat(pin)) {
    throw new VaultRecoveryImportError(
      `PIN must be at least ${VAULT_PIN_MIN_LENGTH} digits.`,
      "PIN_INVALID"
    );
  }

  if (
    !recoveryKit ||
    recoveryKit.version !== VAULT_RECOVERY_KIT_VERSION ||
    typeof recoveryKit.vault_id !== "string" ||
    !recoveryKit.vault_id.trim()
  ) {
    throw new VaultRecoveryImportError(
      "Recovery kit is invalid or unsupported.",
      "KIT_INVALID"
    );
  }

  let wrappedRecord = null;

  try {
    await setupVaultPin(pin);
    wrappedRecord = await wrapMasterVaultKeyWithPin(masterVaultKey, pin);
    storeWrappedMasterVaultKeyRecord(wrappedRecord);

    const genesis = await importVaultGenesisFromRecovery({
      vaultId: recoveryKit.vault_id,
      importedAt: recoveryKit.created_at,
    });

    clearPasskeyWrapRecord();

    const recoveryConfirmed = markVaultRecoveryKitConfirmed({
      vaultId: recoveryKit.vault_id,
      kitVersion: recoveryKit.version,
      kitCreatedAt: recoveryKit.created_at,
    });

    clearVaultBootstrapChoice();

    return {
      vault_id: genesis.vault_id,
      vault_genesis_hash: genesis.vault_genesis_hash,
      recovery_confirmed: recoveryConfirmed,
      wrapped_mvk_created_at: wrappedRecord.created_at,
    };
  } catch (error) {
    if (error instanceof VaultRecoveryImportError) {
      throw error;
    }

    throw new VaultRecoveryImportError(
      error?.message || "Unable to apply imported vault state.",
      "APPLY_FAILED"
    );
  } finally {
    wipeSensitiveBytes(masterVaultKey);
  }
}

export async function completeRecoveryImport({
  recoveryPhrase,
  recoveryKit,
  pin,
  confirmPin,
}) {
  if (!isValidPinFormat(pin)) {
    throw new VaultRecoveryImportError(
      `PIN must be at least ${VAULT_PIN_MIN_LENGTH} digits.`,
      "PIN_INVALID"
    );
  }

  if (confirmPin != null && pin !== confirmPin) {
    throw new VaultRecoveryImportError("PIN confirmation does not match.", "PIN_MISMATCH");
  }

  const { masterVaultKey, recoveryKit: kit } = await unwrapMvkForImport(recoveryKit, recoveryPhrase);

  try {
    return await applyImportedVaultState({
      masterVaultKey,
      pin,
      recoveryKit: kit,
    });
  } finally {
    wipeSensitiveBytes(masterVaultKey);
  }
}

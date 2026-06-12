import { deriveVaultMasterKey } from "./vaultCrypto.js";
import {
  getVaultPinSalt,
  isValidPinFormat,
  setupVaultPin,
  verifyVaultPinAndDeriveMasterKey,
  VAULT_PIN_MIN_LENGTH,
} from "./vaultPin.js";
import { unwrapMasterVaultKeyWithPin } from "./vaultKeyRing.js";
import {
  initializeMasterVaultKeyForNewVault,
  isVaultUsingMasterVaultKey,
  loadWrappedMasterVaultKeyRecord,
} from "./vaultKeyRingStorage.js";

export async function resolveVaultUnlockKeys(pin, { isSetup = false } = {}) {
  if (!isValidPinFormat(pin)) {
    throw new Error(`PIN must be at least ${VAULT_PIN_MIN_LENGTH} digits.`);
  }

  if (isSetup) {
    await setupVaultPin(pin);
    await initializeMasterVaultKeyForNewVault(pin);

    const wrappedRecord = loadWrappedMasterVaultKeyRecord();
    const masterVaultKey = await unwrapMasterVaultKeyWithPin(wrappedRecord, pin);

    if (!masterVaultKey) {
      throw new Error("Unable to unlock new vault master key.");
    }

    const legacyPinKey = await deriveVaultMasterKey(pin, getVaultPinSalt());

    return {
      mode: "mvk",
      masterVaultKey,
      legacyPinKey,
    };
  }

  if (isVaultUsingMasterVaultKey()) {
    const wrappedRecord = loadWrappedMasterVaultKeyRecord();
    const masterVaultKey = await unwrapMasterVaultKeyWithPin(wrappedRecord, pin);

    if (!masterVaultKey) {
      throw new Error("Incorrect PIN. Try again.");
    }

    const legacyPinKey = await deriveVaultMasterKey(pin, getVaultPinSalt());

    return {
      mode: "mvk",
      masterVaultKey,
      legacyPinKey,
    };
  }

  const legacyPinKey = await verifyVaultPinAndDeriveMasterKey(pin);

  if (!legacyPinKey) {
    throw new Error("Incorrect PIN. Try again.");
  }

  return {
    mode: "legacy",
    masterVaultKey: null,
    legacyPinKey,
  };
}

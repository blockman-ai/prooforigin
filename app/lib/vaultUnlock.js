import { deriveVaultMasterKey } from "./vaultCrypto.js";
import {
  getVaultPinSalt,
  isValidPinFormat,
  setupVaultPin,
  verifyVaultPinAndDeriveMasterKey,
  VAULT_PIN_MIN_LENGTH,
} from "./vaultPin.js";
import { unwrapMasterVaultKeyWithPin, wipeSensitiveBytes } from "./vaultKeyRing.js";
import {
  initializeMasterVaultKeyForNewVault,
  isVaultUsingMasterVaultKey,
  loadWrappedMasterVaultKeyRecord,
} from "./vaultKeyRingStorage.js";
import {
  detectPasskeyCapabilities,
  normalizePasskeyWrapKey,
  unwrapVaultKeysFromPasskeyWrapRecord,
} from "./vaultPasskey.js";
import {
  evaluateVaultPasskeyPrf,
  getDefaultPasskeyRpId,
} from "./vaultPasskeyEnroll.js";
import { loadPasskeyWrapRecord } from "./vaultPasskeyStorage.js";

export class VaultPasskeyUnlockCancelledError extends Error {
  constructor(message = "Passkey unlock was cancelled.") {
    super(message);
    this.name = "VaultPasskeyUnlockCancelledError";
  }
}

function decodeBase64ToBytes(base64) {
  const binary = atob(String(base64));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodePasskeyPrfSalt(record) {
  const bytes = decodeBase64ToBytes(record.prf_salt);
  if (bytes.length !== 32) {
    throw new Error("Passkey wrap record has an invalid PRF salt.");
  }
  return bytes;
}

function isPasskeyUserCancellationError(error) {
  const name = error?.name || "";
  return name === "NotAllowedError" || name === "AbortError";
}

export async function resolveVaultUnlockKeysWithPasskey({
  loadRecord = loadPasskeyWrapRecord,
  detectCapabilities = detectPasskeyCapabilities,
  evaluatePrf = evaluateVaultPasskeyPrf,
  getRpId = getDefaultPasskeyRpId,
  rpId,
} = {}) {
  const record = loadRecord();
  if (!record) {
    throw new Error("No passkey enrolled for this vault.");
  }

  const capabilities = await detectCapabilities();
  if (!capabilities.passkeyUnlockSupported) {
    throw new Error("Passkey unlock requires WebAuthn PRF support on this device.");
  }

  const resolvedRpId = rpId || getRpId();
  if (!resolvedRpId) {
    throw new Error("Unable to resolve passkey rpId.");
  }

  let passkeyWrapKey = null;
  let prfSalt = null;

  try {
    prfSalt = decodePasskeyPrfSalt(record);

    let prfOutput;
    try {
      prfOutput = await evaluatePrf({
        credentialId: record.credential_id,
        rpId: resolvedRpId,
        prfSalt,
      });
    } catch (error) {
      if (isPasskeyUserCancellationError(error)) {
        throw new VaultPasskeyUnlockCancelledError();
      }
      throw error;
    }

    passkeyWrapKey = await normalizePasskeyWrapKey(prfOutput);
    const unwrapped = await unwrapVaultKeysFromPasskeyWrapRecord(record, passkeyWrapKey);

    if (!unwrapped) {
      throw new Error("Passkey unlock failed. Try your PIN instead.");
    }

    return {
      mode: "mvk",
      masterVaultKey: unwrapped.masterVaultKey,
      legacyPinKey: unwrapped.legacyPinKey,
    };
  } finally {
    if (passkeyWrapKey) {
      wipeSensitiveBytes(passkeyWrapKey);
    }
    if (prfSalt) {
      wipeSensitiveBytes(prfSalt);
    }
  }
}

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

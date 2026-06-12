import {
  deriveVaultPinMasterKeyBytes,
  isValidPinFormat,
  PBKDF2_ITERATIONS,
  VAULT_PIN_MIN_LENGTH,
} from "./vaultPin.js";

export const VAULT_KEY_RING_VERSION = "v1";
export const VAULT_KEY_RING_WRAP_METHOD = "pin_pbkdf2_aes_gcm_v1";
export const VAULT_MVK_BYTES = 32;

const VAULT_MVK_WRAP_IV_BYTES = 12;

const WRAP_INFO = new TextEncoder().encode("prooforigin-vault-mvk-wrap-v1");

function bufferToBase64(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function wipeSensitiveBytes(bytes) {
  if (!bytes) return;
  if (bytes instanceof ArrayBuffer) {
    wipeSensitiveBytes(new Uint8Array(bytes));
    return;
  }
  if (ArrayBuffer.isView(bytes)) {
    bytes.fill(0);
  }
}

async function importAesGcmKey(rawKeyBytes) {
  const keyBytes =
    rawKeyBytes instanceof Uint8Array
      ? rawKeyBytes
      : new Uint8Array(
          rawKeyBytes.buffer.slice(
            rawKeyBytes.byteOffset,
            rawKeyBytes.byteOffset + rawKeyBytes.byteLength
          )
        );

  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

function assertMasterVaultKeyBytes(masterVaultKey) {
  if (!(masterVaultKey instanceof Uint8Array)) {
    throw new Error("Master vault key must be a Uint8Array.");
  }
  if (masterVaultKey.length !== VAULT_MVK_BYTES) {
    throw new Error(`Master vault key must be ${VAULT_MVK_BYTES} bytes.`);
  }
}

function validateWrappedRecord(record) {
  if (!record || typeof record !== "object") {
    throw new Error("Wrapped master vault key record is invalid.");
  }

  if (record.version !== VAULT_KEY_RING_VERSION) {
    throw new Error("Unsupported vault key ring version.");
  }

  if (record.wrap_method !== VAULT_KEY_RING_WRAP_METHOD) {
    throw new Error("Unsupported vault key ring wrap method.");
  }

  for (const field of ["salt", "iv", "ciphertext"]) {
    if (typeof record[field] !== "string" || !record[field].trim()) {
      throw new Error(`Wrapped master vault key record missing ${field}.`);
    }
  }

  if (record.iterations !== PBKDF2_ITERATIONS) {
    throw new Error("Wrapped master vault key record has invalid iterations.");
  }

  return record;
}

export function generateMasterVaultKey() {
  return crypto.getRandomValues(new Uint8Array(VAULT_MVK_BYTES));
}

export async function wrapMasterVaultKeyWithPin(masterVaultKey, pin) {
  assertMasterVaultKeyBytes(masterVaultKey);

  if (!isValidPinFormat(pin)) {
    throw new Error(`PIN must be at least ${VAULT_PIN_MIN_LENGTH} digits.`);
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(VAULT_MVK_WRAP_IV_BYTES));
  let derivedKeyBytes = null;

  try {
    derivedKeyBytes = await deriveVaultPinMasterKeyBytes(pin, salt.buffer);
    const aesKey = await importAesGcmKey(derivedKeyBytes);

    const ciphertextBuffer = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: WRAP_INFO,
      },
      aesKey,
      masterVaultKey
    );

    return {
      version: VAULT_KEY_RING_VERSION,
      wrap_method: VAULT_KEY_RING_WRAP_METHOD,
      salt: bufferToBase64(salt.buffer),
      iv: bufferToBase64(iv.buffer),
      ciphertext: bufferToBase64(ciphertextBuffer),
      iterations: PBKDF2_ITERATIONS,
      created_at: new Date().toISOString(),
    };
  } finally {
    if (derivedKeyBytes) {
      wipeSensitiveBytes(derivedKeyBytes);
    }
    wipeSensitiveBytes(salt);
    wipeSensitiveBytes(iv);
  }
}

export async function unwrapMasterVaultKeyWithPin(wrappedRecord, pin) {
  const record = validateWrappedRecord(wrappedRecord);

  if (!isValidPinFormat(pin)) {
    return null;
  }

  const salt = base64ToBuffer(record.salt);
  const iv = base64ToBuffer(record.iv);
  const ciphertext = base64ToBuffer(record.ciphertext);
  let derivedKeyBytes = null;

  try {
    derivedKeyBytes = await deriveVaultPinMasterKeyBytes(pin, salt.buffer);
    const aesKey = await importAesGcmKey(derivedKeyBytes);

    const plaintextBuffer = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: WRAP_INFO,
      },
      aesKey,
      ciphertext
    );

    const masterVaultKey = new Uint8Array(plaintextBuffer);
    if (masterVaultKey.length !== VAULT_MVK_BYTES) {
      wipeSensitiveBytes(masterVaultKey);
      return null;
    }

    return masterVaultKey;
  } catch {
    return null;
  } finally {
    if (derivedKeyBytes) {
      wipeSensitiveBytes(derivedKeyBytes);
    }
    wipeSensitiveBytes(salt);
    wipeSensitiveBytes(iv);
    wipeSensitiveBytes(ciphertext);
  }
}

export function exportWrappedMasterVaultKeyRecord(wrappedRecord) {
  const record = validateWrappedRecord(wrappedRecord);
  return JSON.stringify(record);
}

export function importWrappedMasterVaultKeyRecord(serialized) {
  if (typeof serialized !== "string" || !serialized.trim()) {
    throw new Error("Wrapped master vault key export must be a non-empty string.");
  }

  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error("Wrapped master vault key export is not valid JSON.");
  }

  return validateWrappedRecord(parsed);
}

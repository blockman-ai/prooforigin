import { clearBytes, sha256Hex } from "./vaultCrypto.js";
import { VAULT_MVK_BYTES, wipeSensitiveBytes } from "./vaultKeyRing.js";

export const VAULT_PASSKEY_WRAP_VERSION = "passkey-wrap-v1";
export const VAULT_PASSKEY_WRAP_METHOD = "webauthn_prf_aes_gcm_v1";
export const VAULT_PASSKEY_PRF_SALT_PREFIX = "prooforigin-vault-passkey-prf-v1";
export const VAULT_PASSKEY_WRAP_KEY_BYTES = 32;
export const VAULT_PASSKEY_WRAP_IV_BYTES = 12;

const MVK_PASSKEY_WRAP_AAD = new TextEncoder().encode("prooforigin-vault-mvk-passkey-wrap-v1");
const LEGACY_PASSKEY_WRAP_AAD = new TextEncoder().encode(
  "prooforigin-vault-legacy-passkey-wrap-v1"
);

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

function hexToBytes(hex) {
  const normalized = String(hex).trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error("Expected a 64-character SHA-256 hex string.");
  }

  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) {
    bytes[i] = parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function isWebAuthnAvailable() {
  return (
    typeof window !== "undefined" &&
    typeof PublicKeyCredential !== "undefined" &&
    typeof navigator?.credentials?.create === "function" &&
    typeof navigator?.credentials?.get === "function"
  );
}

export async function isPlatformAuthenticatorAvailable() {
  if (!isWebAuthnAvailable()) {
    return false;
  }

  if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== "function") {
    return false;
  }

  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export async function probePasskeyPrfSupport() {
  if (!isWebAuthnAvailable()) {
    return false;
  }

  if (typeof PublicKeyCredential.getClientCapabilities === "function") {
    try {
      const capabilities = await PublicKeyCredential.getClientCapabilities();
      return capabilities?.prf === true;
    } catch {
      return false;
    }
  }

  return false;
}

export async function detectPasskeyCapabilities() {
  const webauthn = isWebAuthnAvailable();
  const platformAuthenticator = webauthn ? await isPlatformAuthenticatorAvailable() : false;
  const prf = webauthn ? await probePasskeyPrfSupport() : false;

  return {
    webauthn,
    platformAuthenticator,
    prf,
    passkeyUnlockSupported: webauthn && platformAuthenticator && prf,
  };
}

export async function computePasskeyPrfSalt(vaultId, credentialId) {
  if (typeof vaultId !== "string" || !vaultId.trim()) {
    throw new Error("vault_id is required to compute passkey PRF salt.");
  }

  if (typeof credentialId !== "string" || !credentialId.trim()) {
    throw new Error("credential_id is required to compute passkey PRF salt.");
  }

  const digestHex = await sha256Hex(
    `${VAULT_PASSKEY_PRF_SALT_PREFIX}\n${vaultId.trim()}\n${credentialId.trim()}`
  );

  return hexToBytes(digestHex);
}

export async function normalizePasskeyWrapKey(prfOutput) {
  if (!(prfOutput instanceof ArrayBuffer) && !(prfOutput instanceof Uint8Array)) {
    throw new Error("Passkey PRF output must be an ArrayBuffer or Uint8Array.");
  }

  const bytes =
    prfOutput instanceof Uint8Array
      ? prfOutput
      : new Uint8Array(prfOutput.slice(0));

  if (bytes.length === VAULT_PASSKEY_WRAP_KEY_BYTES) {
    return new Uint8Array(bytes);
  }

  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(digest);
}

function assertPasskeyWrapKeyBytes(passkeyWrapKey) {
  if (!(passkeyWrapKey instanceof Uint8Array)) {
    throw new Error("Passkey wrap key must be a Uint8Array.");
  }

  if (passkeyWrapKey.length !== VAULT_PASSKEY_WRAP_KEY_BYTES) {
    throw new Error(`Passkey wrap key must be ${VAULT_PASSKEY_WRAP_KEY_BYTES} bytes.`);
  }
}

function assertSensitiveKeyBytes(keyBytes, label) {
  if (!(keyBytes instanceof Uint8Array) || keyBytes.length !== VAULT_MVK_BYTES) {
    throw new Error(`${label} must be a ${VAULT_MVK_BYTES}-byte Uint8Array.`);
  }
}

async function importAesGcmKey(rawKeyBytes) {
  return crypto.subtle.importKey("raw", rawKeyBytes, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

function validateEncryptedField(field, fieldName) {
  if (!field || typeof field !== "object") {
    throw new Error(`Passkey wrap record missing ${fieldName}.`);
  }

  for (const key of ["iv", "ciphertext"]) {
    if (typeof field[key] !== "string" || !field[key].trim()) {
      throw new Error(`Passkey wrap record missing ${fieldName}.${key}.`);
    }
  }

  return field;
}

export function validatePasskeyWrapRecord(record) {
  if (!record || typeof record !== "object") {
    throw new Error("Passkey wrap record is invalid.");
  }

  if (record.version !== VAULT_PASSKEY_WRAP_VERSION) {
    throw new Error("Unsupported passkey wrap version.");
  }

  if (record.wrap_method !== VAULT_PASSKEY_WRAP_METHOD) {
    throw new Error("Unsupported passkey wrap method.");
  }

  if (typeof record.vault_id !== "string" || !record.vault_id.trim()) {
    throw new Error("Passkey wrap record missing vault_id.");
  }

  if (typeof record.credential_id !== "string" || !record.credential_id.trim()) {
    throw new Error("Passkey wrap record missing credential_id.");
  }

  if (typeof record.prf_salt !== "string" || !record.prf_salt.trim()) {
    throw new Error("Passkey wrap record missing prf_salt.");
  }

  if (typeof record.enrolled_at !== "string" || !record.enrolled_at.trim()) {
    throw new Error("Passkey wrap record missing enrolled_at.");
  }

  validateEncryptedField(record.wrapped_mvk, "wrapped_mvk");
  validateEncryptedField(record.wrapped_legacy_pin_key, "wrapped_legacy_pin_key");

  return record;
}

async function encryptSensitiveField(keyBytes, passkeyWrapKey, additionalData) {
  assertSensitiveKeyBytes(keyBytes, "Sensitive key");
  assertPasskeyWrapKeyBytes(passkeyWrapKey);

  const iv = crypto.getRandomValues(new Uint8Array(VAULT_PASSKEY_WRAP_IV_BYTES));
  const aesKey = await importAesGcmKey(passkeyWrapKey);
  const ciphertextBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData,
    },
    aesKey,
    keyBytes
  );

  return {
    iv: bufferToBase64(iv.buffer),
    ciphertext: bufferToBase64(ciphertextBuffer),
  };
}

async function decryptSensitiveField(field, passkeyWrapKey, additionalData) {
  validateEncryptedField(field, "encrypted field");
  assertPasskeyWrapKeyBytes(passkeyWrapKey);

  const iv = base64ToBuffer(field.iv);
  const ciphertext = base64ToBuffer(field.ciphertext);

  try {
    const aesKey = await importAesGcmKey(passkeyWrapKey);
    const plaintextBuffer = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData,
      },
      aesKey,
      ciphertext
    );

    const keyBytes = new Uint8Array(plaintextBuffer);
    if (keyBytes.length !== VAULT_MVK_BYTES) {
      wipeSensitiveBytes(keyBytes);
      return null;
    }

    return keyBytes;
  } catch {
    return null;
  } finally {
    wipeSensitiveBytes(iv);
    wipeSensitiveBytes(ciphertext);
  }
}

export async function wrapMasterVaultKeyWithPasskeyKey(masterVaultKey, passkeyWrapKey) {
  assertSensitiveKeyBytes(masterVaultKey, "Master vault key");
  return encryptSensitiveField(masterVaultKey, passkeyWrapKey, MVK_PASSKEY_WRAP_AAD);
}

export async function unwrapMasterVaultKeyWithPasskeyKey(wrappedField, passkeyWrapKey) {
  return decryptSensitiveField(wrappedField, passkeyWrapKey, MVK_PASSKEY_WRAP_AAD);
}

export async function wrapLegacyPinKeyWithPasskeyKey(legacyPinKey, passkeyWrapKey) {
  assertSensitiveKeyBytes(legacyPinKey, "Legacy PIN key");
  return encryptSensitiveField(legacyPinKey, passkeyWrapKey, LEGACY_PASSKEY_WRAP_AAD);
}

export async function unwrapLegacyPinKeyWithPasskeyKey(wrappedField, passkeyWrapKey) {
  return decryptSensitiveField(wrappedField, passkeyWrapKey, LEGACY_PASSKEY_WRAP_AAD);
}

export async function buildPasskeyWrapRecord({
  vaultId,
  credentialId,
  masterVaultKey,
  legacyPinKey,
  passkeyWrapKey,
  prfSalt,
  enrolledAt,
}) {
  if (!(prfSalt instanceof Uint8Array) || prfSalt.length !== VAULT_PASSKEY_WRAP_KEY_BYTES) {
    throw new Error("Passkey PRF salt must be a 32-byte Uint8Array.");
  }

  const wrapped_mvk = await wrapMasterVaultKeyWithPasskeyKey(masterVaultKey, passkeyWrapKey);
  const wrapped_legacy_pin_key = await wrapLegacyPinKeyWithPasskeyKey(
    legacyPinKey,
    passkeyWrapKey
  );

  return validatePasskeyWrapRecord({
    version: VAULT_PASSKEY_WRAP_VERSION,
    wrap_method: VAULT_PASSKEY_WRAP_METHOD,
    vault_id: vaultId,
    credential_id: credentialId,
    prf_salt: bufferToBase64(prfSalt.buffer),
    wrapped_mvk,
    wrapped_legacy_pin_key,
    enrolled_at: enrolledAt || new Date().toISOString(),
  });
}

export async function unwrapVaultKeysFromPasskeyWrapRecord(record, passkeyWrapKey) {
  const validated = validatePasskeyWrapRecord(record);
  const masterVaultKey = await unwrapMasterVaultKeyWithPasskeyKey(
    validated.wrapped_mvk,
    passkeyWrapKey
  );
  const legacyPinKey = await unwrapLegacyPinKeyWithPasskeyKey(
    validated.wrapped_legacy_pin_key,
    passkeyWrapKey
  );

  if (!masterVaultKey || !legacyPinKey) {
    if (masterVaultKey) wipeSensitiveBytes(masterVaultKey);
    if (legacyPinKey) wipeSensitiveBytes(legacyPinKey);
    return null;
  }

  return {
    masterVaultKey,
    legacyPinKey,
  };
}

export function exportPasskeyWrapRecord(record) {
  return JSON.stringify(validatePasskeyWrapRecord(record));
}

export function importPasskeyWrapRecord(serialized) {
  if (typeof serialized !== "string" || !serialized.trim()) {
    throw new Error("Passkey wrap export must be a non-empty string.");
  }

  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error("Passkey wrap export is not valid JSON.");
  }

  return validatePasskeyWrapRecord(parsed);
}

export function clearPasskeySensitiveState(...values) {
  for (const value of values) {
    clearBytes(value);
  }
}

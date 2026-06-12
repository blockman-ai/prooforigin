export const VAULT_PIN_STORAGE_KEY = "prooforigin_vault_pin_v1";
export const VAULT_PIN_MIN_LENGTH = 6;
export const PBKDF2_ITERATIONS = 120_000;

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
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

function normalizePin(pin) {
  return String(pin || "").replace(/\D/g, "");
}

export function isValidPinFormat(pin) {
  const normalized = normalizePin(pin);
  return normalized.length >= VAULT_PIN_MIN_LENGTH && /^\d+$/.test(normalized);
}

export function readPinRecord() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(VAULT_PIN_STORAGE_KEY);
    if (!raw) return null;
    const record = JSON.parse(raw);
    if (!record?.salt || !record?.hash) return null;
    return record;
  } catch {
    return null;
  }
}

export function hasVaultPinConfigured() {
  return Boolean(readPinRecord());
}

export function getVaultPinSalt() {
  const record = readPinRecord();
  return record?.salt || null;
}

export async function deriveVaultPinMasterKeyBytes(pin, saltBuffer) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(normalizePin(pin)),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  return new Uint8Array(derived);
}

async function derivePinHash(pin, saltBuffer) {
  const masterKeyBytes = await deriveVaultPinMasterKeyBytes(pin, saltBuffer);
  const encoded = bufferToBase64(masterKeyBytes.buffer);
  masterKeyBytes.fill(0);
  return encoded;
}

export async function setupVaultPin(pin) {
  if (!isValidPinFormat(pin)) {
    throw new Error(`PIN must be at least ${VAULT_PIN_MIN_LENGTH} digits.`);
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePinHash(pin, salt.buffer);

  const record = {
    salt: bufferToBase64(salt.buffer),
    hash,
    iterations: PBKDF2_ITERATIONS,
    created_at: new Date().toISOString(),
  };

  window.localStorage.setItem(VAULT_PIN_STORAGE_KEY, JSON.stringify(record));
  return record;
}

export async function verifyVaultPin(pin) {
  const record = readPinRecord();
  if (!record) {
    throw new Error("No vault PIN configured yet.");
  }

  if (!isValidPinFormat(pin)) {
    return false;
  }

  const hash = await derivePinHash(pin, base64ToBuffer(record.salt));
  return hash === record.hash;
}

export async function verifyVaultPinAndDeriveMasterKey(pin) {
  const record = readPinRecord();
  if (!record) {
    throw new Error("No vault PIN configured yet.");
  }

  if (!isValidPinFormat(pin)) {
    return null;
  }

  const masterKey = await deriveVaultPinMasterKeyBytes(pin, base64ToBuffer(record.salt));
  const hash = bufferToBase64(masterKey.buffer);

  if (hash !== record.hash) {
    masterKey.fill(0);
    return null;
  }

  return masterKey;
}

export function clearVaultPinRecord() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(VAULT_PIN_STORAGE_KEY);
}

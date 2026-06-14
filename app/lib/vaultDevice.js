import { sha256Hex } from "./vaultCrypto.js";

export const VAULT_DEVICE_STORAGE_KEY = "prooforigin_vault_device_v1";
export const VAULT_DEVICE_REGISTERED_KEY = "prooforigin_vault_device_registered_v1";
export const VAULT_AUTH_SECRET_BYTES = 32;
export const VAULT_SIGNATURE_SKEW_MS = 5 * 60 * 1000;

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

function hexToBuffer(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function readDeviceRecord() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(VAULT_DEVICE_STORAGE_KEY);
    if (!raw) return null;

    const record = JSON.parse(raw);
    if (!record?.vault_device_id || !record?.vault_auth_secret) {
      return null;
    }

    return record;
  } catch {
    return null;
  }
}

function writeDeviceRecord(record) {
  window.localStorage.setItem(VAULT_DEVICE_STORAGE_KEY, JSON.stringify(record));
}

export function getVaultDevice() {
  const record = readDeviceRecord();
  if (!record) return null;

  return {
    vault_device_id: record.vault_device_id,
    vault_auth_secret: record.vault_auth_secret,
    created_at: record.created_at || null,
  };
}

export function ensureVaultDevice() {
  const existing = getVaultDevice();
  if (existing) {
    return existing;
  }

  const secretBytes = crypto.getRandomValues(new Uint8Array(VAULT_AUTH_SECRET_BYTES));
  const record = {
    vault_device_id: crypto.randomUUID(),
    vault_auth_secret: bufferToBase64(secretBytes.buffer),
    created_at: new Date().toISOString(),
  };

  writeDeviceRecord(record);
  secretBytes.fill(0);

  return {
    vault_device_id: record.vault_device_id,
    vault_auth_secret: record.vault_auth_secret,
    created_at: record.created_at,
  };
}

export async function computeVaultAuthSecretHash(vaultAuthSecretBase64) {
  const secretBytes = base64ToBuffer(vaultAuthSecretBase64);
  const hash = await sha256Hex(secretBytes);
  secretBytes.fill(0);
  return hash;
}

export function isVaultDeviceRegisteredLocally() {
  const device = getVaultDevice();
  if (!device) return false;

  try {
    return window.localStorage.getItem(VAULT_DEVICE_REGISTERED_KEY) === device.vault_device_id;
  } catch {
    return false;
  }
}

export function markVaultDeviceRegisteredLocally(vaultDeviceId) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(VAULT_DEVICE_REGISTERED_KEY, vaultDeviceId);
}

export function clearVaultDeviceRegisteredLocally() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(VAULT_DEVICE_REGISTERED_KEY);
}

/** Clear local vault device identity so restore targets register a fresh device on unlock. */
export function clearVaultDeviceIdentity() {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem(VAULT_DEVICE_STORAGE_KEY);
  clearVaultDeviceRegisteredLocally();
}

export async function registerVaultDeviceWithServer() {
  const device = ensureVaultDevice();
  const authSecretHash = await computeVaultAuthSecretHash(device.vault_auth_secret);

  const response = await fetch("/api/vault/register-device", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      vault_device_id: device.vault_device_id,
      auth_secret_hash: authSecretHash,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    if (response.status === 409 && data.code === "DEVICE_ALREADY_REGISTERED") {
      markVaultDeviceRegisteredLocally(device.vault_device_id);
      return {
        vault_device_id: device.vault_device_id,
        device_public_id: data.registration?.device_public_id || null,
        already_registered: true,
      };
    }
    throw new Error(data.error || "Unable to register vault device.");
  }

  markVaultDeviceRegisteredLocally(device.vault_device_id);
  return data.registration;
}

export async function hashVaultBody(input) {
  if (input == null || input === "") {
    return sha256Hex("");
  }

  if (typeof input === "string") {
    return sha256Hex(input);
  }

  if (input instanceof ArrayBuffer) {
    return sha256Hex(input);
  }

  if (ArrayBuffer.isView(input)) {
    return sha256Hex(
      input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength)
    );
  }

  return sha256Hex(JSON.stringify(input));
}

export function buildVaultSignaturePayload({ method, path, bodyHash, timestamp, nonce }) {
  return `${String(method).toUpperCase()}|${path}|${String(timestamp)}|${bodyHash}|${String(nonce)}`;
}

async function deriveVaultSigningKey(secretBase64) {
  const secretBytes = base64ToBuffer(secretBase64);
  const authSecretHash = await sha256Hex(secretBytes);
  secretBytes.fill(0);
  return hexToBuffer(authSecretHash);
}

export async function signVaultRequest({ method, path, bodyHash, timestamp, nonce }) {
  const device = ensureVaultDevice();
  const signingKeyBytes = await deriveVaultSigningKey(device.vault_auth_secret);
  const payload = buildVaultSignaturePayload({ method, path, bodyHash, timestamp, nonce });

  const hmacKey = await crypto.subtle.importKey(
    "raw",
    signingKeyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    hmacKey,
    new TextEncoder().encode(payload)
  );

  signingKeyBytes.fill(0);

  const signature = Array.from(new Uint8Array(signatureBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return {
    vault_device_id: device.vault_device_id,
    timestamp,
    signature,
  };
}

export function buildVaultAuthHeaders({ bodyHash, timestamp, signature, vaultDeviceId, nonce }) {
  return {
    "x-prooforigin-vault-device-id": vaultDeviceId,
    "x-prooforigin-vault-timestamp": String(timestamp),
    "x-prooforigin-vault-body-hash": bodyHash,
    "x-prooforigin-vault-signature": signature,
    "x-prooforigin-vault-nonce": nonce,
  };
}

export async function createSignedVaultAuthHeaders({ method, path, body = "" }) {
  const bodyHash = await hashVaultBody(body);
  const timestamp = Date.now();
  const nonce = crypto.randomUUID();
  const signed = await signVaultRequest({ method, path, bodyHash, timestamp, nonce });

  return buildVaultAuthHeaders({
    bodyHash,
    timestamp,
    signature: signed.signature,
    vaultDeviceId: signed.vault_device_id,
    nonce,
  });
}

export function isVaultTimestampValid(timestamp, now = Date.now()) {
  const value = Number(timestamp);
  if (!Number.isFinite(value)) return false;
  return Math.abs(now - value) <= VAULT_SIGNATURE_SKEW_MS;
}

import { sha256Hex } from "./vaultCrypto";

export const VAULT_DEVICE_STORAGE_KEY = "prooforigin_vault_device_v1";
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

function buildSignaturePayload({ method, path, bodyHash, timestamp }) {
  return `${String(method).toUpperCase()}|${path}|${String(timestamp)}|${bodyHash}`;
}

export async function signVaultRequest({ method, path, bodyHash, timestamp }) {
  const device = ensureVaultDevice();
  const secretBytes = base64ToBuffer(device.vault_auth_secret);
  const payload = buildSignaturePayload({ method, path, bodyHash, timestamp });

  const hmacKey = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    hmacKey,
    new TextEncoder().encode(payload)
  );

  secretBytes.fill(0);

  const signature = Array.from(new Uint8Array(signatureBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return {
    vault_device_id: device.vault_device_id,
    timestamp,
    signature,
  };
}

export function buildVaultAuthHeaders({ method, path, bodyHash, timestamp, signature, vaultDeviceId }) {
  return {
    Authorization: `Vault device_id=${vaultDeviceId}, ts=${timestamp}, sig=${signature}`,
    "X-Vault-Device-Id": vaultDeviceId,
    "X-Vault-Timestamp": String(timestamp),
    "X-Vault-Signature": signature,
    "X-Vault-Method": String(method).toUpperCase(),
    "X-Vault-Path": path,
    "X-Vault-Body-Hash": bodyHash,
  };
}

export async function createSignedVaultAuthHeaders({ method, path, body = "" }) {
  const bodyHash = await hashVaultBody(body);
  const timestamp = Date.now();
  const signed = await signVaultRequest({ method, path, bodyHash, timestamp });

  return buildVaultAuthHeaders({
    method,
    path,
    bodyHash,
    timestamp,
    signature: signed.signature,
    vaultDeviceId: signed.vault_device_id,
  });
}

export function isVaultTimestampValid(timestamp, now = Date.now()) {
  const value = Number(timestamp);
  if (!Number.isFinite(value)) return false;
  return Math.abs(now - value) <= VAULT_SIGNATURE_SKEW_MS;
}

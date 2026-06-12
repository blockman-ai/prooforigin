import { createSignedVaultAuthHeaders, getVaultDevice } from "./vaultDevice";
import {
  clearBytes,
  deriveVaultDocumentKey,
  encryptVaultBytes,
  sha256Hex,
} from "./vaultCrypto";

export const VAULT_ENCRYPTION_VERSION = 1;

export const VAULT_MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const VAULT_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];
export const VAULT_ALLOWED_EXTENSIONS = ".pdf,.jpg,.jpeg,.png,.webp";

function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function buildDocumentAad(vaultDeviceId, docId, contentType) {
  return `${vaultDeviceId}|${docId}|${contentType}`;
}

function buildLabelAad(vaultDeviceId, docId) {
  return `${vaultDeviceId}|${docId}|label-v1`;
}

export function isAllowedVaultDocumentFile(file) {
  if (!file) return false;
  if (file.size <= 0 || file.size > VAULT_MAX_DOCUMENT_BYTES) return false;
  return VAULT_ALLOWED_MIME_TYPES.includes(file.type);
}

export function formatVaultDocumentSize(bytes) {
  if (!Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function vaultSignedFetch({ method, path, body = "" }) {
  const headers = await createSignedVaultAuthHeaders({ method, path, body });
  const init = {
    method,
    headers: {
      ...headers,
      ...(body && method !== "GET" ? { "Content-Type": "application/json" } : {}),
    },
  };

  if (body && method !== "GET") {
    init.body = body;
  }

  const response = await fetch(path, init);
  const data = await response.json().catch(() => ({}));

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

export async function fetchVaultDocumentMetadata() {
  return vaultSignedFetch({
    method: "GET",
    path: "/api/vault/document",
  });
}

export async function requestVaultUploadUrl() {
  return vaultSignedFetch({
    method: "POST",
    path: "/api/vault/document/upload-url",
    body: "{}",
  });
}

export async function completeVaultDocumentUpload(payload) {
  return vaultSignedFetch({
    method: "POST",
    path: "/api/vault/document/complete",
    body: JSON.stringify(payload),
  });
}

export async function uploadEncryptedVaultDocument({ file, label, masterKey }) {
  if (!isAllowedVaultDocumentFile(file)) {
    throw new Error("Choose a PDF, JPG, PNG, or WebP file up to 10 MB.");
  }

  const device = getVaultDevice();
  if (!device?.vault_device_id) {
    throw new Error("Vault device is not initialized.");
  }

  const uploadUrlResponse = await requestVaultUploadUrl();
  if (!uploadUrlResponse.ok) {
    if (uploadUrlResponse.data?.code === "SLOT_OCCUPIED") {
      throw new Error("This vault already holds one encrypted document.");
    }
    throw new Error(uploadUrlResponse.data?.error || "Unable to prepare vault upload.");
  }

  const { doc_id: docId, storage_path: storagePath, signedUrl } = uploadUrlResponse.data;
  if (!docId || !storagePath || !signedUrl) {
    throw new Error("Vault upload URL response was incomplete.");
  }

  const fileBytes = new Uint8Array(await file.arrayBuffer());
  const documentKey = await deriveVaultDocumentKey(masterKey);
  const documentAad = buildDocumentAad(device.vault_device_id, docId, file.type);

  const encrypted = await encryptVaultBytes(fileBytes, documentKey, documentAad);
  clearBytes(fileBytes);

  const ciphertextPayload = new Uint8Array(encrypted.iv.length + encrypted.ciphertext.length);
  ciphertextPayload.set(encrypted.iv, 0);
  ciphertextPayload.set(encrypted.ciphertext, encrypted.iv.length);

  const ciphertextSha256 = await sha256Hex(ciphertextPayload);

  const ciphertextBytes = ciphertextPayload.length;

  const uploadResponse = await fetch(signedUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/octet-stream",
    },
    body: ciphertextPayload,
  });

  clearBytes(ciphertextPayload);
  clearBytes(encrypted.ciphertext);

  if (!uploadResponse.ok) {
    throw new Error("Encrypted upload to vault storage failed.");
  }

  let labelCiphertext = null;
  let labelIv = null;

  if (label?.trim()) {
    const labelBytes = new TextEncoder().encode(label.trim());
    const labelEncrypted = await encryptVaultBytes(
      labelBytes,
      documentKey,
      buildLabelAad(device.vault_device_id, docId)
    );
    labelCiphertext = bytesToBase64(labelEncrypted.ciphertext);
    labelIv = bytesToBase64(labelEncrypted.iv);
    clearBytes(labelBytes);
    clearBytes(labelEncrypted.ciphertext);
  }

  const completeResponse = await completeVaultDocumentUpload({
    doc_id: docId,
    storage_path: storagePath,
    ciphertext_sha256: ciphertextSha256,
    ciphertext_bytes: ciphertextBytes,
    content_type_hint: file.type,
    label_ciphertext: labelCiphertext,
    label_iv: labelIv,
    encryption_version: VAULT_ENCRYPTION_VERSION,
  });

  if (!completeResponse.ok) {
    if (completeResponse.data?.code === "SLOT_OCCUPIED") {
      throw new Error("This vault already holds one encrypted document.");
    }
    throw new Error(completeResponse.data?.error || "Unable to finalize vault document.");
  }

  return {
    document: completeResponse.data.document,
    displayLabel: label?.trim() || null,
  };
}

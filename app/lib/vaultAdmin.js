import { createClient } from "@supabase/supabase-js";

export const VAULT_DOCUMENTS_TABLE = "vault_documents";
export const VAULT_STORAGE_BUCKET = "vault-documents";
export const VAULT_ENCRYPTION_VERSION = 1;
export const VAULT_SIGNED_URL_TTL_SECONDS = 120;

let vaultAdminClient = null;

export function isVaultAdminConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  return Boolean(
    url &&
      key &&
      /^https?:\/\//i.test(url) &&
      !url.includes("YOUR_") &&
      !key.includes("YOUR_")
  );
}

export function createVaultAdminClient() {
  if (!vaultAdminClient) {
    if (!isVaultAdminConfigured()) {
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for vault admin."
      );
    }

    vaultAdminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );
  }

  return vaultAdminClient;
}

export function buildVaultDocumentStoragePath(vaultDeviceId, docId) {
  return `${vaultDeviceId}/${docId}.enc`;
}

function mapVaultDocumentRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    vault_device_id: row.vault_device_id,
    storage_path: row.storage_path,
    ciphertext_sha256: row.ciphertext_sha256,
    ciphertext_bytes: row.ciphertext_bytes,
    content_type_hint: row.content_type_hint,
    encryption_version: row.encryption_version,
    label_present: Boolean(row.label_ciphertext),
    compromised_at: row.compromised_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
  };
}

export async function getVaultDocumentByDevice(vaultDeviceId) {
  const supabase = createVaultAdminClient();
  const { data, error } = await supabase
    .from(VAULT_DOCUMENTS_TABLE)
    .select(
      "id, vault_device_id, storage_path, ciphertext_sha256, ciphertext_bytes, content_type_hint, label_ciphertext, encryption_version, compromised_at, created_at, updated_at, deleted_at"
    )
    .eq("vault_device_id", vaultDeviceId)
    .is("deleted_at", null)
    .maybeSingle();

  return {
    document: mapVaultDocumentRow(data),
    error,
  };
}

export async function createVaultSignedUploadUrl(vaultDeviceId, docId) {
  const supabase = createVaultAdminClient();
  const storagePath = buildVaultDocumentStoragePath(vaultDeviceId, docId);

  const { data, error } = await supabase.storage
    .from(VAULT_STORAGE_BUCKET)
    .createSignedUploadUrl(storagePath);

  return {
    doc_id: docId,
    storage_path: storagePath,
    signedUrl: data?.signedUrl || null,
    token: data?.token || null,
    error,
  };
}

export async function createVaultSignedDownloadUrl(storagePath) {
  const supabase = createVaultAdminClient();
  const { data, error } = await supabase.storage
    .from(VAULT_STORAGE_BUCKET)
    .createSignedUrl(storagePath, VAULT_SIGNED_URL_TTL_SECONDS);

  return {
    signedUrl: data?.signedUrl || null,
    expiresIn: VAULT_SIGNED_URL_TTL_SECONDS,
    error,
  };
}

export async function completeVaultDocument({
  vaultDeviceId,
  docId,
  storagePath,
  ciphertextSha256,
  ciphertextBytes,
  contentTypeHint,
  labelCiphertext = null,
  labelIv = null,
  encryptionVersion = VAULT_ENCRYPTION_VERSION,
}) {
  const supabase = createVaultAdminClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from(VAULT_DOCUMENTS_TABLE)
    .insert({
      id: docId,
      vault_device_id: vaultDeviceId,
      storage_path: storagePath,
      ciphertext_sha256: ciphertextSha256,
      ciphertext_bytes: ciphertextBytes,
      content_type_hint: contentTypeHint,
      label_ciphertext: labelCiphertext,
      label_iv: labelIv,
      encryption_version: encryptionVersion,
      created_at: now,
      updated_at: now,
    })
    .select(
      "id, vault_device_id, storage_path, ciphertext_sha256, ciphertext_bytes, content_type_hint, label_ciphertext, encryption_version, compromised_at, created_at, updated_at, deleted_at"
    )
    .single();

  return {
    document: mapVaultDocumentRow(data),
    error,
  };
}

export async function deleteVaultDocument(vaultDeviceId) {
  const supabase = createVaultAdminClient();
  const { document, error: lookupError } = await getVaultDocumentByDevice(vaultDeviceId);

  if (lookupError) {
    return { document: null, error: lookupError };
  }

  if (!document) {
    return { document: null, error: null, notFound: true };
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from(VAULT_DOCUMENTS_TABLE)
    .update({
      deleted_at: now,
      updated_at: now,
    })
    .eq("id", document.id)
    .eq("vault_device_id", vaultDeviceId)
    .is("deleted_at", null);

  if (updateError) {
    return { document: null, error: updateError };
  }

  const { error: storageError } = await supabase.storage
    .from(VAULT_STORAGE_BUCKET)
    .remove([document.storage_path]);

  return {
    document,
    storageError,
    error: null,
  };
}

export async function markVaultDocumentCompromised(vaultDeviceId) {
  const supabase = createVaultAdminClient();
  const { document, error: lookupError } = await getVaultDocumentByDevice(vaultDeviceId);

  if (lookupError) {
    return { document: null, error: lookupError };
  }

  if (!document) {
    return { document: null, error: null, notFound: true };
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(VAULT_DOCUMENTS_TABLE)
    .update({
      compromised_at: now,
      updated_at: now,
    })
    .eq("id", document.id)
    .eq("vault_device_id", vaultDeviceId)
    .is("deleted_at", null)
    .select(
      "id, vault_device_id, storage_path, ciphertext_sha256, ciphertext_bytes, content_type_hint, label_ciphertext, encryption_version, compromised_at, created_at, updated_at, deleted_at"
    )
    .single();

  return {
    document: mapVaultDocumentRow(data),
    error,
  };
}

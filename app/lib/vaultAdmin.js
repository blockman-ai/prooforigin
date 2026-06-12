import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const VAULT_DOCUMENTS_TABLE = "vault_documents";
export const VAULT_DEVICE_REGISTRATIONS_TABLE = "vault_device_registrations";
export const VAULT_STORAGE_BUCKET = "vault-documents";
export const VAULT_ENCRYPTION_VERSION = 1;
export const VAULT_SIGNED_URL_TTL_SECONDS = 120;
export const VAULT_MAX_CIPHERTEXT_BYTES = 10 * 1024 * 1024;

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

export function buildDevicePublicId(vaultDeviceId) {
  const compact = String(vaultDeviceId).replace(/-/g, "").slice(0, 16);
  return `vdp_${compact}`;
}

function mapVaultDeviceRegistrationRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    vault_device_id: row.vault_device_id,
    device_public_id: row.device_public_id,
    auth_secret_hash: row.auth_secret_hash,
    created_at: row.created_at,
    last_seen_at: row.last_seen_at,
    revoked_at: row.revoked_at,
    metadata: row.metadata || {},
  };
}

export async function getVaultDeviceRegistration(vaultDeviceId) {
  const supabase = createVaultAdminClient();
  const { data, error } = await supabase
    .from(VAULT_DEVICE_REGISTRATIONS_TABLE)
    .select(
      "id, vault_device_id, device_public_id, auth_secret_hash, created_at, last_seen_at, revoked_at, metadata"
    )
    .eq("vault_device_id", vaultDeviceId)
    .is("revoked_at", null)
    .maybeSingle();

  return {
    registration: mapVaultDeviceRegistrationRow(data),
    error,
  };
}

export async function vaultDeviceRegistered(vaultDeviceId) {
  const { registration, error } = await getVaultDeviceRegistration(vaultDeviceId);
  if (error) {
    throw error;
  }
  return Boolean(registration);
}

export async function registerVaultDevice({
  vaultDeviceId,
  authSecretHash,
  metadata = {},
}) {
  const supabase = createVaultAdminClient();
  const now = new Date().toISOString();
  const devicePublicId = buildDevicePublicId(vaultDeviceId);

  const { data, error } = await supabase
    .from(VAULT_DEVICE_REGISTRATIONS_TABLE)
    .insert({
      vault_device_id: vaultDeviceId,
      device_public_id: devicePublicId,
      auth_secret_hash: authSecretHash,
      created_at: now,
      last_seen_at: now,
      metadata,
    })
    .select(
      "id, vault_device_id, device_public_id, auth_secret_hash, created_at, last_seen_at, revoked_at, metadata"
    )
    .single();

  return {
    registration: mapVaultDeviceRegistrationRow(data),
    error,
  };
}

export async function touchVaultDeviceLastSeen(vaultDeviceId) {
  const supabase = createVaultAdminClient();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from(VAULT_DEVICE_REGISTRATIONS_TABLE)
    .update({ last_seen_at: now })
    .eq("vault_device_id", vaultDeviceId)
    .is("revoked_at", null);

  return { error };
}

export async function revokeVaultDevice(vaultDeviceId) {
  const supabase = createVaultAdminClient();
  const { registration, error: lookupError } = await getVaultDeviceRegistration(vaultDeviceId);

  if (lookupError) {
    return { registration: null, error: lookupError };
  }

  if (!registration) {
    return { registration: null, error: null, notFound: true };
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(VAULT_DEVICE_REGISTRATIONS_TABLE)
    .update({ revoked_at: now })
    .eq("id", registration.id)
    .eq("vault_device_id", vaultDeviceId)
    .is("revoked_at", null)
    .select(
      "id, vault_device_id, device_public_id, auth_secret_hash, created_at, last_seen_at, revoked_at, metadata"
    )
    .single();

  return {
    registration: mapVaultDeviceRegistrationRow(data),
    error,
  };
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
  const storagePath = buildVaultDocumentStoragePath(vaultDeviceId, docId);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      doc_id: docId,
      storage_path: storagePath,
      signedUrl: null,
      token: null,
      error: new Error("Vault storage credentials are not configured."),
    };
  }

  const encodedPath = storagePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const signPath = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/upload/sign/${encodedPath}`;

  try {
    const response = await fetch(signPath, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expiresIn: VAULT_SIGNED_URL_TTL_SECONDS,
      }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return createVaultSignedUploadUrlFallback(vaultDeviceId, docId, storagePath, payload);
    }

    const signedPath = payload?.url || payload?.signedURL || payload?.signedUrl;
    if (!signedPath) {
      return createVaultSignedUploadUrlFallback(vaultDeviceId, docId, storagePath, payload);
    }

    const signedUrl = signedPath.startsWith("http")
      ? signedPath
      : `${supabaseUrl.replace(/\/$/, "")}/storage/v1${signedPath.startsWith("/") ? signedPath : `/${signedPath}`}`;

    const token = new URL(signedUrl).searchParams.get("token");

    return {
      doc_id: docId,
      storage_path: storagePath,
      signedUrl,
      token,
      expiresIn: VAULT_SIGNED_URL_TTL_SECONDS,
      error: null,
    };
  } catch (error) {
    return createVaultSignedUploadUrlFallback(vaultDeviceId, docId, storagePath, error);
  }
}

async function createVaultSignedUploadUrlFallback(vaultDeviceId, docId, storagePath, cause) {
  const supabase = createVaultAdminClient();
  const { data, error } = await supabase.storage
    .from(VAULT_STORAGE_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data?.signedUrl) {
    return {
      doc_id: docId,
      storage_path: storagePath,
      signedUrl: null,
      token: null,
      error: error || cause || new Error("Unable to create vault upload URL."),
    };
  }

  return {
    doc_id: docId,
    storage_path: storagePath,
    signedUrl: data.signedUrl,
    token: data.token || null,
    expiresIn: VAULT_SIGNED_URL_TTL_SECONDS,
    error: null,
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

export async function verifyVaultCiphertextObject({
  storagePath,
  expectedSha256,
  expectedBytes,
}) {
  const supabase = createVaultAdminClient();
  const { data, error } = await supabase.storage.from(VAULT_STORAGE_BUCKET).download(storagePath);

  if (error || !data) {
    return {
      ok: false,
      code: "STORAGE_OBJECT_NOT_FOUND",
      error: error?.message || "Encrypted vault object was not found in storage.",
    };
  }

  const buffer = Buffer.from(await data.arrayBuffer());

  if (buffer.length !== expectedBytes) {
    return {
      ok: false,
      code: "STORAGE_SIZE_MISMATCH",
      error: "Encrypted vault object size does not match the declared ciphertext_bytes value.",
      actualBytes: buffer.length,
    };
  }

  if (buffer.length <= 0 || buffer.length > VAULT_MAX_CIPHERTEXT_BYTES) {
    return {
      ok: false,
      code: "STORAGE_SIZE_INVALID",
      error: "Encrypted vault object size is outside the allowed vault limits.",
      actualBytes: buffer.length,
    };
  }

  const actualSha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  if (actualSha256 !== String(expectedSha256).toLowerCase()) {
    return {
      ok: false,
      code: "STORAGE_HASH_MISMATCH",
      error: "Encrypted vault object hash does not match the declared ciphertext_sha256 value.",
    };
  }

  return {
    ok: true,
    actualBytes: buffer.length,
    actualSha256,
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

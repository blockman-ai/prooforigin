import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const VAULT_DOCUMENTS_TABLE = "vault_documents";
export const VAULT_DEVICE_REGISTRATIONS_TABLE = "vault_device_registrations";
export const VAULT_REQUEST_NONCES_TABLE = "vault_request_nonces";
export const VAULT_OWNERSHIP_KEYS_TABLE = "vault_ownership_keys";
export const VAULT_OWNERSHIP_VERIFICATIONS_TABLE = "vault_ownership_verifications";
export const VAULT_DOCUMENT_MIGRATIONS_TABLE = "vault_document_migrations";
export const VAULT_STORAGE_BUCKET = "vault-documents";
export const VAULT_ENCRYPTION_VERSION_LEGACY = 1;
export const VAULT_ENCRYPTION_VERSION_MVK = 2;
export const VAULT_ALLOWED_ENCRYPTION_VERSIONS = [1, 2];
export const VAULT_DOCUMENT_AAD_VERSION_LEGACY = 1;
export const VAULT_DOCUMENT_AAD_VERSION_VAULT_SCOPED = 3;
export const VAULT_ALLOWED_AAD_VERSIONS = [
  VAULT_DOCUMENT_AAD_VERSION_LEGACY,
  VAULT_DOCUMENT_AAD_VERSION_VAULT_SCOPED,
];
export const VAULT_OWNERSHIP_KEY_ALGORITHM = "ECDSA-P256-SHA256";
export const VAULT_OWNERSHIP_VERIFICATION_STATUS_VERIFIED = "verified";
/** @deprecated Use VAULT_ENCRYPTION_VERSION_LEGACY */
export const VAULT_ENCRYPTION_VERSION = VAULT_ENCRYPTION_VERSION_LEGACY;
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
    vault_id: row.vault_id || null,
    vault_id_bound_at: row.vault_id_bound_at || null,
    vault_ownership_proof_metadata: row.vault_ownership_proof_metadata || {},
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
      "id, vault_device_id, device_public_id, auth_secret_hash, vault_id, vault_id_bound_at, vault_ownership_proof_metadata, created_at, last_seen_at, revoked_at, metadata"
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
  vaultId = null,
  vaultIdBoundAt = null,
  vaultOwnershipProofMetadata = {},
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
      vault_id: vaultId,
      vault_id_bound_at: vaultIdBoundAt,
      vault_ownership_proof_metadata: vaultOwnershipProofMetadata,
      created_at: now,
      last_seen_at: now,
      metadata,
    })
    .select(
      "id, vault_device_id, device_public_id, auth_secret_hash, vault_id, vault_id_bound_at, vault_ownership_proof_metadata, created_at, last_seen_at, revoked_at, metadata"
    )
    .single();

  return {
    registration: mapVaultDeviceRegistrationRow(data),
    error,
  };
}

export async function bindVaultDeviceToVault({
  vaultDeviceId,
  vaultId,
  vaultOwnershipProofMetadata = {},
  vaultIdBoundAt = new Date().toISOString(),
}) {
  const supabase = createVaultAdminClient();
  const { data, error } = await supabase
    .from(VAULT_DEVICE_REGISTRATIONS_TABLE)
    .update({
      vault_id: vaultId,
      vault_id_bound_at: vaultIdBoundAt,
      vault_ownership_proof_metadata: vaultOwnershipProofMetadata,
    })
    .eq("vault_device_id", vaultDeviceId)
    .is("revoked_at", null)
    .select(
      "id, vault_device_id, device_public_id, auth_secret_hash, vault_id, vault_id_bound_at, vault_ownership_proof_metadata, created_at, last_seen_at, revoked_at, metadata"
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

function mapVaultDocumentRow(row, { includeLabelEnvelope = false } = {}) {
  if (!row) return null;

  const document = {
    id: row.id,
    vault_device_id: row.vault_device_id,
    vault_id: row.vault_id || null,
    aad_version: row.aad_version ?? VAULT_DOCUMENT_AAD_VERSION_LEGACY,
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

  if (includeLabelEnvelope) {
    document.label_ciphertext = row.label_ciphertext || null;
    document.label_iv = row.label_iv || null;
  }

  return document;
}

function mapVaultDiscoveryDocumentRow(row) {
  if (!row) return null;

  return {
    document_id: row.id,
    aad_version: row.aad_version ?? VAULT_DOCUMENT_AAD_VERSION_LEGACY,
    encryption_version: row.encryption_version,
    label_present: Boolean(row.label_ciphertext),
    created_at: row.created_at,
    updated_at: row.updated_at,
    blocker_codes: [],
  };
}

export async function getVaultDocumentByDevice(vaultDeviceId) {
  const supabase = createVaultAdminClient();
  const { data, error } = await supabase
    .from(VAULT_DOCUMENTS_TABLE)
    .select(
      "id, vault_device_id, vault_id, aad_version, storage_path, ciphertext_sha256, ciphertext_bytes, content_type_hint, label_ciphertext, encryption_version, compromised_at, created_at, updated_at, deleted_at"
    )
    .eq("vault_device_id", vaultDeviceId)
    .is("deleted_at", null)
    .maybeSingle();

  return {
    document: mapVaultDocumentRow(data),
    error,
  };
}

export async function getVaultDocumentById(documentId, { includeLabelEnvelope = false } = {}) {
  const supabase = createVaultAdminClient();
  const labelFields = includeLabelEnvelope ? ", label_iv" : "";
  const { data, error } = await supabase
    .from(VAULT_DOCUMENTS_TABLE)
    .select(
      `id, vault_device_id, vault_id, aad_version, storage_path, ciphertext_sha256, ciphertext_bytes, content_type_hint, label_ciphertext${labelFields}, encryption_version, compromised_at, created_at, updated_at, deleted_at`
    )
    .eq("id", documentId)
    .maybeSingle();

  return {
    document: mapVaultDocumentRow(data, { includeLabelEnvelope }),
    error,
  };
}

export async function getBoundVaultDeviceRegistration(vaultDeviceId) {
  const supabase = createVaultAdminClient();
  const { data, error } = await supabase
    .from(VAULT_DEVICE_REGISTRATIONS_TABLE)
    .select(
      "id, vault_device_id, device_public_id, auth_secret_hash, vault_id, vault_id_bound_at, vault_ownership_proof_metadata, created_at, last_seen_at, revoked_at, metadata"
    )
    .eq("vault_device_id", vaultDeviceId)
    .is("revoked_at", null)
    .not("vault_id", "is", null)
    .maybeSingle();

  return {
    registration: mapVaultDeviceRegistrationRow(data),
    error,
  };
}

export async function listVaultDiscoveryDocuments(vaultId) {
  const supabase = createVaultAdminClient();
  const { data, error } = await supabase
    .from(VAULT_DOCUMENTS_TABLE)
    .select("id, aad_version, encryption_version, label_ciphertext, created_at, updated_at")
    .eq("vault_id", vaultId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return {
    documents: (data || []).map(mapVaultDiscoveryDocumentRow),
    error,
  };
}

export async function countLegacyUnboundVaultDocuments(vaultId) {
  const supabase = createVaultAdminClient();
  const { data, error } = await supabase
    .from(VAULT_DOCUMENTS_TABLE)
    .select("id, vault_device_id")
    .is("deleted_at", null)
    .is("vault_id", null);

  if (error) {
    return { count: 0, error };
  }

  const sourceDeviceIds = Array.from(
    new Set((data || []).map((row) => row?.vault_device_id).filter(Boolean))
  );
  if (sourceDeviceIds.length === 0) {
    return { count: 0, error: null };
  }

  const { data: registrations, error: registrationError } = await supabase
    .from(VAULT_DEVICE_REGISTRATIONS_TABLE)
    .select("vault_device_id")
    .eq("vault_id", vaultId)
    .is("revoked_at", null)
    .in("vault_device_id", sourceDeviceIds);

  if (registrationError) {
    return { count: 0, error: registrationError };
  }

  const allowedDeviceIds = new Set((registrations || []).map((row) => row.vault_device_id));
  const count = (data || []).reduce((total, row) => {
    if (allowedDeviceIds.has(row.vault_device_id)) {
      return total + 1;
    }
    return total;
  }, 0);

  return { count, error: null };
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
  vaultId = null,
  aadVersion = VAULT_DOCUMENT_AAD_VERSION_LEGACY,
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
      vault_id: vaultId,
      aad_version: aadVersion,
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
      "id, vault_device_id, vault_id, aad_version, storage_path, ciphertext_sha256, ciphertext_bytes, content_type_hint, label_ciphertext, encryption_version, compromised_at, created_at, updated_at, deleted_at"
    )
    .single();

  return {
    document: mapVaultDocumentRow(data),
    error,
  };
}

export async function completeVaultDocumentAtomic({
  vaultDeviceId,
  docId,
  vaultId = null,
  aadVersion = VAULT_DOCUMENT_AAD_VERSION_LEGACY,
  storagePath,
  ciphertextSha256,
  ciphertextBytes,
  contentTypeHint,
  labelCiphertext = null,
  labelIv = null,
  encryptionVersion = VAULT_ENCRYPTION_VERSION,
  createdAt,
  eventPreviousStateHash,
  eventStateHash,
  eventMetadata = {},
}) {
  const supabase = createVaultAdminClient();

  const { data, error } = await supabase.rpc("vault_complete_document_atomic", {
    p_doc_id: docId,
    p_vault_device_id: vaultDeviceId,
    p_vault_id: vaultId,
    p_aad_version: aadVersion,
    p_storage_path: storagePath,
    p_ciphertext_sha256: ciphertextSha256,
    p_ciphertext_bytes: ciphertextBytes,
    p_content_type_hint: contentTypeHint,
    p_label_ciphertext: labelCiphertext,
    p_label_iv: labelIv,
    p_encryption_version: encryptionVersion,
    p_created_at: createdAt,
    p_event_previous_state_hash: eventPreviousStateHash,
    p_event_state_hash: eventStateHash,
    p_event_metadata: eventMetadata,
  });

  if (error) {
    return { document: null, error, usedRpc: true };
  }

  return {
    document: mapVaultDocumentRow(data),
    error: null,
    usedRpc: true,
  };
}

function mapVaultOwnershipKeyRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    vault_id: row.vault_id,
    public_key_jwk: row.public_key_jwk,
    algorithm: row.algorithm,
    created_at: row.created_at,
    metadata: row.metadata || {},
  };
}

function mapVaultOwnershipVerificationRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    status: row.status,
    challenge_type: row.challenge_type,
    challenge_id: row.challenge_id,
    challenge_nonce_hash: row.challenge_nonce_hash || null,
    issued_at: row.issued_at || null,
    expires_at: row.expires_at || null,
    consumed_at: row.consumed_at || null,
    verified_at: row.verified_at || null,
    ownership_key_id: row.ownership_key_id || null,
    vault_id: row.vault_id,
    vault_device_id: row.vault_device_id,
    created_at: row.created_at,
    metadata: row.metadata || {},
  };
}

export async function getVaultOwnershipKey(vaultId) {
  const supabase = createVaultAdminClient();
  const { data, error } = await supabase
    .from(VAULT_OWNERSHIP_KEYS_TABLE)
    .select("id, vault_id, public_key_jwk, algorithm, created_at, metadata")
    .eq("vault_id", vaultId)
    .maybeSingle();

  return {
    ownershipKey: mapVaultOwnershipKeyRow(data),
    error,
  };
}

export async function createVaultOwnershipKey({
  vaultId,
  publicKeyJwk,
  algorithm = VAULT_OWNERSHIP_KEY_ALGORITHM,
  metadata = {},
}) {
  const supabase = createVaultAdminClient();
  const { data, error } = await supabase
    .from(VAULT_OWNERSHIP_KEYS_TABLE)
    .insert({
      vault_id: vaultId,
      public_key_jwk: publicKeyJwk,
      algorithm,
      metadata,
    })
    .select("id, vault_id, public_key_jwk, algorithm, created_at, metadata")
    .single();

  return {
    ownershipKey: mapVaultOwnershipKeyRow(data),
    error,
  };
}

export async function createVaultOwnershipVerificationChallenge({
  challengeType,
  challengeNonceHash,
  issuedAt,
  expiresAt,
  ownershipKeyId = null,
  vaultId,
  vaultDeviceId,
  metadata = {},
}) {
  const supabase = createVaultAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(VAULT_OWNERSHIP_VERIFICATIONS_TABLE)
    .insert({
      status: "pending",
      challenge_type: challengeType,
      challenge_nonce_hash: challengeNonceHash,
      issued_at: issuedAt,
      expires_at: expiresAt,
      ownership_key_id: ownershipKeyId,
      vault_id: vaultId,
      vault_device_id: vaultDeviceId,
      created_at: now,
      metadata,
    })
    .select(
      "id, status, challenge_type, challenge_id, challenge_nonce_hash, issued_at, expires_at, consumed_at, verified_at, ownership_key_id, vault_id, vault_device_id, created_at, metadata"
    )
    .single();

  return {
    verification: mapVaultOwnershipVerificationRow(data),
    error,
  };
}

export async function getVaultOwnershipVerificationChallengeById(challengeId) {
  const supabase = createVaultAdminClient();
  const { data, error } = await supabase
    .from(VAULT_OWNERSHIP_VERIFICATIONS_TABLE)
    .select(
      "id, status, challenge_type, challenge_id, challenge_nonce_hash, issued_at, expires_at, consumed_at, verified_at, ownership_key_id, vault_id, vault_device_id, created_at, metadata"
    )
    .eq("challenge_id", challengeId)
    .maybeSingle();

  return {
    verification: mapVaultOwnershipVerificationRow(data),
    error,
  };
}

export async function verifyVaultOwnershipChallenge({
  verificationId,
  ownershipKeyId,
  metadata = {},
  verifiedAt = new Date().toISOString(),
}) {
  const supabase = createVaultAdminClient();
  const { data, error } = await supabase
    .from(VAULT_OWNERSHIP_VERIFICATIONS_TABLE)
    .update({
      status: VAULT_OWNERSHIP_VERIFICATION_STATUS_VERIFIED,
      ownership_key_id: ownershipKeyId,
      consumed_at: verifiedAt,
      verified_at: verifiedAt,
      metadata,
    })
    .eq("id", verificationId)
    .eq("status", "pending")
    .is("consumed_at", null)
    .select(
      "id, status, challenge_type, challenge_id, challenge_nonce_hash, issued_at, expires_at, consumed_at, verified_at, ownership_key_id, vault_id, vault_device_id, created_at, metadata"
    )
    .maybeSingle();

  return {
    verification: mapVaultOwnershipVerificationRow(data),
    error,
  };
}

export async function hasVerifiedVaultOwnershipForDevice({ vaultId, vaultDeviceId }) {
  const supabase = createVaultAdminClient();
  const { data, error } = await supabase
    .from(VAULT_OWNERSHIP_VERIFICATIONS_TABLE)
    .select("id")
    .eq("vault_id", vaultId)
    .eq("vault_device_id", vaultDeviceId)
    .eq("status", VAULT_OWNERSHIP_VERIFICATION_STATUS_VERIFIED)
    .not("verified_at", "is", null)
    .limit(1)
    .maybeSingle();

  return {
    verified: Boolean(data?.id),
    error,
  };
}

function mapVaultDocumentMigrationRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    vault_id: row.vault_id,
    source_document_id: row.source_document_id,
    target_document_id: row.target_document_id,
    source_vault_device_id: row.source_vault_device_id,
    target_vault_device_id: row.target_vault_device_id,
    state: row.state,
    failure_reason: row.failure_reason,
    source_retirement_state: row.source_retirement_state,
    upload_started_at: row.upload_started_at,
    completed_at: row.completed_at,
    source_retired_at: row.source_retired_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    metadata: row.metadata || {},
  };
}

function normalizeMigrationMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }
  return metadata;
}

function mergeMigrationMetadata(existingMetadata, patchMetadata) {
  return {
    ...normalizeMigrationMetadata(existingMetadata),
    ...normalizeMigrationMetadata(patchMetadata),
  };
}

export function buildVaultMigrationStagingStoragePath({ vaultId, migrationId, targetDocumentId }) {
  return `migrations/${vaultId}/${migrationId}/${targetDocumentId}.enc`;
}

export async function getVaultDocumentMigrationById(migrationId) {
  const supabase = createVaultAdminClient();
  const { data, error } = await supabase
    .from(VAULT_DOCUMENT_MIGRATIONS_TABLE)
    .select(
      "id, vault_id, source_document_id, target_document_id, source_vault_device_id, target_vault_device_id, state, failure_reason, source_retirement_state, upload_started_at, completed_at, source_retired_at, created_at, updated_at, metadata"
    )
    .eq("id", migrationId)
    .maybeSingle();

  return {
    migration: mapVaultDocumentMigrationRow(data),
    error,
  };
}

export async function createVaultDocumentMigrationRecord({
  vaultId,
  sourceDocumentId,
  targetDocumentId = null,
  sourceVaultDeviceId,
  targetVaultDeviceId,
  state = "pending",
  failureReason = null,
  sourceRetirementState = "active",
  uploadStartedAt = null,
  completedAt = null,
  sourceRetiredAt = null,
  metadata = {},
}) {
  const supabase = createVaultAdminClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from(VAULT_DOCUMENT_MIGRATIONS_TABLE)
    .insert({
      vault_id: vaultId,
      source_document_id: sourceDocumentId,
      target_document_id: targetDocumentId,
      source_vault_device_id: sourceVaultDeviceId,
      target_vault_device_id: targetVaultDeviceId,
      state,
      failure_reason: failureReason,
      source_retirement_state: sourceRetirementState,
      upload_started_at: uploadStartedAt,
      completed_at: completedAt,
      source_retired_at: sourceRetiredAt,
      created_at: now,
      updated_at: now,
      metadata,
    })
    .select(
      "id, vault_id, source_document_id, target_document_id, source_vault_device_id, target_vault_device_id, state, failure_reason, source_retirement_state, upload_started_at, completed_at, source_retired_at, created_at, updated_at, metadata"
    )
    .single();

  return {
    migration: mapVaultDocumentMigrationRow(data),
    error,
  };
}

export async function startVaultDocumentMigrationUpload({
  migrationId,
  targetDocumentId = crypto.randomUUID(),
  expectedSourceCiphertextSha256,
  aadVersion = VAULT_DOCUMENT_AAD_VERSION_VAULT_SCOPED,
  metadata = {},
  uploadStartedAt = new Date().toISOString(),
}) {
  const supabase = createVaultAdminClient();
  const { migration, error: lookupError } = await getVaultDocumentMigrationById(migrationId);
  if (lookupError) {
    return { migration: null, error: lookupError };
  }
  if (!migration) {
    return { migration: null, error: null, notFound: true };
  }
  if (migration.state !== "pending") {
    return { migration, error: null, invalidState: true };
  }

  const stagingStoragePath = buildVaultMigrationStagingStoragePath({
    vaultId: migration.vault_id,
    migrationId,
    targetDocumentId,
  });
  const nextMetadata = mergeMigrationMetadata(migration.metadata, {
    ...metadata,
    staging_storage_path: stagingStoragePath,
    expected_source_ciphertext_sha256: String(expectedSourceCiphertextSha256 || "").toLowerCase(),
    staging_verified: false,
    staging_verified_at: null,
    staging_ciphertext_sha256: null,
    staging_ciphertext_bytes: null,
    staging_content_type: null,
    staging_aad_version: aadVersion,
  });

  const { data, error } = await supabase
    .from(VAULT_DOCUMENT_MIGRATIONS_TABLE)
    .update({
      target_document_id: targetDocumentId,
      state: "uploading",
      upload_started_at: uploadStartedAt,
      updated_at: uploadStartedAt,
      metadata: nextMetadata,
    })
    .eq("id", migrationId)
    .eq("state", "pending")
    .is("target_document_id", null)
    .select(
      "id, vault_id, source_document_id, target_document_id, source_vault_device_id, target_vault_device_id, state, failure_reason, source_retirement_state, upload_started_at, completed_at, source_retired_at, created_at, updated_at, metadata"
    )
    .maybeSingle();

  return {
    migration: mapVaultDocumentMigrationRow(data),
    stagingStoragePath,
    error,
  };
}

export async function markVaultDocumentMigrationStagingVerified({
  migrationId,
  targetDocumentId,
  stagingCiphertextSha256,
  stagingCiphertextBytes,
  stagingContentType,
  aadVersion = VAULT_DOCUMENT_AAD_VERSION_VAULT_SCOPED,
  targetLabelCiphertext = null,
  targetLabelIv = null,
  sourceLabelPresent = false,
  verifiedAt = new Date().toISOString(),
}) {
  const supabase = createVaultAdminClient();
  const { migration, error: lookupError } = await getVaultDocumentMigrationById(migrationId);
  if (lookupError) {
    return { migration: null, error: lookupError };
  }
  if (!migration) {
    return { migration: null, error: null, notFound: true };
  }
  if (migration.state !== "uploading") {
    return { migration, error: null, invalidState: true };
  }
  if (migration.target_document_id !== targetDocumentId) {
    return { migration, error: null, targetMismatch: true };
  }

  const nextMetadata = mergeMigrationMetadata(migration.metadata, {
    staging_verified: true,
    staging_verified_at: verifiedAt,
    staging_ciphertext_sha256: String(stagingCiphertextSha256 || "").toLowerCase(),
    staging_ciphertext_bytes: Number(stagingCiphertextBytes),
    staging_content_type: stagingContentType,
    staging_aad_version: aadVersion,
    source_label_present: Boolean(sourceLabelPresent),
    target_label_ciphertext: targetLabelCiphertext || null,
    target_label_iv: targetLabelIv || null,
    target_label_preserved: Boolean(targetLabelCiphertext && targetLabelIv),
  });

  const { data, error } = await supabase
    .from(VAULT_DOCUMENT_MIGRATIONS_TABLE)
    .update({
      updated_at: verifiedAt,
      metadata: nextMetadata,
    })
    .eq("id", migrationId)
    .eq("state", "uploading")
    .eq("target_document_id", targetDocumentId)
    .select(
      "id, vault_id, source_document_id, target_document_id, source_vault_device_id, target_vault_device_id, state, failure_reason, source_retirement_state, upload_started_at, completed_at, source_retired_at, created_at, updated_at, metadata"
    )
    .maybeSingle();

  return {
    migration: mapVaultDocumentMigrationRow(data),
    error,
  };
}

export async function markVaultDocumentMigrationFailed({
  migrationId,
  failureReason,
  metadata = {},
  failedAt = new Date().toISOString(),
}) {
  const supabase = createVaultAdminClient();
  const { migration, error: lookupError } = await getVaultDocumentMigrationById(migrationId);
  if (lookupError) {
    return { migration: null, error: lookupError };
  }
  if (!migration) {
    return { migration: null, error: null, notFound: true };
  }
  if (migration.state !== "uploading") {
    return { migration, error: null, invalidState: true };
  }

  const nextMetadata = mergeMigrationMetadata(migration.metadata, {
    ...metadata,
    failed_at: failedAt,
  });

  const { data, error } = await supabase
    .from(VAULT_DOCUMENT_MIGRATIONS_TABLE)
    .update({
      state: "failed",
      failure_reason: failureReason,
      updated_at: failedAt,
      metadata: nextMetadata,
    })
    .eq("id", migrationId)
    .eq("state", "uploading")
    .select(
      "id, vault_id, source_document_id, target_document_id, source_vault_device_id, target_vault_device_id, state, failure_reason, source_retirement_state, upload_started_at, completed_at, source_retired_at, created_at, updated_at, metadata"
    )
    .maybeSingle();

  return {
    migration: mapVaultDocumentMigrationRow(data),
    error,
  };
}

export async function createVaultSignedUploadUrlForStoragePath(storagePath) {
  const supabase = createVaultAdminClient();
  const { data, error } = await supabase.storage
    .from(VAULT_STORAGE_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data?.signedUrl) {
    return {
      storage_path: storagePath,
      signedUrl: null,
      token: null,
      error: error || new Error("Unable to create vault upload URL."),
    };
  }

  return {
    storage_path: storagePath,
    signedUrl: data.signedUrl,
    token: data.token || null,
    expiresIn: VAULT_SIGNED_URL_TTL_SECONDS,
    error: null,
  };
}

export async function copyVaultStorageObject({ fromPath, toPath }) {
  const supabase = createVaultAdminClient();
  const { data, error } = await supabase.storage.from(VAULT_STORAGE_BUCKET).copy(fromPath, toPath);

  return {
    fromPath,
    toPath,
    data,
    error,
  };
}

export async function deleteVaultStorageObject(storagePath) {
  const supabase = createVaultAdminClient();
  const { data, error } = await supabase.storage.from(VAULT_STORAGE_BUCKET).remove([storagePath]);

  return {
    storagePath,
    data,
    error,
  };
}

export async function commitVaultDocumentMigrationAtomic({
  migrationId,
  vaultId,
  sourceDocumentId,
  sourceVaultDeviceId,
  targetVaultDeviceId,
  targetDocumentId,
  expectedSourceCiphertextSha256,
  liveStoragePath,
  ciphertextSha256,
  ciphertextBytes,
  contentTypeHint,
  labelCiphertext = null,
  labelIv = null,
  encryptionVersion = VAULT_ENCRYPTION_VERSION_MVK,
  aadVersion = VAULT_DOCUMENT_AAD_VERSION_VAULT_SCOPED,
  completedAt,
  eventPreviousStateHash,
  eventStateHash,
  eventMetadata = {},
  migrationMetadata = {},
}) {
  const supabase = createVaultAdminClient();

  const { data, error } = await supabase.rpc("vault_commit_document_migration_atomic", {
    p_migration_id: migrationId,
    p_vault_id: vaultId,
    p_source_document_id: sourceDocumentId,
    p_source_vault_device_id: sourceVaultDeviceId,
    p_target_vault_device_id: targetVaultDeviceId,
    p_target_document_id: targetDocumentId,
    p_expected_source_ciphertext_sha256: expectedSourceCiphertextSha256,
    p_live_storage_path: liveStoragePath,
    p_ciphertext_sha256: ciphertextSha256,
    p_ciphertext_bytes: ciphertextBytes,
    p_content_type_hint: contentTypeHint,
    p_label_ciphertext: labelCiphertext,
    p_label_iv: labelIv,
    p_encryption_version: encryptionVersion,
    p_aad_version: aadVersion,
    p_completed_at: completedAt,
    p_event_previous_state_hash: eventPreviousStateHash,
    p_event_state_hash: eventStateHash,
    p_event_metadata: eventMetadata,
    p_migration_metadata: migrationMetadata,
  });

  if (error) {
    return { document: null, migration: null, error, usedRpc: true };
  }

  return {
    document: mapVaultDocumentRow(data?.document),
    migration: mapVaultDocumentMigrationRow(data?.migration),
    error: null,
    usedRpc: true,
  };
}

export async function rollbackVaultDocumentInsert(documentId, vaultDeviceId) {
  const supabase = createVaultAdminClient();
  const { error } = await supabase
    .from(VAULT_DOCUMENTS_TABLE)
    .delete()
    .eq("id", documentId)
    .eq("vault_device_id", vaultDeviceId)
    .is("deleted_at", null);

  return { error };
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
      "id, vault_device_id, vault_id, aad_version, storage_path, ciphertext_sha256, ciphertext_bytes, content_type_hint, label_ciphertext, encryption_version, compromised_at, created_at, updated_at, deleted_at"
    )
    .single();

  return {
    document: mapVaultDocumentRow(data),
    error,
  };
}

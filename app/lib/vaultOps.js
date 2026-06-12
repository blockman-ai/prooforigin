import {
  createVaultAdminClient,
  isVaultAdminConfigured,
  VAULT_DOCUMENTS_TABLE,
  VAULT_REQUEST_NONCES_TABLE,
  VAULT_STORAGE_BUCKET,
} from "./vaultAdmin.js";

export async function countExpiredVaultNonces(supabase = null) {
  const client = supabase || createVaultAdminClient();
  const now = new Date().toISOString();

  const { count, error } = await client
    .from(VAULT_REQUEST_NONCES_TABLE)
    .select("nonce", { count: "exact", head: true })
    .lt("expires_at", now);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export async function cleanupExpiredVaultNonces(supabase = null) {
  const client = supabase || createVaultAdminClient();

  const { data, error } = await client.rpc("vault_cleanup_expired_request_nonces");

  if (error) {
    throw error;
  }

  return typeof data === "number" ? data : 0;
}

export async function verifyVaultBucketPrivacy(supabase = null) {
  const client = supabase || createVaultAdminClient();
  const { data, error } = await client.storage.getBucket(VAULT_STORAGE_BUCKET);

  if (error) {
    return {
      reachable: false,
      bucket: VAULT_STORAGE_BUCKET,
      public: null,
      error: error.message,
    };
  }

  return {
    reachable: true,
    bucket: VAULT_STORAGE_BUCKET,
    public: Boolean(data?.public),
    error: null,
  };
}

export function computeVaultStorageAudit(activePaths, storagePaths) {
  const activeSet = new Set(activePaths);
  const storageSet = new Set(storagePaths);

  const orphanPaths = storagePaths.filter((path) => !activeSet.has(path));
  const missingPaths = activePaths.filter((path) => !storageSet.has(path));

  return {
    active_document_count: activeSet.size,
    storage_object_count: storagePaths.length,
    orphan_count: orphanPaths.length,
    missing_ciphertext_count: missingPaths.length,
    orphan_paths_sample: orphanPaths.slice(0, 10),
    missing_paths_sample: missingPaths.slice(0, 10),
  };
}

async function listVaultEncStoragePaths(supabase) {
  const paths = [];
  const { data: topLevel, error: listError } = await supabase.storage
    .from(VAULT_STORAGE_BUCKET)
    .list("", { limit: 1000 });

  if (listError) {
    throw listError;
  }

  for (const entry of topLevel || []) {
    if (!entry?.name || entry.name.startsWith(".")) {
      continue;
    }

    const { data: files, error: filesError } = await supabase.storage
      .from(VAULT_STORAGE_BUCKET)
      .list(entry.name, { limit: 100 });

    if (filesError) {
      throw filesError;
    }

    for (const file of files || []) {
      if (file?.name?.endsWith(".enc")) {
        paths.push(`${entry.name}/${file.name}`);
      }
    }
  }

  return paths;
}

export async function auditVaultCiphertextStorage(supabase = null) {
  const client = supabase || createVaultAdminClient();

  const { data: documents, error: docsError } = await client
    .from(VAULT_DOCUMENTS_TABLE)
    .select("storage_path, deleted_at")
    .is("deleted_at", null);

  if (docsError) {
    throw docsError;
  }

  const activePaths = (documents || []).map((row) => row.storage_path);
  const storagePaths = await listVaultEncStoragePaths(client);

  return computeVaultStorageAudit(activePaths, storagePaths);
}

export async function runVaultOpsAudit() {
  if (!isVaultAdminConfigured()) {
    return {
      configured: false,
      error: "Vault admin is not configured.",
    };
  }

  const supabase = createVaultAdminClient();
  const [bucket, nonceAudit, storageAudit] = await Promise.all([
    verifyVaultBucketPrivacy(supabase),
    countExpiredVaultNonces(supabase).then((expired_nonce_count) => ({
      expired_nonce_count,
    })),
    auditVaultCiphertextStorage(supabase),
  ]);

  return {
    configured: true,
    bucket,
    nonces: nonceAudit,
    storage: storageAudit,
  };
}

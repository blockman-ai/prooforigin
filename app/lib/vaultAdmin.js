import { createClient } from "@supabase/supabase-js";

export const VAULT_DOCUMENTS_TABLE = "vault_documents";
export const VAULT_STORAGE_BUCKET = "vault-documents";
export const VAULT_ENCRYPTION_VERSION = 1;

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

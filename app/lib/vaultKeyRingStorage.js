import {
  exportWrappedMasterVaultKeyRecord,
  generateMasterVaultKey,
  importWrappedMasterVaultKeyRecord,
  wipeSensitiveBytes,
  wrapMasterVaultKeyWithPin,
} from "./vaultKeyRing.js";

export const VAULT_WRAPPED_MVK_STORAGE_KEY = "prooforigin_vault_wrapped_mvk_v1";

export function isVaultUsingMasterVaultKey() {
  return Boolean(loadWrappedMasterVaultKeyRecord());
}

export function loadWrappedMasterVaultKeyRecord() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(VAULT_WRAPPED_MVK_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    return importWrappedMasterVaultKeyRecord(raw);
  } catch {
    return null;
  }
}

export function storeWrappedMasterVaultKeyRecord(wrappedRecord) {
  if (typeof window === "undefined") {
    throw new Error("Vault key ring storage is only available in the browser.");
  }

  const serialized = exportWrappedMasterVaultKeyRecord(wrappedRecord);
  window.localStorage.setItem(VAULT_WRAPPED_MVK_STORAGE_KEY, serialized);
  return importWrappedMasterVaultKeyRecord(serialized);
}

export function clearWrappedMasterVaultKeyRecord() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(VAULT_WRAPPED_MVK_STORAGE_KEY);
}

/**
 * Brand-new vault setup only. Persists a PIN-wrapped MVK without changing unlock
 * or document crypto paths (legacy PIN-derived session key remains in use until Commit 3).
 */
export async function initializeMasterVaultKeyForNewVault(pin) {
  if (loadWrappedMasterVaultKeyRecord()) {
    throw new Error("Master vault key storage already exists for this vault.");
  }

  const masterVaultKey = generateMasterVaultKey();

  try {
    const wrappedRecord = await wrapMasterVaultKeyWithPin(masterVaultKey, pin);
    storeWrappedMasterVaultKeyRecord(wrappedRecord);

    return {
      usingMasterVaultKey: true,
      created_at: wrappedRecord.created_at,
    };
  } finally {
    wipeSensitiveBytes(masterVaultKey);
  }
}

export function resetVaultKeyRingStorageForTests() {
  clearWrappedMasterVaultKeyRecord();
}

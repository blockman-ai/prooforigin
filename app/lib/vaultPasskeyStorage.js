import {
  exportPasskeyWrapRecord,
  importPasskeyWrapRecord,
  validatePasskeyWrapRecord,
} from "./vaultPasskey.js";

export const VAULT_PASSKEY_WRAP_STORAGE_KEY = "prooforigin_vault_passkey_wrap_v1";

export { validatePasskeyWrapRecord };

export function loadPasskeyWrapRecord() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(VAULT_PASSKEY_WRAP_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    return importPasskeyWrapRecord(raw);
  } catch {
    return null;
  }
}

export function storePasskeyWrapRecord(record) {
  if (typeof window === "undefined") {
    throw new Error("Passkey wrap storage is only available in the browser.");
  }

  const validated = validatePasskeyWrapRecord(record);
  window.localStorage.setItem(VAULT_PASSKEY_WRAP_STORAGE_KEY, exportPasskeyWrapRecord(validated));
  return importPasskeyWrapRecord(window.localStorage.getItem(VAULT_PASSKEY_WRAP_STORAGE_KEY));
}

export function clearPasskeyWrapRecord() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(VAULT_PASSKEY_WRAP_STORAGE_KEY);
}

export function isVaultPasskeyEnrolled() {
  return Boolean(loadPasskeyWrapRecord());
}

export function resetPasskeyWrapStorageForTests() {
  clearPasskeyWrapRecord();
}

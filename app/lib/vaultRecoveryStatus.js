import { readVaultGenesis } from "./vaultGenesis.js";

export const VAULT_RECOVERY_KIT_CONFIRMED_STORAGE_KEY =
  "prooforigin_vault_recovery_kit_confirmed_v1";

export const VAULT_RECOVERY_NOT_CONFIGURED_WARNING = "No Recovery Kit configured.";

export const VAULT_RECOVERY_WARNING =
  "Losing this device or forgetting your PIN may permanently lock your vault without a saved recovery kit.";

export function readVaultRecoveryKitConfirmation() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(VAULT_RECOVERY_KIT_CONFIRMED_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const record = JSON.parse(raw);
    if (!record?.vault_id || !record?.confirmed_at || !record?.kit_version) {
      return null;
    }

    return record;
  } catch {
    return null;
  }
}

export function isVaultRecoveryKitConfigured() {
  const confirmation = readVaultRecoveryKitConfirmation();
  if (!confirmation) {
    return false;
  }

  const genesis = readVaultGenesis();
  if (!genesis?.vault_id) {
    return false;
  }

  return confirmation.vault_id === genesis.vault_id;
}

export function shouldShowVaultRecoveryWarning() {
  return !isVaultRecoveryKitConfigured();
}

export function markVaultRecoveryKitConfirmed({ vaultId, kitVersion, kitCreatedAt }) {
  if (typeof window === "undefined") {
    throw new Error("Recovery kit confirmation is only available in the browser.");
  }

  if (!vaultId || !kitVersion) {
    throw new Error("Recovery kit confirmation requires vault_id and kit version.");
  }

  const record = {
    vault_id: vaultId,
    kit_version: kitVersion,
    kit_created_at: kitCreatedAt || null,
    confirmed_at: new Date().toISOString(),
  };

  window.localStorage.setItem(VAULT_RECOVERY_KIT_CONFIRMED_STORAGE_KEY, JSON.stringify(record));
  return record;
}

export function clearVaultRecoveryKitConfirmationForTests() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(VAULT_RECOVERY_KIT_CONFIRMED_STORAGE_KEY);
}

/** @deprecated Use isVaultRecoveryKitConfigured() */
export const VAULT_RECOVERY_KIT_AVAILABLE = false;

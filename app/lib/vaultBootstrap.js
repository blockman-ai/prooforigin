import { readVaultGenesis } from "./vaultGenesis.js";
import { readPinRecord } from "./vaultPin.js";
import { loadWrappedMasterVaultKeyRecord } from "./vaultKeyRingStorage.js";

export const VAULT_BOOTSTRAP_STORAGE_KEY = "prooforigin_vault_bootstrap_choice_v1";

export const VAULT_BOOTSTRAP_CHOICES = {
  CREATE: "create",
  RESTORE: "restore",
};

const VALID_CHOICES = new Set(Object.values(VAULT_BOOTSTRAP_CHOICES));

export function readVaultBootstrapChoice() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(VAULT_BOOTSTRAP_STORAGE_KEY);
    if (!raw || !VALID_CHOICES.has(raw)) {
      return null;
    }

    return raw;
  } catch {
    return null;
  }
}

export function writeVaultBootstrapChoice(choice) {
  if (typeof window === "undefined") {
    throw new Error("Vault bootstrap choice is only available in the browser.");
  }

  if (!VALID_CHOICES.has(choice)) {
    throw new Error("Invalid vault bootstrap choice.");
  }

  window.localStorage.setItem(VAULT_BOOTSTRAP_STORAGE_KEY, choice);
  return choice;
}

export function clearVaultBootstrapChoice() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(VAULT_BOOTSTRAP_STORAGE_KEY);
}

export function isVaultBootstrapPending() {
  if (readVaultGenesis()) {
    return false;
  }

  if (readPinRecord()) {
    return false;
  }

  if (loadWrappedMasterVaultKeyRecord()) {
    return false;
  }

  return true;
}

export function shouldShowVaultBootstrapChoice() {
  return isVaultBootstrapPending() && !readVaultBootstrapChoice();
}

export function isVaultRestoreBootstrapChosen() {
  return (
    isVaultBootstrapPending() &&
    readVaultBootstrapChoice() === VAULT_BOOTSTRAP_CHOICES.RESTORE
  );
}

export function isVaultCreateBootstrapChosen() {
  return (
    isVaultBootstrapPending() &&
    readVaultBootstrapChoice() === VAULT_BOOTSTRAP_CHOICES.CREATE
  );
}

export function canCreateVaultGenesis() {
  if (readVaultGenesis()) {
    return true;
  }

  return readVaultBootstrapChoice() === VAULT_BOOTSTRAP_CHOICES.CREATE;
}

export function resetVaultBootstrapForTests() {
  clearVaultBootstrapChoice();
}

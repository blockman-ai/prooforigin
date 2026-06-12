import { clearBytes } from "./vaultCrypto";

export const VAULT_INACTIVITY_MS = 30_000;

export const VAULT_STATES = {
  LOCKED: "locked",
  UNLOCKED: "unlocked",
  VANISH: "vanish",
  SEALED: "sealed",
};

export const VAULT_VANISH_MESSAGE = "Vault protected. Re-authentication required.";

let sessionMasterKey = null;
let sessionDocumentKey = null;

export function setVaultSessionMasterKey(masterKey) {
  clearVaultSessionSecrets();
  sessionMasterKey = masterKey || null;
}

export function getVaultSessionMasterKey() {
  return sessionMasterKey;
}

export function setVaultSessionDocumentKey(documentKey) {
  sessionDocumentKey = documentKey || null;
}

export function getVaultSessionDocumentKey() {
  return sessionDocumentKey;
}

export function clearVaultSessionSecrets() {
  if (sessionMasterKey instanceof Uint8Array) {
    clearBytes(sessionMasterKey);
  }
  sessionMasterKey = null;
  sessionDocumentKey = null;
}

export function formatLastUnlockTime(value) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

import { clearBytes } from "./vaultCrypto";

export const VAULT_INACTIVITY_MS = 30_000;

export const VAULT_STATES = {
  LOCKED: "locked",
  UNLOCKED: "unlocked",
  VANISH: "vanish",
  SEALED: "sealed",
};

export const VAULT_VANISH_MESSAGE = "Vault protected. Re-authentication required.";

let sessionMasterVaultKey = null;
let sessionLegacyPinKey = null;
let sessionUnlockMode = null;
let sessionDocumentKey = null;

function wipeSessionKeyBytes(key) {
  if (key instanceof Uint8Array) {
    clearBytes(key);
  }
}

export function setVaultSessionUnlockKeys({ mode, masterVaultKey, legacyPinKey }) {
  clearVaultSessionSecrets();
  sessionUnlockMode = mode || null;
  sessionMasterVaultKey = masterVaultKey || null;
  sessionLegacyPinKey = legacyPinKey || null;
}

export function getVaultSessionUnlockKeys() {
  return {
    mode: sessionUnlockMode,
    masterVaultKey: sessionMasterVaultKey,
    legacyPinKey: sessionLegacyPinKey,
  };
}

export function hasVaultSessionUnlockKeys() {
  return sessionLegacyPinKey instanceof Uint8Array;
}

/** @deprecated Use getVaultSessionUnlockKeys(). Legacy callers receive the active session root. */
export function setVaultSessionMasterKey(masterKey) {
  setVaultSessionUnlockKeys({
    mode: "legacy",
    masterVaultKey: null,
    legacyPinKey: masterKey,
  });
}

/** @deprecated Use getVaultSessionUnlockKeys(). Returns MVK in MVK mode, else legacy PIN key. */
export function getVaultSessionMasterKey() {
  if (sessionUnlockMode === "mvk" && sessionMasterVaultKey instanceof Uint8Array) {
    return sessionMasterVaultKey;
  }

  return sessionLegacyPinKey;
}

export function setVaultSessionDocumentKey(documentKey) {
  sessionDocumentKey = documentKey || null;
}

export function getVaultSessionDocumentKey() {
  return sessionDocumentKey;
}

export function clearVaultSessionDocumentKey() {
  wipeSessionKeyBytes(sessionDocumentKey);
  sessionDocumentKey = null;
}

export function clearVaultSessionSecrets() {
  wipeSessionKeyBytes(sessionMasterVaultKey);
  wipeSessionKeyBytes(sessionLegacyPinKey);
  sessionMasterVaultKey = null;
  sessionLegacyPinKey = null;
  sessionUnlockMode = null;
  clearVaultSessionDocumentKey();
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

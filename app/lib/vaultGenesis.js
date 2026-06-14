import {
  canCreateVaultGenesis,
  clearVaultBootstrapChoice,
} from "./vaultBootstrap.js";

export const VAULT_GENESIS_STORAGE_KEY = "prooforigin_vault_genesis_v1";
export const VAULT_GENESIS_PREFIX = "prooforigin-vault-genesis-v1";

export const VAULT_IDENTITY_STATES = {
  SEALED: "sealed",
};

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(input) {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return bufferToHex(hashBuffer);
}

export async function computeVaultGenesisHash(vaultId, vaultCreatedAt) {
  const payload = `${VAULT_GENESIS_PREFIX}\n${vaultId}\n${vaultCreatedAt}`;
  return sha256Hex(payload);
}

export function readVaultGenesis() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(VAULT_GENESIS_STORAGE_KEY);
    if (!raw) return null;

    const record = JSON.parse(raw);
    if (!record?.vault_id || !record?.vault_created_at || !record?.vault_genesis_hash) {
      return null;
    }

    return record;
  } catch {
    return null;
  }
}

function writeVaultGenesis(record) {
  window.localStorage.setItem(VAULT_GENESIS_STORAGE_KEY, JSON.stringify(record));
}

export async function createVaultGenesis() {
  const existing = readVaultGenesis();
  if (existing) {
    return existing;
  }

  if (!canCreateVaultGenesis()) {
    throw new Error("Choose Create New Vault before creating vault genesis.");
  }

  const vault_id = crypto.randomUUID();
  const vault_created_at = new Date().toISOString();
  const vault_genesis_hash = await computeVaultGenesisHash(vault_id, vault_created_at);

  const record = {
    vault_id,
    vault_created_at,
    vault_genesis_hash,
    vault_state: VAULT_IDENTITY_STATES.SEALED,
  };

  writeVaultGenesis(record);
  clearVaultBootstrapChoice();

  return record;
}

export async function ensureVaultGenesis() {
  const existing = readVaultGenesis();
  if (existing) {
    return existing;
  }

  throw new Error("Vault genesis does not exist. Choose Create New Vault or complete restore.");
}

export function resetVaultGenesisForTests() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(VAULT_GENESIS_STORAGE_KEY);
}

export function formatVaultCreatedAt(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatGenesisHashPreview(hash) {
  if (!hash || typeof hash !== "string") return "—";
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-8)}`;
}

export function formatVaultIdDisplay(vaultId) {
  if (!vaultId) return "—";
  return vaultId;
}

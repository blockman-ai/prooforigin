import { PBKDF2_ITERATIONS } from "./vaultPin.js";

export const VAULT_RECOVERY_KIT_VERSION = "recovery-kit-v1";
export const VAULT_RECOVERY_WRAP_METHOD = "recovery_pbkdf2_aes_gcm_v1";
export const VAULT_RECOVERY_PHRASE_WORD_COUNT = 12;

const RECOVERY_WRAP_INFO = new TextEncoder().encode("prooforigin-vault-recovery-mvk-wrap-v1");
const RECOVERY_WRAP_IV_BYTES = 12;

export const RECOVERY_WORDLIST = [
  "amber", "anchor", "arctic", "atlas", "aurora", "avenue", "balance", "bamboo", "beacon", "binary",
  "breeze", "bridge", "canyon", "carbon", "cascade", "castle", "cedar", "cipher", "citrus", "cloud",
  "cobalt", "compass", "coral", "cosmic", "crystal", "delta", "denim", "ember", "engine", "epoch",
  "falcon", "fiber", "fjord", "forest", "fortress", "frost", "galaxy", "garden", "glacier", "granite",
  "harbor", "haven", "helix", "horizon", "indigo", "iron", "ivory", "jade", "journey", "kernel",
  "lagoon", "lattice", "ledger", "legend", "light", "lunar", "marble", "matrix", "meadow", "mercury",
  "mirror", "monarch", "mosaic", "nebula", "nectar", "nimbus", "noble", "north", "nova", "ocean",
  "onyx", "oracle", "orbit", "origin", "otter", "oxide", "oxygen", "palace", "paper", "paradox",
  "pearl", "phoenix", "pillar", "pioneer", "pixel", "planet", "plasma", "prairie", "proof", "pulse",
  "quantum", "quartz", "radar", "rain", "raven", "reef", "ridge", "river", "rocket", "ruby",
  "safari", "sage", "sanctum", "sapphire", "saturn", "shadow", "shield", "signal", "silver", "sky",
  "solar", "spark", "spectrum", "sphere", "spirit", "spring", "stone", "storm", "summit", "sunrise",
  "temple", "thunder", "tide", "timber", "token", "torch", "tower", "trust", "tunnel", "union",
  "valley", "vector", "velvet", "vertex", "vessel", "violet", "vision", "voyage", "wave", "willow",
  "window", "winter", "wisdom", "witness", "wizard", "wonder", "zenith", "zero", "zone", "anchorline",
  "archive", "baseline", "blueprint", "circuit", "compass", "custody", "daybreak", "daylight", "deep", "drift",
  "echo", "element", "ember", "enclave", "fabric", "factor", "fable", "field", "flame", "focus",
  "forge", "frame", "frontier", "future", "glow", "guardian", "harvest", "hidden", "honor", "impact",
  "infinite", "island", "keeper", "key", "kindle", "kinetic", "layer", "legacy", "linear", "logic",
  "lumen", "mantle", "memory", "metric", "midnight", "module", "moment", "mountain", "mystic", "native",
  "network", "neutral", "night", "nomad", "northstar", "object", "obsidian", "omega", "open", "orbitals",
  "pattern", "peak", "phase", "pilot", "plains", "portal", "prime", "privacy", "promise", "protect",
  "pure", "quest", "quiet", "radius", "random", "rapid", "reality", "record", "relay", "reserve",
  "resolve", "ripple", "riverbank", "rover", "sacred", "scale", "scope", "secure", "sequence", "serene",
  "session", "silent", "source", "stable", "static", "steady", "stream", "strong", "studio", "subtle",
  "summitline", "sunset", "surge", "symbol", "system", "terra", "thread", "threshold", "titan", "trace",
  "trail", "tranquil", "treasure", "truth", "twilight", "unique", "uplink", "utility", "vault", "vectorline",
  "verify", "vertexline", "vigil", "vital", "voice", "vortex", "watch", "water", "waveform", "whisper",
  "wild", "windowpane", "winterline", "wire", "witnessline", "wonderline", "wood", "world", "yield", "zen",
];

function bufferToBase64(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const WORD_SET = new Set(RECOVERY_WORDLIST.map((word) => word.toLowerCase()));

export function normalizeRecoveryPhrase(phrase) {
  return String(phrase || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

export function generateRecoveryPhrase() {
  const indices = crypto.getRandomValues(new Uint8Array(VAULT_RECOVERY_PHRASE_WORD_COUNT));
  const words = Array.from(indices, (index) => RECOVERY_WORDLIST[index % RECOVERY_WORDLIST.length]);
  return words.join(" ");
}

export function validateRecoveryPhrase(phrase) {
  const normalized = normalizeRecoveryPhrase(phrase);
  if (!normalized) {
    return { valid: false, normalized: "", error: "Recovery phrase is required." };
  }

  const words = normalized.split(" ");
  if (words.length !== VAULT_RECOVERY_PHRASE_WORD_COUNT) {
    return {
      valid: false,
      normalized,
      error: `Recovery phrase must contain exactly ${VAULT_RECOVERY_PHRASE_WORD_COUNT} words.`,
    };
  }

  for (const word of words) {
    if (!WORD_SET.has(word)) {
      return {
        valid: false,
        normalized,
        error: "Recovery phrase contains an invalid word.",
      };
    }
  }

  return { valid: true, normalized, error: null };
}

export async function deriveRecoveryKey(phrase, saltBuffer) {
  const validation = validateRecoveryPhrase(phrase);
  if (!validation.valid) {
    throw new Error(validation.error || "Invalid recovery phrase.");
  }

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(validation.normalized),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  return new Uint8Array(derived);
}

function assertMasterVaultKeyBytes(masterVaultKey) {
  if (!(masterVaultKey instanceof Uint8Array) || masterVaultKey.length !== 32) {
    throw new Error("Master vault key must be a 32-byte Uint8Array.");
  }
}

function validateWrappedMvkRecord(record) {
  if (!record || typeof record !== "object") {
    throw new Error("Recovery kit wrapped MVK record is invalid.");
  }

  if (record.wrap_method !== VAULT_RECOVERY_WRAP_METHOD) {
    throw new Error("Unsupported recovery kit wrap method.");
  }

  for (const field of ["salt", "iv", "ciphertext"]) {
    if (typeof record[field] !== "string" || !record[field].trim()) {
      throw new Error(`Recovery kit wrapped MVK record missing ${field}.`);
    }
  }

  return record;
}

function validateRecoveryKit(kit) {
  if (!kit || typeof kit !== "object") {
    throw new Error("Recovery kit is invalid.");
  }

  if (kit.version !== VAULT_RECOVERY_KIT_VERSION) {
    throw new Error("Unsupported recovery kit version.");
  }

  if (typeof kit.vault_id !== "string" || !kit.vault_id.trim()) {
    throw new Error("Recovery kit missing vault_id.");
  }

  if (typeof kit.created_at !== "string" || !kit.created_at.trim()) {
    throw new Error("Recovery kit missing created_at.");
  }

  validateWrappedMvkRecord(kit.wrapped_mvk);
  return kit;
}

async function importAesGcmKey(rawKeyBytes) {
  return crypto.subtle.importKey("raw", rawKeyBytes, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function wrapMasterVaultKeyWithRecoveryKey(masterVaultKey, recoveryKeyBytes) {
  assertMasterVaultKeyBytes(masterVaultKey);

  if (!(recoveryKeyBytes instanceof Uint8Array) || recoveryKeyBytes.length !== 32) {
    throw new Error("Recovery key must be a 32-byte Uint8Array.");
  }

  const iv = crypto.getRandomValues(new Uint8Array(RECOVERY_WRAP_IV_BYTES));
  const aesKey = await importAesGcmKey(recoveryKeyBytes);

  const ciphertextBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: RECOVERY_WRAP_INFO,
    },
    aesKey,
    masterVaultKey
  );

  return {
    wrap_method: VAULT_RECOVERY_WRAP_METHOD,
    iv: bufferToBase64(iv.buffer),
    ciphertext: bufferToBase64(ciphertextBuffer),
    iterations: PBKDF2_ITERATIONS,
  };
}

export async function unwrapMasterVaultKeyWithRecoveryKey(wrappedMvk, recoveryKeyBytes) {
  const record = validateWrappedMvkRecord(wrappedMvk);
  const salt = base64ToBuffer(record.salt);
  const iv = base64ToBuffer(record.iv);
  const ciphertext = base64ToBuffer(record.ciphertext);

  try {
    const aesKey = await importAesGcmKey(recoveryKeyBytes);
    const plaintextBuffer = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: RECOVERY_WRAP_INFO,
      },
      aesKey,
      ciphertext
    );

    const masterVaultKey = new Uint8Array(plaintextBuffer);
    if (masterVaultKey.length !== 32) {
      return null;
    }

    return masterVaultKey;
  } catch {
    return null;
  } finally {
    salt.fill(0);
    iv.fill(0);
    ciphertext.fill(0);
  }
}

export async function exportRecoveryKit({ vaultId, masterVaultKey, recoveryPhrase }) {
  if (typeof vaultId !== "string" || !vaultId.trim()) {
    throw new Error("vault_id is required to export a recovery kit.");
  }

  assertMasterVaultKeyBytes(masterVaultKey);

  const validation = validateRecoveryPhrase(recoveryPhrase);
  if (!validation.valid) {
    throw new Error(validation.error || "Invalid recovery phrase.");
  }

  const wrapSalt = crypto.getRandomValues(new Uint8Array(16));
  let recoveryKeyBytes = null;

  try {
    recoveryKeyBytes = await deriveRecoveryKey(recoveryPhrase, wrapSalt.buffer);
    const wrapped_mvk = await wrapMasterVaultKeyWithRecoveryKey(masterVaultKey, recoveryKeyBytes);
    wrapped_mvk.salt = bufferToBase64(wrapSalt.buffer);

    return validateRecoveryKit({
      version: VAULT_RECOVERY_KIT_VERSION,
      vault_id: vaultId,
      created_at: new Date().toISOString(),
      wrapped_mvk,
    });
  } finally {
    if (recoveryKeyBytes) {
      recoveryKeyBytes.fill(0);
    }
    wrapSalt.fill(0);
  }
}

export async function unwrapMasterVaultKeyFromRecoveryKit(recoveryKit, recoveryPhrase) {
  const kit = validateRecoveryKit(recoveryKit);
  const validation = validateRecoveryPhrase(recoveryPhrase);
  if (!validation.valid) {
    return null;
  }

  const salt = base64ToBuffer(kit.wrapped_mvk.salt);
  let recoveryKeyBytes = null;

  try {
    recoveryKeyBytes = await deriveRecoveryKey(recoveryPhrase, salt.buffer);
    return unwrapMasterVaultKeyWithRecoveryKey(kit.wrapped_mvk, recoveryKeyBytes);
  } finally {
    if (recoveryKeyBytes) {
      recoveryKeyBytes.fill(0);
    }
    salt.fill(0);
  }
}

export function serializeRecoveryKit(recoveryKit) {
  const kit = validateRecoveryKit(recoveryKit);
  return JSON.stringify(kit, null, 2);
}

export function parseRecoveryKit(serialized) {
  if (typeof serialized !== "string" || !serialized.trim()) {
    throw new Error("Recovery kit export must be a non-empty string.");
  }

  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error("Recovery kit export is not valid JSON.");
  }

  return validateRecoveryKit(parsed);
}

export function buildRecoveryKitDownloadFilename(vaultId) {
  const compact = String(vaultId || "vault").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 36);
  const stamp = new Date().toISOString().slice(0, 10);
  return `prooforigin-vault-recovery-${compact}-${stamp}.json`;
}

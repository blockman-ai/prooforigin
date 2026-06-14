import {
  clearBytes,
  decryptVaultBytes,
  encryptVaultBytes,
  sha256Hex,
} from "./vaultCrypto.js";

export const VAULT_OWNERSHIP_KEY_CURVE = "P-256";
export const VAULT_OWNERSHIP_KEY_ALGORITHM = "ECDSA";
export const VAULT_OWNERSHIP_KEY_SIGN_HASH = "SHA-256";
export const VAULT_OWNERSHIP_PRIVATE_JWK_STORAGE_KEY =
  "prooforigin_vault_ownership_private_jwk_v1";
const VAULT_OWNERSHIP_PRIVATE_JWK_AAD_PREFIX = "prooforigin-vault-ownership-private-jwk-v1";

function bytesToBase64(bytes) {
  if (typeof btoa === "function") {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  return Buffer.from(bytes).toString("base64");
}

function base64ToBytes(base64) {
  if (typeof atob === "function") {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  return new Uint8Array(Buffer.from(base64, "base64"));
}

function ensureBrowserStorage() {
  if (typeof window === "undefined") {
    throw new Error("Vault ownership key storage is only available in the browser.");
  }
}

function normalizeChallengeBytes(challenge) {
  if (typeof challenge === "string") {
    return new TextEncoder().encode(challenge);
  }
  if (challenge instanceof Uint8Array) {
    return challenge;
  }
  if (challenge instanceof ArrayBuffer) {
    return new Uint8Array(challenge);
  }
  if (ArrayBuffer.isView(challenge)) {
    return new Uint8Array(challenge.buffer, challenge.byteOffset, challenge.byteLength);
  }

  throw new Error("Ownership challenge must be a string or byte array.");
}

function buildOwnershipPrivateJwkAad(vaultId) {
  return `${VAULT_OWNERSHIP_PRIVATE_JWK_AAD_PREFIX}|vault_id=${String(vaultId || "").trim()}`;
}

export async function generateVaultOwnershipKeyPair() {
  return crypto.subtle.generateKey(
    {
      name: VAULT_OWNERSHIP_KEY_ALGORITHM,
      namedCurve: VAULT_OWNERSHIP_KEY_CURVE,
    },
    true,
    ["sign", "verify"]
  );
}

export async function exportVaultOwnershipPublicJwk(publicKey) {
  const jwk = await crypto.subtle.exportKey("jwk", publicKey);
  if (!jwk?.x || !jwk?.y || jwk?.d) {
    throw new Error("Ownership public key export is invalid.");
  }
  return jwk;
}

export async function exportVaultOwnershipPrivateJwk(privateKey) {
  const jwk = await crypto.subtle.exportKey("jwk", privateKey);
  if (!jwk?.d) {
    throw new Error("Ownership private key export is invalid.");
  }
  return jwk;
}

export async function importVaultOwnershipPrivateJwk(privateJwk) {
  return crypto.subtle.importKey(
    "jwk",
    privateJwk,
    {
      name: VAULT_OWNERSHIP_KEY_ALGORITHM,
      namedCurve: VAULT_OWNERSHIP_KEY_CURVE,
    },
    false,
    ["sign"]
  );
}

export async function signVaultOwnershipChallenge({ privateKey, challenge }) {
  const challengeBytes = normalizeChallengeBytes(challenge);
  const signatureBuffer = await crypto.subtle.sign(
    {
      name: VAULT_OWNERSHIP_KEY_ALGORITHM,
      hash: VAULT_OWNERSHIP_KEY_SIGN_HASH,
    },
    privateKey,
    challengeBytes
  );

  return bytesToBase64(new Uint8Array(signatureBuffer));
}

export async function computeVaultOwnershipPublicKeyFingerprint(publicJwk) {
  const payload = JSON.stringify({
    crv: publicJwk?.crv,
    kty: publicJwk?.kty,
    x: publicJwk?.x,
    y: publicJwk?.y,
  });

  return sha256Hex(payload);
}

export async function storeWrappedVaultOwnershipPrivateJwk({
  vaultId,
  privateJwk,
  masterVaultKey,
}) {
  ensureBrowserStorage();

  if (!(masterVaultKey instanceof Uint8Array) || masterVaultKey.length !== 32) {
    throw new Error("Master vault key is required to wrap ownership private key.");
  }

  const payloadBytes = new TextEncoder().encode(JSON.stringify(privateJwk));
  const encrypted = await encryptVaultBytes(
    payloadBytes,
    masterVaultKey,
    buildOwnershipPrivateJwkAad(vaultId)
  );

  const record = {
    vault_id: String(vaultId || "").trim(),
    iv: bytesToBase64(encrypted.iv),
    ciphertext: bytesToBase64(encrypted.ciphertext),
    stored_at: new Date().toISOString(),
  };

  window.localStorage.setItem(VAULT_OWNERSHIP_PRIVATE_JWK_STORAGE_KEY, JSON.stringify(record));

  clearBytes(payloadBytes);
  clearBytes(encrypted.ciphertext);
  return record;
}

export async function loadWrappedVaultOwnershipPrivateJwk({ vaultId, masterVaultKey }) {
  ensureBrowserStorage();

  const raw = window.localStorage.getItem(VAULT_OWNERSHIP_PRIVATE_JWK_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  const record = JSON.parse(raw);
  if (
    !record?.vault_id ||
    !record?.iv ||
    !record?.ciphertext ||
    String(record.vault_id) !== String(vaultId)
  ) {
    return null;
  }

  const iv = base64ToBytes(record.iv);
  const ciphertext = base64ToBytes(record.ciphertext);

  try {
    const plaintext = await decryptVaultBytes(
      ciphertext,
      masterVaultKey,
      iv,
      buildOwnershipPrivateJwkAad(vaultId)
    );
    const privateJwk = JSON.parse(new TextDecoder().decode(plaintext));
    clearBytes(plaintext);
    return privateJwk;
  } finally {
    clearBytes(iv);
    clearBytes(ciphertext);
  }
}

export function clearWrappedVaultOwnershipPrivateJwk() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(VAULT_OWNERSHIP_PRIVATE_JWK_STORAGE_KEY);
}

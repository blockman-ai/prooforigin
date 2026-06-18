import crypto from "crypto";

export const VAULT_OWNERSHIP_CHALLENGE_VERSION = "prooforigin-vault-ownership-challenge-v1";
export const VAULT_OWNERSHIP_CHALLENGE_TYPE_MIGRATION_AUTHORITY_VERIFY =
  "migration_authority_verify";
export const VAULT_OWNERSHIP_CHALLENGE_TYPE_OWNERSHIP_KEY_REGISTER = "ownership_key_register";
export const VAULT_OWNERSHIP_CHALLENGE_TYPE_ASSET_TRANSFER_ACCEPT = "asset_transfer_accept";
export const VAULT_OWNERSHIP_CHALLENGE_TTL_SECONDS = 5 * 60;

function normalizeRequiredString(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

export function buildVaultOwnershipChallengeMessage({
  challengeId,
  challengeType = VAULT_OWNERSHIP_CHALLENGE_TYPE_MIGRATION_AUTHORITY_VERIFY,
  vaultId,
  vaultDeviceId,
  challengeNonce,
  issuedAt,
  expiresAt,
  version = VAULT_OWNERSHIP_CHALLENGE_VERSION,
}) {
  const normalizedChallengeId = normalizeRequiredString(challengeId, "challenge_id");
  const normalizedChallengeType = normalizeRequiredString(challengeType, "challenge_type");
  const normalizedVaultId = normalizeRequiredString(vaultId, "vault_id").toLowerCase();
  const normalizedVaultDeviceId = normalizeRequiredString(
    vaultDeviceId,
    "vault_device_id"
  ).toLowerCase();
  const normalizedNonce = normalizeRequiredString(challengeNonce, "challenge_nonce");
  const normalizedIssuedAt = normalizeRequiredString(issuedAt, "issued_at");
  const normalizedExpiresAt = normalizeRequiredString(expiresAt, "expires_at");
  const normalizedVersion = normalizeRequiredString(version, "version");

  return [
    normalizedVersion,
    `challenge_id=${normalizedChallengeId}`,
    `challenge_type=${normalizedChallengeType}`,
    `vault_id=${normalizedVaultId}`,
    `vault_device_id=${normalizedVaultDeviceId}`,
    `challenge_nonce=${normalizedNonce}`,
    `issued_at=${normalizedIssuedAt}`,
    `expires_at=${normalizedExpiresAt}`,
  ].join("|");
}

export function hashOwnershipChallengeNonce(challengeNonce) {
  return crypto.createHash("sha256").update(String(challengeNonce || "")).digest("hex");
}

export function parseOwnershipSignatureBase64(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error("signature is required.");
  }
  return Buffer.from(normalized, "base64");
}

export async function verifyOwnershipSignature({ publicKeyJwk, message, signatureBase64 }) {
  const verifyKey = await crypto.webcrypto.subtle.importKey(
    "jwk",
    publicKeyJwk,
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    false,
    ["verify"]
  );

  const signatureBytes = parseOwnershipSignatureBase64(signatureBase64);
  const messageBytes = new TextEncoder().encode(message);

  return crypto.webcrypto.subtle.verify(
    {
      name: "ECDSA",
      hash: "SHA-256",
    },
    verifyKey,
    signatureBytes,
    messageBytes
  );
}

export const VAULT_OWNERSHIP_CHALLENGE_VERSION = "prooforigin-vault-ownership-challenge-v1";
export const VAULT_OWNERSHIP_CHALLENGE_TYPE_MIGRATION_AUTHORITY_VERIFY =
  "migration_authority_verify";
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

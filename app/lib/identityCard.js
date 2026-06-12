import crypto from "crypto";
import {
  EXPIRATION_OPTIONS,
  GENESIS_STATE_HASH,
  IDENTITY_CARD_VERSION,
  ROTATING_CODE_WINDOW_SECONDS,
  getVerifyWindowOffsets,
  normalizeTrustTier,
  getTierRotationSeconds,
  resolveCardRotationSeconds,
  resolveCardTrustTier,
  formatTrustTierLabel,
  buildDefaultTierMetadata,
} from "./identityCardShared";

export {
  IDENTITY_CARD_VERSION,
  IDENTITY_CARD_STORAGE_KEY,
  ROTATING_CODE_WINDOW_SECONDS,
  GENESIS_STATE_HASH,
  TRUST_STATES,
  STATE_EVENT_TYPES,
  EXPIRATION_OPTIONS,
  IDENTITY_DISCLAIMER,
  TRUST_TIER_IDS,
  TIER_ROTATION_SECONDS,
  STRICT_VERIFY_TIERS,
  usesStrictVerifyWindow,
  isCardExpired,
  secondsUntilNextCode,
  formatCardDate,
  formatCardDateTime,
  resolveTrustState,
  cardUsesDtsAlgorithm,
  buildVerificationPath,
  normalizeTrustTier,
  getTierRotationSeconds,
  resolveCardRotationSeconds,
  resolveCardTrustTier,
  formatTrustTierLabel,
  getVerifyWindowOffsets,
  buildDefaultTierMetadata,
} from "./identityCardShared";

const ROTATING_CODE_PREFIX = "prooforigin-dts-code-v1";
const CARD_STATE_PREFIX = "prooforigin-card-state-v1";
const LEGACY_ROTATING_PREFIX = "prooforigin-identity-v1";

export function generateCardId() {
  return crypto.randomUUID();
}

export function generateSecretSeed() {
  return crypto.randomUUID();
}

export function hashSecretSeed(seed) {
  return crypto.createHash("sha256").update(String(seed)).digest("hex");
}

export function getExpirationOption(value) {
  return EXPIRATION_OPTIONS.find((option) => option.value === value) || EXPIRATION_OPTIONS[2];
}

export function computeExpirationDate(issuedAt, expirationKey) {
  const option = getExpirationOption(expirationKey);
  const issued = issuedAt instanceof Date ? issuedAt : new Date(issuedAt);
  const expires = new Date(issued);
  expires.setDate(expires.getDate() + option.days);
  return expires;
}

export function isProductionRuntime() {
  return process.env.NODE_ENV === "production";
}

export function isDtsMasterKeyConfigured() {
  const key = process.env.PROOFORIGIN_DTS_MASTER_KEY;
  return Boolean(key && String(key).trim() && !String(key).includes("YOUR_"));
}

export function getDtsConfigurationError() {
  if (isDtsMasterKeyConfigured()) return null;
  if (isProductionRuntime()) {
    return "PROOFORIGIN_DTS_MASTER_KEY is required in production for Dynamic Trust State encryption and verification.";
  }
  return null;
}

export function getMasterKey() {
  const dtsKey = process.env.PROOFORIGIN_DTS_MASTER_KEY;
  if (dtsKey && String(dtsKey).trim() && !String(dtsKey).includes("YOUR_")) {
    return crypto.createHash("sha256").update(String(dtsKey)).digest();
  }

  if (isProductionRuntime()) {
    throw new Error(getDtsConfigurationError());
  }

  return crypto
    .createHash("sha256")
    .update("prooforigin-dts-dev-master-key")
    .digest();
}

export function encryptSecretSeed(secretSeed) {
  const key = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(secretSeed), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    secret_ciphertext: encrypted.toString("base64"),
    secret_nonce: Buffer.concat([iv, tag]).toString("base64"),
  };
}

export function decryptSecretSeed(secretCiphertext, secretNonce) {
  const key = getMasterKey();
  const nonceBuffer = Buffer.from(secretNonce, "base64");
  const iv = nonceBuffer.subarray(0, 12);
  const tag = nonceBuffer.subarray(12);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(secretCiphertext, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

function rotatingCodeKey(secretSeed) {
  return crypto
    .createHash("sha256")
    .update(`${ROTATING_CODE_PREFIX}:${secretSeed}`)
    .digest();
}

export function computeRotatingCode(
  cardId,
  secretSeed,
  windowSeconds = ROTATING_CODE_WINDOW_SECONDS,
  timeWindow = null
) {
  const tw =
    timeWindow ?? Math.floor(Date.now() / 1000 / windowSeconds);
  const digest = crypto
    .createHmac("sha256", rotatingCodeKey(secretSeed))
    .update(`${cardId}:${tw}`)
    .digest("hex");
  const numeric = parseInt(digest.slice(0, 8), 16) % 1_000_000;
  return String(numeric).padStart(6, "0");
}

export function constantTimeEqual(a, b) {
  const left = String(a ?? "");
  const right = String(b ?? "");
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return mismatch === 0;
}

export function verifyRotatingCode(
  cardId,
  secretSeed,
  submittedCode,
  windowSeconds = ROTATING_CODE_WINDOW_SECONDS,
  trustTier = null
) {
  const normalized = String(submittedCode || "")
    .replace(/\D/g, "")
    .padStart(6, "0")
    .slice(-6);
  const tw = Math.floor(Date.now() / 1000 / windowSeconds);
  for (const offset of getVerifyWindowOffsets(windowSeconds, trustTier)) {
    const expected = computeRotatingCode(
      cardId,
      secretSeed,
      windowSeconds,
      tw + offset
    );
    if (constantTimeEqual(normalized, expected)) return true;
  }
  return false;
}

export function computePublicDisplayHash(displayName, username, purpose) {
  const canonical = [
    "prooforigin-public-display-v1",
    String(displayName || "").trim(),
    String(username || "").trim(),
    String(purpose || "").trim(),
  ].join("|");
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

export function computeCardStateHash({
  cardId,
  issuedAt,
  expiresAt,
  trustState,
  publicDisplayHash,
  voiceAnchorHash = "",
  identityCardVersion = IDENTITY_CARD_VERSION,
  previousStateHash = GENESIS_STATE_HASH,
}) {
  const canonical = [
    CARD_STATE_PREFIX,
    cardId,
    new Date(issuedAt).toISOString(),
    new Date(expiresAt).toISOString(),
    trustState,
    publicDisplayHash,
    voiceAnchorHash || "",
    identityCardVersion,
    previousStateHash,
  ].join("|");
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

export function buildFutureMetadata(overrides = {}) {
  const tierMeta = buildDefaultTierMetadata(overrides.trust_tier || "free");
  return {
    voice_anchor_hash: null,
    wallet_anchor_hash: null,
    recognition_history_ref: null,
    trustdna_score: null,
    bitcoin_anchor_batch_id: null,
    trust_tier: tierMeta.trust_tier,
    rotation_seconds: tierMeta.rotation_seconds,
    ...overrides,
  };
}

export function computeLegacyRotatingCode(cardId, secretToken) {
  const timeWindow = Math.floor(Date.now() / 1000 / ROTATING_CODE_WINDOW_SECONDS);
  const digest = crypto
    .createHash("sha256")
    .update(`${LEGACY_ROTATING_PREFIX}:${cardId}:${secretToken}:${timeWindow}`)
    .digest("hex");
  const numeric = parseInt(digest.slice(0, 8), 16) % 1_000_000;
  return String(numeric).padStart(6, "0");
}

/** @deprecated use buildVerificationPath from shared */
export function buildLegacyVerificationPath(cardId) {
  return `/identity-card?verify=${encodeURIComponent(cardId)}`;
}

// Back-compat aliases
export const generateSecretToken = generateSecretSeed;
export const hashSecretToken = hashSecretSeed;

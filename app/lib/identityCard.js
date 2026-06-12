import crypto from "crypto";
import {
  EXPIRATION_OPTIONS,
  GENESIS_STATE_HASH,
  IDENTITY_CARD_VERSION,
  ROTATING_CODE_WINDOW_SECONDS,
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
  isCardExpired,
  secondsUntilNextCode,
  formatCardDate,
  formatCardDateTime,
  resolveTrustState,
  cardUsesDtsAlgorithm,
  buildVerificationPath,
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

export function getMasterKey() {
  const source =
    process.env.PROOFORIGIN_DTS_MASTER_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "prooforigin-dts-dev-master-key";
  return crypto.createHash("sha256").update(source).digest();
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

export function verifyRotatingCode(cardId, secretSeed, submittedCode) {
  const normalized = String(submittedCode || "")
    .replace(/\D/g, "")
    .padStart(6, "0")
    .slice(-6);
  const tw = Math.floor(Date.now() / 1000 / ROTATING_CODE_WINDOW_SECONDS);
  for (const offset of [-1, 0, 1]) {
    const expected = computeRotatingCode(
      cardId,
      secretSeed,
      ROTATING_CODE_WINDOW_SECONDS,
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
  return {
    voice_anchor_hash: null,
    wallet_anchor_hash: null,
    recognition_history_ref: null,
    trustdna_score: null,
    bitcoin_anchor_batch_id: null,
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

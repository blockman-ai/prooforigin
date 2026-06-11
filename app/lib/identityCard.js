import crypto from "crypto";

export const IDENTITY_CARD_VERSION = "v1";
export const IDENTITY_CARD_STORAGE_KEY = "prooforigin_identity_card_v1";
export const ROTATING_CODE_WINDOW_SECONDS = 60;

export const EXPIRATION_OPTIONS = [
  { value: "1d", label: "1 day", days: 1 },
  { value: "1w", label: "1 week", days: 7 },
  { value: "2w", label: "2 weeks", days: 14 },
  { value: "1m", label: "1 month", days: 30 },
  { value: "4m", label: "4 months", days: 120 },
  { value: "6m", label: "6 months", days: 180 },
];

export const IDENTITY_DISCLAIMER =
  "This is a ProofOrigin online identity card. It is not a government ID or legal identity document.";

const ROTATING_PREFIX = "prooforigin-identity-v1";

export function generateCardId() {
  return crypto.randomUUID();
}

export function generateSecretToken() {
  return crypto.randomUUID();
}

export function hashSecretToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
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

export function computeRotatingCode(cardId, secretToken, windowSeconds = ROTATING_CODE_WINDOW_SECONDS) {
  const timeWindow = Math.floor(Date.now() / 1000 / windowSeconds);
  const digest = crypto
    .createHash("sha256")
    .update(`${ROTATING_PREFIX}:${cardId}:${secretToken}:${timeWindow}`)
    .digest("hex");
  const numeric = parseInt(digest.slice(0, 8), 16) % 1_000_000;
  return String(numeric).padStart(6, "0");
}

export function secondsUntilNextCode(windowSeconds = ROTATING_CODE_WINDOW_SECONDS) {
  const elapsed = Math.floor(Date.now() / 1000) % windowSeconds;
  return windowSeconds - elapsed;
}

export function formatCardDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function isCardExpired(expiresAt) {
  return new Date(expiresAt).getTime() <= Date.now();
}

export function buildVerificationPath(cardId) {
  return `/identity-card?verify=${encodeURIComponent(cardId)}`;
}

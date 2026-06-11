export const IDENTITY_CARD_VERSION = "dts-v1";
export const IDENTITY_CARD_STORAGE_KEY = "prooforigin_identity_card_v1";
export const ROTATING_CODE_WINDOW_SECONDS = 60;
export const GENESIS_STATE_HASH = "0".repeat(64);

export const TRUST_STATES = [
  "active",
  "expired",
  "revoked",
  "suspicious",
  "unverified",
];

export const STATE_EVENT_TYPES = [
  "created",
  "verified",
  "revoked",
  "expired",
  "suspicious",
  "renewed",
];

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

export function isCardExpired(expiresAt) {
  return new Date(expiresAt).getTime() <= Date.now();
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

export function formatCardDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function cardUsesDtsAlgorithm(card) {
  return (
    card?.identity_card_version === IDENTITY_CARD_VERSION ||
    card?.version === IDENTITY_CARD_VERSION
  );
}

export function resolveTrustState(card) {
  if (!card) return "unverified";
  if (card.revoked_at) return "revoked";
  if (card.trust_state === "suspicious") return "suspicious";
  if (isCardExpired(card.expires_at)) return "expired";
  return card.trust_state || "active";
}

export function formatTrustStateLabel(trustState) {
  if (!trustState) return "Unverified";
  return trustState.charAt(0).toUpperCase() + trustState.slice(1);
}

export function trustStateBadgeVariant(trustState) {
  switch (trustState) {
    case "active":
      return "success";
    case "expired":
      return "warning";
    case "revoked":
    case "suspicious":
      return "error";
    default:
      return "pending";
  }
}

export function buildVerificationPath(cardId) {
  return `/id/${encodeURIComponent(cardId)}`;
}

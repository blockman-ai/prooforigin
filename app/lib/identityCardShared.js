export const IDENTITY_CARD_VERSION = "dts-v1";
export const IDENTITY_CARD_STORAGE_KEY = "prooforigin_identity_card_v1";
export const ROTATING_CODE_WINDOW_SECONDS = 60;
export const GENESIS_STATE_HASH = "0".repeat(64);

export const TRUST_TIER_IDS = [
  "free",
  "plus",
  "professional",
  "business",
  "enterprise",
];

export const TIER_ROTATION_SECONDS = {
  free: 60,
  plus: 30,
  professional: 15,
  business: 3,
  enterprise: 3,
};

export const FAST_TIER_MAX_SECONDS = 3;

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

export function normalizeTrustTier(tier) {
  const normalized = String(tier || "free").trim().toLowerCase();
  if (TRUST_TIER_IDS.includes(normalized)) return normalized;
  return "free";
}

export function getTierRotationSeconds(tier) {
  return TIER_ROTATION_SECONDS[normalizeTrustTier(tier)];
}

export function resolveCardTrustTier(card) {
  const meta = card?.metadata && typeof card.metadata === "object" ? card.metadata : {};
  if (meta.trust_tier) return normalizeTrustTier(meta.trust_tier);
  if (card?.trust_tier) return normalizeTrustTier(card.trust_tier);
  return "free";
}

export function resolveCardRotationSeconds(card) {
  const meta = card?.metadata && typeof card.metadata === "object" ? card.metadata : {};
  const explicit = meta.rotation_seconds ?? card?.rotation_seconds;
  if (typeof explicit === "number" && explicit > 0) return explicit;
  if (typeof explicit === "string" && explicit.trim()) {
    const parsed = parseInt(explicit, 10);
    if (parsed > 0) return parsed;
  }
  return getTierRotationSeconds(resolveCardTrustTier(card));
}

export function formatTrustTierLabel(tier) {
  const normalized = normalizeTrustTier(tier);
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

/** Drift windows for server verify: ±1 for standard tiers; current + previous only for 3s tiers. */
export function getVerifyWindowOffsets(windowSeconds) {
  if (windowSeconds <= FAST_TIER_MAX_SECONDS) return [-1, 0];
  return [-1, 0, 1];
}

export function buildDefaultTierMetadata(tier = "free") {
  const trust_tier = normalizeTrustTier(tier);
  return {
    trust_tier,
    rotation_seconds: getTierRotationSeconds(trust_tier),
  };
}

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

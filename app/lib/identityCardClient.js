import {
  IDENTITY_CARD_STORAGE_KEY,
  ROTATING_CODE_WINDOW_SECONDS,
  isCardExpired,
} from "./identityCard";

const ROTATING_PREFIX = "prooforigin-identity-v1";

export async function computeRotatingCodeAsync(
  cardId,
  secretToken,
  windowSeconds = ROTATING_CODE_WINDOW_SECONDS
) {
  const timeWindow = Math.floor(Date.now() / 1000 / windowSeconds);
  const message = `${ROTATING_PREFIX}:${cardId}:${secretToken}:${timeWindow}`;
  const data = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const numeric = parseInt(hex.slice(0, 8), 16) % 1_000_000;
  return String(numeric).padStart(6, "0");
}

export function readStoredIdentityCard() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(IDENTITY_CARD_STORAGE_KEY);
    if (!raw) return null;
    const card = JSON.parse(raw);
    if (!card?.expires_at || isCardExpired(card.expires_at)) {
      window.localStorage.removeItem(IDENTITY_CARD_STORAGE_KEY);
      return null;
    }
    return card;
  } catch {
    return null;
  }
}

export function writeStoredIdentityCard(card) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(IDENTITY_CARD_STORAGE_KEY, JSON.stringify(card));
}

export function clearStoredIdentityCard() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(IDENTITY_CARD_STORAGE_KEY);
}

export function buildVerificationUrl(cardId) {
  if (typeof window === "undefined") return `/identity-card?verify=${cardId}`;
  return `${window.location.origin}/identity-card?verify=${encodeURIComponent(cardId)}`;
}

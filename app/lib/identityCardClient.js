import {
  IDENTITY_CARD_STORAGE_KEY,
  ROTATING_CODE_WINDOW_SECONDS,
  cardUsesDtsAlgorithm,
  isCardExpired,
  secondsUntilNextCode,
} from "./identityCardShared";

const ROTATING_CODE_PREFIX = "prooforigin-dts-code-v1";
const LEGACY_ROTATING_PREFIX = "prooforigin-identity-v1";

async function importHmacKey(secretSeed) {
  const keyMaterial = new TextEncoder().encode(`${ROTATING_CODE_PREFIX}:${secretSeed}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", keyMaterial);
  return crypto.subtle.importKey(
    "raw",
    hashBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

export async function computeRotatingCodeAsync(
  cardId,
  secretSeed,
  windowSeconds = ROTATING_CODE_WINDOW_SECONDS
) {
  const tw = Math.floor(Date.now() / 1000 / windowSeconds);
  const key = await importHmacKey(secretSeed);
  const message = new TextEncoder().encode(`${cardId}:${tw}`);
  const signature = await crypto.subtle.sign("HMAC", key, message);
  const hashArray = Array.from(new Uint8Array(signature));
  const hex = hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const numeric = parseInt(hex.slice(0, 8), 16) % 1_000_000;
  return String(numeric).padStart(6, "0");
}

async function computeLegacyRotatingCodeAsync(cardId, secretToken) {
  const tw = Math.floor(Date.now() / 1000 / ROTATING_CODE_WINDOW_SECONDS);
  const message = `${LEGACY_ROTATING_PREFIX}:${cardId}:${secretToken}:${tw}`;
  const data = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const numeric = parseInt(hex.slice(0, 8), 16) % 1_000_000;
  return String(numeric).padStart(6, "0");
}

export async function computeCardRotatingCode(card) {
  const secret = card?.secret_seed || card?.secret_token;
  if (!card?.card_id || !secret) return "------";
  if (cardUsesDtsAlgorithm(card)) {
    return computeRotatingCodeAsync(card.card_id, secret);
  }
  return computeLegacyRotatingCodeAsync(card.card_id, secret);
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

  try {
    window.localStorage.setItem(IDENTITY_CARD_STORAGE_KEY, JSON.stringify(card));
  } catch (err) {
    if (err?.name === "QuotaExceededError" && card?.photo_preview) {
      const { photo_preview: _photo, ...cardWithoutPhoto } = card;
      window.localStorage.setItem(
        IDENTITY_CARD_STORAGE_KEY,
        JSON.stringify(cardWithoutPhoto)
      );
      throw new Error(
        "Photo could not be saved — browser storage is full. Card saved without photo."
      );
    }

    throw new Error("Could not save card in this browser. Clear site data and try again.");
  }
}

export function clearStoredIdentityCard() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(IDENTITY_CARD_STORAGE_KEY);
}

export function buildVerificationUrl(cardId) {
  if (typeof window === "undefined") return `/id/${cardId}`;
  return `${window.location.origin}/id/${encodeURIComponent(cardId)}`;
}

export { secondsUntilNextCode };

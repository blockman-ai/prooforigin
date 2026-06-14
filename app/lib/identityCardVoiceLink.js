import {
  decryptSecretSeed,
  hashSecretSeed,
  resolveTrustState,
} from "./identityCard.js";
import { hashEnrollmentToken } from "./voiceAnchor.js";

export const VOICE_ANCHOR_LINK_VERSION = "v1";
export const IDENTITY_CARDS_TABLE = "identity_cards";
export const VOICE_ENROLLMENTS_TABLE = "voice_anchor_enrollments";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(value) {
  return UUID_PATTERN.test(String(value || "").trim());
}

export function verifyCardSecretSeed(card, secretSeed) {
  if (!card || !secretSeed) {
    return false;
  }

  const hashMatches = hashSecretSeed(secretSeed) === card.secret_token_hash;
  if (hashMatches) {
    return true;
  }

  if (card.secret_ciphertext && card.secret_nonce) {
    try {
      return decryptSecretSeed(card.secret_ciphertext, card.secret_nonce) === secretSeed;
    } catch {
      return false;
    }
  }

  return false;
}

export function isCardLinkable(card) {
  if (!card) {
    return false;
  }

  const trustState = resolveTrustState(card);
  return trustState === "active";
}

export function buildPublicVoiceAnchorFromCard(card) {
  const metadata = card?.metadata && typeof card.metadata === "object" ? card.metadata : {};
  const linked = Boolean(card?.voice_anchor_hash);

  if (!linked) {
    return {
      linked: false,
      linked_at: null,
      version: null,
    };
  }

  return {
    linked: true,
    linked_at: metadata.voice_anchor_linked_at || null,
    version: metadata.voice_anchor_version || VOICE_ANCHOR_LINK_VERSION,
  };
}

export function mergeCardMetadata(card, patch) {
  const existing =
    card?.metadata && typeof card.metadata === "object" && !Array.isArray(card.metadata)
      ? card.metadata
      : {};

  return {
    ...existing,
    ...patch,
  };
}

export async function loadActiveEnrollment(supabase, enrollmentId, enrollmentToken) {
  const tokenHash = hashEnrollmentToken(enrollmentToken);
  const { data, error } = await supabase
    .from(VOICE_ENROLLMENTS_TABLE)
    .select("id, fingerprint_hash, deleted_at, enrollment_token_hash")
    .eq("id", enrollmentId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data || data.deleted_at) {
    return { enrollment: null, reason: "not_found" };
  }

  if (data.enrollment_token_hash !== tokenHash) {
    return { enrollment: null, reason: "invalid_credentials" };
  }

  return { enrollment: data, reason: null };
}

export async function findConflictingLinkedCard(supabase, fingerprintHash, excludeCardId) {
  const { data, error } = await supabase
    .from(IDENTITY_CARDS_TABLE)
    .select(
      "id, display_name, username, purpose, issued_at, expires_at, revoked_at, trust_state, voice_anchor_hash, identity_card_version, metadata"
    )
    .eq("voice_anchor_hash", fingerprintHash)
    .neq("id", excludeCardId);

  if (error) {
    throw error;
  }

  for (const candidate of data || []) {
    if (isCardLinkable(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function buildLinkMetadata(linkedAt = new Date().toISOString()) {
  return {
    voice_anchor_linked_at: linkedAt,
    voice_anchor_version: VOICE_ANCHOR_LINK_VERSION,
    voice_anchor_unlinked_at: null,
  };
}

export function buildUnlinkMetadata(existingMetadata, unlinkedAt = new Date().toISOString()) {
  return {
    ...existingMetadata,
    voice_anchor_unlinked_at: unlinkedAt,
  };
}

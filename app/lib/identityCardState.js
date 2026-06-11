import {
  computeCardStateHash,
  computePublicDisplayHash,
  GENESIS_STATE_HASH,
  IDENTITY_CARD_VERSION,
} from "./identityCard";

const EVENTS_TABLE = "identity_card_state_events";
const CARDS_TABLE = "identity_cards";

export async function getLatestStateHash(supabase, cardId) {
  const { data, error } = await supabase
    .from(EVENTS_TABLE)
    .select("card_state_hash")
    .eq("card_id", cardId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.card_state_hash || GENESIS_STATE_HASH;
}

export async function appendStateEvent(supabase, {
  cardId,
  eventType,
  trustState,
  card,
  voiceAnchorHash = "",
  metadata = {},
}) {
  const previousStateHash = await getLatestStateHash(supabase, cardId);
  const publicDisplayHash = computePublicDisplayHash(
    card.display_name,
    card.username,
    card.purpose
  );
  const cardStateHash = computeCardStateHash({
    cardId,
    issuedAt: card.issued_at,
    expiresAt: card.expires_at,
    trustState,
    publicDisplayHash,
    voiceAnchorHash: voiceAnchorHash || card.voice_anchor_hash || "",
    identityCardVersion: card.identity_card_version || IDENTITY_CARD_VERSION,
    previousStateHash,
  });

  const { data, error } = await supabase
    .from(EVENTS_TABLE)
    .insert({
      card_id: cardId,
      event_type: eventType,
      trust_state: trustState,
      previous_state_hash: previousStateHash,
      card_state_hash: cardStateHash,
      public_display_hash: publicDisplayHash,
      voice_anchor_hash: voiceAnchorHash || card.voice_anchor_hash || null,
      identity_card_version: card.identity_card_version || IDENTITY_CARD_VERSION,
      metadata,
    })
    .select("id, event_type, trust_state, card_state_hash, previous_state_hash, created_at")
    .single();

  if (error) throw error;

  const { error: updateError } = await supabase
    .from(CARDS_TABLE)
    .update({
      trust_state: trustState,
      latest_state_hash: cardStateHash,
      public_display_hash: publicDisplayHash,
    })
    .eq("id", cardId);

  if (updateError) throw updateError;

  return data;
}

export async function ensureExpiredStateEvent(supabase, card) {
  if (!card?.id || !card.expires_at) return null;
  if (new Date(card.expires_at).getTime() > Date.now()) return null;
  if (card.trust_state === "expired" || card.revoked_at) return null;

  return appendStateEvent(supabase, {
    cardId: card.id,
    eventType: "expired",
    trustState: "expired",
    card,
    metadata: { source: "auto_expiry" },
  });
}

export async function getTrustHistory(supabase, cardId, limit = 20) {
  const { data, error } = await supabase
    .from(EVENTS_TABLE)
    .select(
      "id, event_type, trust_state, card_state_hash, previous_state_hash, created_at"
    )
    .eq("card_id", cardId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

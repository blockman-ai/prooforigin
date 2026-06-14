import { NextResponse } from "next/server";
import { resolveTrustState, resolveCardRotationSeconds, resolveCardTrustTier } from "../../../../lib/identityCard";
import { buildPublicVoiceAnchorFromCard } from "../../../../lib/identityCardVoiceLink";
import {
  ensureExpiredStateEvent,
  getTrustHistory,
} from "../../../../lib/identityCardState";
import {
  getSupabaseAdmin,
  isSupabaseAdminConfigured,
} from "../../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const CARDS_TABLE = "identity_cards";

export async function GET(_req, { params }) {
  try {
    const cardId = String(params?.cardId || "").trim();
    if (!cardId) {
      return NextResponse.json(
        { success: false, error: "Card id is required." },
        { status: 400 }
      );
    }

    if (!isSupabaseAdminConfigured()) {
      return NextResponse.json({
        success: true,
        stored: false,
        card: null,
        trust_history: [],
        message: "Public verification requires Supabase configuration.",
      });
    }

    const supabase = getSupabaseAdmin();
    const { data: card, error } = await supabase
      .from(CARDS_TABLE)
      .select(
        "id, display_name, username, purpose, issued_at, expires_at, revoked_at, trust_state, latest_state_hash, verification_count, last_verified_at, identity_card_version, metadata, voice_anchor_hash"
      )
      .eq("id", cardId)
      .maybeSingle();

    if (error) throw error;
    if (!card) {
      return NextResponse.json(
        { success: false, error: "Trust pass not found." },
        { status: 404 }
      );
    }

    await ensureExpiredStateEvent(supabase, card);

    const { data: refreshedCard } = await supabase
      .from(CARDS_TABLE)
      .select(
        "id, display_name, username, purpose, issued_at, expires_at, revoked_at, trust_state, latest_state_hash, verification_count, last_verified_at, identity_card_version, metadata, voice_anchor_hash"
      )
      .eq("id", cardId)
      .maybeSingle();

    const activeCard = refreshedCard || card;
    const trustState = resolveTrustState(activeCard);
    const trustHistory = await getTrustHistory(supabase, cardId);
    const rotationSeconds = resolveCardRotationSeconds(activeCard);
    const voiceAnchor = buildPublicVoiceAnchorFromCard(activeCard);

    return NextResponse.json({
      success: true,
      stored: true,
      card: {
        card_id: activeCard.id,
        display_name: activeCard.display_name,
        username: activeCard.username,
        purpose: activeCard.purpose,
        issued_at: activeCard.issued_at,
        expires_at: activeCard.expires_at,
        trust_state: trustState,
        latest_state_hash: activeCard.latest_state_hash,
        verification_count: activeCard.verification_count || 0,
        last_verified_at: activeCard.last_verified_at,
        verification_status: activeCard.last_verified_at
          ? "Previously verified"
          : "Awaiting verification",
        identity_card_version: activeCard.identity_card_version,
        trust_tier: resolveCardTrustTier(activeCard),
        rotation_seconds: rotationSeconds,
      },
      voice_anchor: voiceAnchor,
      trust_history: trustHistory,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Could not load trust pass.",
      },
      { status: 500 }
    );
  }
}

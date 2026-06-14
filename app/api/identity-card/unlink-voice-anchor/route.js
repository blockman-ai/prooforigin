import { NextResponse } from "next/server";
import { getDtsConfigurationError } from "../../../lib/identityCard";
import { appendStateEvent } from "../../../lib/identityCardState";
import {
  buildPublicVoiceAnchorFromCard,
  buildUnlinkMetadata,
  IDENTITY_CARDS_TABLE,
  isCardLinkable,
  isValidUuid,
  mergeCardMetadata,
  verifyCardSecretSeed,
} from "../../../lib/identityCardVoiceLink";
import {
  checkRateLimit,
  getClientRateLimitKey,
} from "../../../lib/identityCardRateLimit";
import {
  getSupabaseAdmin,
  isSupabaseAdminConfigured,
} from "../../../lib/supabaseAdmin";
import {
  recordTrustVoiceLinkSentinelCounter,
  TRUST_VOICE_LINK_SENTINEL_COUNTERS,
} from "../../../lib/trustVoiceLinkSentinelCounters";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const cardId = String(body.card_id || "").trim();
    const secretSeed = String(body.secret_seed || body.secret_token || "").trim();
    const consent = body.consent === true;

    if (!consent) {
      return NextResponse.json(
        { success: false, error: "Consent is required to unlink a voice anchor." },
        { status: 400 }
      );
    }

    if (!cardId || !secretSeed) {
      return NextResponse.json(
        { success: false, error: "card_id and secret_seed are required." },
        { status: 400 }
      );
    }

    if (!isValidUuid(cardId)) {
      recordTrustVoiceLinkSentinelCounter(TRUST_VOICE_LINK_SENTINEL_COUNTERS.INVALID_CREDENTIALS);
      return NextResponse.json(
        { success: false, error: "Invalid unlink request." },
        { status: 400 }
      );
    }

    const rateKey = getClientRateLimitKey(req, `unlink-voice:${cardId}`);
    const rate = checkRateLimit(rateKey, 8, 60_000);
    if (!rate.allowed) {
      recordTrustVoiceLinkSentinelCounter(TRUST_VOICE_LINK_SENTINEL_COUNTERS.RATE_LIMITED);
      return NextResponse.json(
        {
          success: false,
          error: "Too many unlink attempts. Try again shortly.",
          retry_after_ms: rate.retryAfterMs,
        },
        { status: 429 }
      );
    }

    if (!isSupabaseAdminConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error: "Voice unlinking requires Supabase configuration.",
        },
        { status: 503 }
      );
    }

    const dtsConfigError = getDtsConfigurationError();
    if (dtsConfigError) {
      recordTrustVoiceLinkSentinelCounter(TRUST_VOICE_LINK_SENTINEL_COUNTERS.SERVER_ERROR);
      return NextResponse.json({ success: false, error: dtsConfigError }, { status: 503 });
    }

    const supabase = getSupabaseAdmin();
    const { data: card, error: cardError } = await supabase
      .from(IDENTITY_CARDS_TABLE)
      .select("*")
      .eq("id", cardId)
      .maybeSingle();

    if (cardError) {
      throw cardError;
    }

    if (!card) {
      recordTrustVoiceLinkSentinelCounter(TRUST_VOICE_LINK_SENTINEL_COUNTERS.NOT_FOUND);
      return NextResponse.json(
        { success: false, error: "Trust pass not found." },
        { status: 404 }
      );
    }

    if (!isCardLinkable(card)) {
      recordTrustVoiceLinkSentinelCounter(TRUST_VOICE_LINK_SENTINEL_COUNTERS.NOT_FOUND);
      return NextResponse.json(
        { success: false, error: "Trust pass is not active." },
        { status: 403 }
      );
    }

    if (!verifyCardSecretSeed(card, secretSeed)) {
      recordTrustVoiceLinkSentinelCounter(TRUST_VOICE_LINK_SENTINEL_COUNTERS.INVALID_CREDENTIALS);
      return NextResponse.json(
        { success: false, error: "Invalid unlink credentials." },
        { status: 403 }
      );
    }

    if (!card.voice_anchor_hash) {
      return NextResponse.json({
        success: true,
        stored: true,
        voice_anchor: buildPublicVoiceAnchorFromCard({ ...card, voice_anchor_hash: null }),
        latest_state_hash: card.latest_state_hash,
        message: "Voice anchor is not linked.",
      });
    }

    const unlinkedAt = new Date().toISOString();
    const metadata = buildUnlinkMetadata(mergeCardMetadata(card, {}), unlinkedAt);
    const updatedCard = {
      ...card,
      voice_anchor_hash: null,
      metadata,
    };

    const { error: updateError } = await supabase
      .from(IDENTITY_CARDS_TABLE)
      .update({
        voice_anchor_hash: null,
        metadata,
      })
      .eq("id", cardId);

    if (updateError) {
      throw updateError;
    }

    const stateEvent = await appendStateEvent(supabase, {
      cardId,
      eventType: "renewed",
      trustState: card.trust_state || "active",
      card: updatedCard,
      voiceAnchorHash: "",
      metadata: { source: "voice_unlink" },
    });

    recordTrustVoiceLinkSentinelCounter(TRUST_VOICE_LINK_SENTINEL_COUNTERS.UNLINK_SUCCESS);

    return NextResponse.json({
      success: true,
      stored: true,
      voice_anchor: buildPublicVoiceAnchorFromCard(updatedCard),
      latest_state_hash: stateEvent.card_state_hash,
      message: "Voice anchor unlinked.",
    });
  } catch (error) {
    recordTrustVoiceLinkSentinelCounter(TRUST_VOICE_LINK_SENTINEL_COUNTERS.SERVER_ERROR);
    return NextResponse.json(
      { success: false, error: error.message || "Voice anchor unlink failed." },
      { status: 500 }
    );
  }
}

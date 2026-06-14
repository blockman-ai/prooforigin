import { NextResponse } from "next/server";
import { getDtsConfigurationError } from "../../../lib/identityCard";
import { appendStateEvent } from "../../../lib/identityCardState";
import {
  buildLinkMetadata,
  buildPublicVoiceAnchorFromCard,
  findConflictingLinkedCard,
  IDENTITY_CARDS_TABLE,
  isCardLinkable,
  isValidUuid,
  loadActiveEnrollment,
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
    const enrollmentId = String(body.enrollment_id || "").trim();
    const enrollmentToken = String(body.enrollment_token || "").trim();
    const consent = body.consent === true;

    if (!consent) {
      return NextResponse.json(
        { success: false, error: "Consent is required to link a voice anchor." },
        { status: 400 }
      );
    }

    if (!cardId || !secretSeed || !enrollmentId || !enrollmentToken) {
      return NextResponse.json(
        {
          success: false,
          error: "card_id, secret_seed, enrollment_id, and enrollment_token are required.",
        },
        { status: 400 }
      );
    }

    if (!isValidUuid(cardId) || !isValidUuid(enrollmentId) || !isValidUuid(enrollmentToken)) {
      recordTrustVoiceLinkSentinelCounter(TRUST_VOICE_LINK_SENTINEL_COUNTERS.INVALID_CREDENTIALS);
      return NextResponse.json(
        { success: false, error: "Invalid link request." },
        { status: 400 }
      );
    }

    const rateKey = getClientRateLimitKey(req, `link-voice:${cardId}`);
    const rate = checkRateLimit(rateKey, 8, 60_000);
    if (!rate.allowed) {
      recordTrustVoiceLinkSentinelCounter(TRUST_VOICE_LINK_SENTINEL_COUNTERS.RATE_LIMITED);
      return NextResponse.json(
        {
          success: false,
          error: "Too many link attempts. Try again shortly.",
          retry_after_ms: rate.retryAfterMs,
        },
        { status: 429 }
      );
    }

    if (!isSupabaseAdminConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error: "Voice linking requires Supabase configuration.",
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
        { success: false, error: "Invalid link credentials." },
        { status: 403 }
      );
    }

    const { enrollment, reason: enrollmentReason } = await loadActiveEnrollment(
      supabase,
      enrollmentId,
      enrollmentToken
    );

    if (!enrollment) {
      recordTrustVoiceLinkSentinelCounter(
        enrollmentReason === "invalid_credentials"
          ? TRUST_VOICE_LINK_SENTINEL_COUNTERS.INVALID_CREDENTIALS
          : TRUST_VOICE_LINK_SENTINEL_COUNTERS.NOT_FOUND
      );
      return NextResponse.json(
        { success: false, error: "Voice enrollment not found or invalid." },
        { status: enrollmentReason === "invalid_credentials" ? 403 : 404 }
      );
    }

    if (
      card.voice_anchor_hash &&
      card.voice_anchor_hash !== enrollment.fingerprint_hash
    ) {
      recordTrustVoiceLinkSentinelCounter(TRUST_VOICE_LINK_SENTINEL_COUNTERS.ALREADY_LINKED);
      return NextResponse.json(
        {
          success: false,
          error: "This trust pass is already linked to a different voice anchor.",
        },
        { status: 409 }
      );
    }

    if (card.voice_anchor_hash === enrollment.fingerprint_hash) {
      recordTrustVoiceLinkSentinelCounter(TRUST_VOICE_LINK_SENTINEL_COUNTERS.SUCCESS);
      return NextResponse.json({
        success: true,
        stored: true,
        voice_anchor: buildPublicVoiceAnchorFromCard(card),
        latest_state_hash: card.latest_state_hash,
        message:
          "Voice anchor already linked. This is a documentation signal, not live voice verification.",
      });
    }

    const conflictingCard = await findConflictingLinkedCard(
      supabase,
      enrollment.fingerprint_hash,
      cardId
    );

    if (conflictingCard) {
      recordTrustVoiceLinkSentinelCounter(TRUST_VOICE_LINK_SENTINEL_COUNTERS.ALREADY_LINKED);
      return NextResponse.json(
        {
          success: false,
          error: "This voice enrollment is already linked to another active trust pass.",
        },
        { status: 409 }
      );
    }

    const linkedAt = new Date().toISOString();
    const metadata = mergeCardMetadata(card, buildLinkMetadata(linkedAt));
    const updatedCard = {
      ...card,
      voice_anchor_hash: enrollment.fingerprint_hash,
      metadata,
    };

    const { error: updateError } = await supabase
      .from(IDENTITY_CARDS_TABLE)
      .update({
        voice_anchor_hash: enrollment.fingerprint_hash,
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
      voiceAnchorHash: enrollment.fingerprint_hash,
      metadata: { source: "voice_link" },
    });

    recordTrustVoiceLinkSentinelCounter(TRUST_VOICE_LINK_SENTINEL_COUNTERS.SUCCESS);

    return NextResponse.json({
      success: true,
      stored: true,
      voice_anchor: buildPublicVoiceAnchorFromCard(updatedCard),
      latest_state_hash: stateEvent.card_state_hash,
      message:
        "Voice anchor linked. This is a documentation signal, not live voice verification.",
    });
  } catch (error) {
    recordTrustVoiceLinkSentinelCounter(TRUST_VOICE_LINK_SENTINEL_COUNTERS.SERVER_ERROR);
    return NextResponse.json(
      { success: false, error: error.message || "Voice anchor link failed." },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import {
  decryptSecretSeed,
  isCardExpired,
  resolveTrustState,
  verifyRotatingCode,
} from "../../../lib/identityCard";
import {
  checkRateLimit,
  getClientRateLimitKey,
} from "../../../lib/identityCardRateLimit";
import {
  appendStateEvent,
  ensureExpiredStateEvent,
} from "../../../lib/identityCardState";
import {
  getSupabaseAdmin,
  isSupabaseAdminConfigured,
} from "../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const CARDS_TABLE = "identity_cards";

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const cardId = String(body.card_id || "").trim();
    const currentCode = String(body.current_code || "").trim();

    if (!cardId || !currentCode) {
      return NextResponse.json(
        { success: false, error: "card_id and current_code are required." },
        { status: 400 }
      );
    }

    if (!/^\d{6}$/.test(currentCode.replace(/\s/g, ""))) {
      return NextResponse.json(
        { success: false, error: "Trust code must be a 6-digit number." },
        { status: 400 }
      );
    }

    const rateKey = getClientRateLimitKey(req, `verify-code:${cardId}`);
    const rate = checkRateLimit(rateKey, 12, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Too many verification attempts. Try again shortly.",
          retry_after_ms: rate.retryAfterMs,
        },
        { status: 429 }
      );
    }

    if (!isSupabaseAdminConfigured()) {
      return NextResponse.json(
        {
          success: false,
          valid: false,
          trust_state: "unverified",
          error: "Server verification requires Supabase configuration.",
        },
        { status: 503 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: card, error } = await supabase
      .from(CARDS_TABLE)
      .select("*")
      .eq("id", cardId)
      .maybeSingle();

    if (error) throw error;
    if (!card) {
      return NextResponse.json({
        success: true,
        valid: false,
        trust_state: "unverified",
        expires_at: null,
        verified_at: null,
      });
    }

    await ensureExpiredStateEvent(supabase, card);

    const { data: refreshedCard } = await supabase
      .from(CARDS_TABLE)
      .select("*")
      .eq("id", cardId)
      .maybeSingle();

    const activeCard = refreshedCard || card;
    const trustState = resolveTrustState(activeCard);
    const verifiedAt = new Date().toISOString();

    if (trustState === "revoked" || trustState === "suspicious") {
      return NextResponse.json({
        success: true,
        valid: false,
        trust_state: trustState,
        expires_at: activeCard.expires_at,
        verified_at: verifiedAt,
      });
    }

    if (isCardExpired(activeCard.expires_at) || trustState === "expired") {
      return NextResponse.json({
        success: true,
        valid: false,
        trust_state: "expired",
        expires_at: activeCard.expires_at,
        verified_at: verifiedAt,
      });
    }

    if (!activeCard.secret_ciphertext || !activeCard.secret_nonce) {
      return NextResponse.json({
        success: true,
        valid: false,
        trust_state: trustState,
        expires_at: activeCard.expires_at,
        verified_at: verifiedAt,
        error:
          "This card cannot be server-verified yet. Create a new card after running the DTS migration.",
      });
    }

    let secretSeed;
    try {
      secretSeed = decryptSecretSeed(
        activeCard.secret_ciphertext,
        activeCard.secret_nonce
      );
    } catch {
      return NextResponse.json(
        { success: false, error: "Unable to verify trust code." },
        { status: 500 }
      );
    }

    const valid = verifyRotatingCode(cardId, secretSeed, currentCode);

    if (valid) {
      await appendStateEvent(supabase, {
        cardId,
        eventType: "verified",
        trustState: "active",
        card: activeCard,
        metadata: { source: "verify-code" },
      });

      await supabase
        .from(CARDS_TABLE)
        .update({
          verification_count: (activeCard.verification_count || 0) + 1,
          last_verified_at: verifiedAt,
          trust_state: "active",
        })
        .eq("id", cardId);
    }

    return NextResponse.json({
      success: true,
      valid,
      trust_state: valid ? "active" : trustState,
      expires_at: activeCard.expires_at,
      verified_at: verifiedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Trust code verification failed.",
      },
      { status: 500 }
    );
  }
}

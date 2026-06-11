import { NextResponse } from "next/server";
import { decryptSecretSeed, hashSecretSeed } from "../../../lib/identityCard";
import { appendStateEvent } from "../../../lib/identityCardState";
import {
  getSupabaseAdmin,
  isSupabaseAdminConfigured,
} from "../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const TABLE = "identity_cards";

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const cardId = String(body.card_id || "").trim();
    const secretSeed = String(body.secret_seed || body.secret_token || "").trim();

    if (!cardId || !secretSeed) {
      return NextResponse.json(
        { success: false, error: "card_id and secret_seed are required." },
        { status: 400 }
      );
    }

    if (!isSupabaseAdminConfigured()) {
      return NextResponse.json({
        success: true,
        stored: false,
        message: "Revoke recorded locally only.",
      });
    }

    const supabase = getSupabaseAdmin();
    const { data: card, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("id", cardId)
      .maybeSingle();

    if (error) throw error;
    if (!card) {
      return NextResponse.json(
        { success: false, error: "Trust pass not found." },
        { status: 404 }
      );
    }

    const hashMatches = hashSecretSeed(secretSeed) === card.secret_token_hash;
    let seedMatches = hashMatches;

    if (!seedMatches && card.secret_ciphertext && card.secret_nonce) {
      try {
        const decrypted = decryptSecretSeed(card.secret_ciphertext, card.secret_nonce);
        seedMatches = decrypted === secretSeed;
      } catch {
        seedMatches = false;
      }
    }

    if (!seedMatches) {
      return NextResponse.json(
        { success: false, error: "Invalid revoke credentials." },
        { status: 403 }
      );
    }

    const revokedAt = new Date().toISOString();
    await supabase
      .from(TABLE)
      .update({ revoked_at: revokedAt, trust_state: "revoked" })
      .eq("id", cardId);

    await appendStateEvent(supabase, {
      cardId,
      eventType: "revoked",
      trustState: "revoked",
      card,
      metadata: { source: "holder_revoke" },
    });

    return NextResponse.json({
      success: true,
      stored: true,
      trust_state: "revoked",
      message: "Trust pass revoked.",
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message || "Revoke failed." },
      { status: 500 }
    );
  }
}

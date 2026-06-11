import { NextResponse } from "next/server";
import {
  computeExpirationDate,
  generateCardId,
  generateSecretToken,
  getExpirationOption,
  hashSecretToken,
  IDENTITY_CARD_VERSION,
  isCardExpired,
} from "../../../lib/identityCard";
import {
  getSupabaseAdmin,
  isSupabaseAdminConfigured,
} from "../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const TABLE = "identity_cards";

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const displayName = String(body.display_name || "").trim();
    const username = String(body.username || "").trim();
    const purpose = String(body.purpose || "").trim();
    const expirationKey = String(body.expiration_key || "").trim();
    const consent = body.consent === true;

    if (!consent) {
      return NextResponse.json(
        { success: false, error: "Consent to the online identity disclaimer is required." },
        { status: 400 }
      );
    }

    if (!displayName || displayName.length > 80) {
      return NextResponse.json(
        { success: false, error: "Display name is required (max 80 characters)." },
        { status: 400 }
      );
    }

    if (username.length > 40) {
      return NextResponse.json(
        { success: false, error: "Username must be 40 characters or fewer." },
        { status: 400 }
      );
    }

    if (purpose.length > 240) {
      return NextResponse.json(
        { success: false, error: "Purpose note must be 240 characters or fewer." },
        { status: 400 }
      );
    }

    const expiration = getExpirationOption(expirationKey);
    if (!expiration) {
      return NextResponse.json(
        { success: false, error: "Choose a valid expiration period." },
        { status: 400 }
      );
    }

    const cardId = generateCardId();
    const secretToken = generateSecretToken();
    const secretTokenHash = hashSecretToken(secretToken);
    const issuedAt = new Date();
    const expiresAt = computeExpirationDate(issuedAt, expirationKey);

    const card = {
      card_id: cardId,
      secret_token: secretToken,
      display_name: displayName,
      username: username || null,
      purpose: purpose || null,
      expiration_key: expirationKey,
      issued_at: issuedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    };

    if (isSupabaseAdminConfigured()) {
      try {
        const supabase = getSupabaseAdmin();
        const { error } = await supabase.from(TABLE).insert({
          id: cardId,
          secret_token_hash: secretTokenHash,
          display_name: displayName,
          username: username || null,
          purpose: purpose || null,
          expiration_key: expirationKey,
          issued_at: issuedAt.toISOString(),
          expires_at: expiresAt.toISOString(),
          metadata: { version: IDENTITY_CARD_VERSION },
        });

        if (error) throw error;

        return NextResponse.json({
          success: true,
          stored: true,
          card,
          message: "Online identity card metadata saved. Photo was not stored.",
        });
      } catch (dbError) {
        return NextResponse.json({
          success: true,
          stored: false,
          card,
          warning:
            dbError.message ||
            "Database unavailable. Card created locally only.",
          message:
            "Card created in this browser. Run docs/sql/identity_cards.sql to enable persistence.",
        });
      }
    }

    return NextResponse.json({
      success: true,
      stored: false,
      card,
      warning: "Supabase service role is not configured. Card stored in this browser only.",
      message: "Online identity card created locally.",
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message || "Identity card creation failed." },
      { status: 500 }
    );
  }
}

export async function GET(req) {
  const cardId = new URL(req.url).searchParams.get("verify");
  if (!cardId) {
    return NextResponse.json(
      { success: false, error: "Missing verify card id." },
      { status: 400 }
    );
  }

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({
      success: true,
      stored: false,
      message: "Verification lookup is not available in demo mode.",
    });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from(TABLE)
      .select("id, display_name, username, purpose, issued_at, expires_at, revoked_at")
      .eq("id", cardId)
      .is("revoked_at", null)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { success: false, error: "Card not found." },
        { status: 404 }
      );
    }

    if (isCardExpired(data.expires_at)) {
      return NextResponse.json(
        { success: false, error: "This card has expired." },
        { status: 410 }
      );
    }

    return NextResponse.json({
      success: true,
      stored: true,
      card: {
        card_id: data.id,
        display_name: data.display_name,
        username: data.username,
        purpose: data.purpose,
        issued_at: data.issued_at,
        expires_at: data.expires_at,
      },
      message: "Card metadata found. Rotating code verification requires the holder's device in V1.",
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message || "Verification lookup failed." },
      { status: 500 }
    );
  }
}

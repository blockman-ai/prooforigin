import { NextResponse } from "next/server";
import {
  computeExpirationDate,
  computePublicDisplayHash,
  encryptSecretSeed,
  generateCardId,
  generateSecretSeed,
  hashSecretSeed,
  getExpirationOption,
  IDENTITY_CARD_VERSION,
  buildFutureMetadata,
  buildDefaultTierMetadata,
  getDtsConfigurationError,
} from "../../../lib/identityCard";
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

    const tierMeta = buildDefaultTierMetadata("free");
    const dtsConfigError = getDtsConfigurationError();

    const cardId = generateCardId();
    const secretSeed = generateSecretSeed();
    const secretTokenHash = hashSecretSeed(secretSeed);

    let secret_ciphertext;
    let secret_nonce;
    try {
      ({ secret_ciphertext, secret_nonce } = encryptSecretSeed(secretSeed));
    } catch (encryptError) {
      return NextResponse.json(
        {
          success: false,
          error: encryptError.message || "Dynamic Trust State encryption is not configured.",
        },
        { status: 503 }
      );
    }

    const issuedAt = new Date();
    const expiresAt = computeExpirationDate(issuedAt, expirationKey);
    const publicDisplayHash = computePublicDisplayHash(displayName, username, purpose);

    const card = {
      card_id: cardId,
      secret_seed: secretSeed,
      display_name: displayName,
      username: username || null,
      purpose: purpose || null,
      expiration_key: expirationKey,
      issued_at: issuedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      identity_card_version: IDENTITY_CARD_VERSION,
      verification_path: `/id/${cardId}`,
      trust_tier: tierMeta.trust_tier,
      rotation_seconds: tierMeta.rotation_seconds,
    };

    if (isSupabaseAdminConfigured()) {
      if (dtsConfigError) {
        return NextResponse.json(
          { success: false, error: dtsConfigError },
          { status: 503 }
        );
      }

      try {
        const supabase = getSupabaseAdmin();
        const { error } = await supabase.from(TABLE).insert({
          id: cardId,
          secret_token_hash: secretTokenHash,
          secret_ciphertext,
          secret_nonce,
          public_display_hash: publicDisplayHash,
          display_name: displayName,
          username: username || null,
          purpose: purpose || null,
          expiration_key: expirationKey,
          issued_at: issuedAt.toISOString(),
          expires_at: expiresAt.toISOString(),
          trust_state: "active",
          identity_card_version: IDENTITY_CARD_VERSION,
          metadata: buildFutureMetadata({
            version: IDENTITY_CARD_VERSION,
            trust_tier: tierMeta.trust_tier,
            rotation_seconds: tierMeta.rotation_seconds,
          }),
        });

        if (error) throw error;

        await appendStateEvent(supabase, {
          cardId,
          eventType: "created",
          trustState: "active",
          card: {
            id: cardId,
            display_name: displayName,
            username,
            purpose,
            issued_at: issuedAt.toISOString(),
            expires_at: expiresAt.toISOString(),
            identity_card_version: IDENTITY_CARD_VERSION,
          },
          metadata: { source: "create" },
        });

        return NextResponse.json({
          success: true,
          stored: true,
          card,
          message: "Online trust pass saved with server-verifiable trust code.",
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
            "Card created in this browser. Run docs/sql/identity_cards_dts_foundation.sql in Supabase.",
        });
      }
    }

    return NextResponse.json({
      success: true,
      stored: false,
      card,
      warning:
        "Supabase service role is not configured. Card stored in this browser only.",
      message: "Online trust pass created locally.",
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

  return NextResponse.redirect(new URL(`/id/${encodeURIComponent(cardId)}`, req.url));
}

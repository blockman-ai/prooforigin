import { NextResponse } from "next/server";
import crypto from "crypto";
import { authorizeDisclosureOwnerRequest } from "../../../../lib/vaultDisclosureAuthority";
import {
  createVaultOwnershipVerificationChallenge,
  isVaultAdminConfigured,
  VAULT_OWNERSHIP_KEY_ALGORITHM,
} from "../../../../lib/vaultAdmin";
import {
  VAULT_OWNERSHIP_CHALLENGE_TTL_SECONDS,
  VAULT_OWNERSHIP_CHALLENGE_TYPE_ASSET_TRANSFER_ACCEPT,
  VAULT_OWNERSHIP_CHALLENGE_VERSION,
} from "../../../../lib/vaultOwnershipVerification";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const bodyText = await req.text();
    const authority = await authorizeDisclosureOwnerRequest(req, {
      method: "POST",
      path: "/api/assets/transfers/challenge",
      bodyText,
    });

    if (!authority.ok) {
      return NextResponse.json(authority.payload, { status: authority.status });
    }

    if (!isVaultAdminConfigured()) {
      return NextResponse.json(
        {
          success: false,
          code: "STORAGE_NOT_CONFIGURED",
          error: "Vault storage is not configured.",
        },
        { status: 503 }
      );
    }

    const vaultId = authority.registration.vault_id;
    const vaultDeviceId = authority.auth.vault_device_id;

    const issuedAtMs = Date.now();
    const issuedAt = new Date(issuedAtMs).toISOString();
    const expiresAt = new Date(
      issuedAtMs + VAULT_OWNERSHIP_CHALLENGE_TTL_SECONDS * 1000
    ).toISOString();
    const challengeNonce = crypto.randomBytes(32).toString("base64url");
    const challengeNonceHash = crypto.createHash("sha256").update(challengeNonce).digest("hex");
    const challengeType = VAULT_OWNERSHIP_CHALLENGE_TYPE_ASSET_TRANSFER_ACCEPT;

    const { verification, error: createError } = await createVaultOwnershipVerificationChallenge({
      challengeType,
      challengeNonceHash,
      issuedAt,
      expiresAt,
      ownershipKeyId: null,
      vaultId,
      vaultDeviceId,
      metadata: {
        challenge_version: VAULT_OWNERSHIP_CHALLENGE_VERSION,
        challenge_ttl_seconds: VAULT_OWNERSHIP_CHALLENGE_TTL_SECONDS,
        ownership_key_algorithm: VAULT_OWNERSHIP_KEY_ALGORITHM,
        challenge_nonce_hash: challengeNonceHash,
      },
    });

    if (createError) {
      return NextResponse.json(
        {
          success: false,
          code: "TRANSFER_CHALLENGE_CREATE_FAILED",
          error: createError.message || "Unable to create transfer acceptance challenge.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      challenge_id: verification.challenge_id || verification.id,
      challenge: {
        version: VAULT_OWNERSHIP_CHALLENGE_VERSION,
        action: challengeType,
        challenge_type: challengeType,
        vault_id: vaultId,
        vault_device_id: vaultDeviceId,
        challenge_nonce: challengeNonce,
        issued_at: issuedAt,
        expires_at: expiresAt,
      },
      ownership_key_algorithm: VAULT_OWNERSHIP_KEY_ALGORITHM,
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        code: "INVALID_TRANSFER_CHALLENGE_REQUEST",
        error: "Invalid transfer acceptance challenge request.",
      },
      { status: 400 }
    );
  }
}

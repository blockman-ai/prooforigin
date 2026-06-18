import { NextResponse } from "next/server";
import crypto from "crypto";
import { authorizeVaultRequest, vaultAuthFailureResponse } from "../../../../../lib/vaultAuth";
import {
  createVaultOwnershipVerificationChallenge,
  getVaultOwnershipKey,
  isVaultAdminConfigured,
  VAULT_OWNERSHIP_KEY_ALGORITHM,
} from "../../../../../lib/vaultAdmin";
import {
  VAULT_OWNERSHIP_CHALLENGE_TTL_SECONDS,
  VAULT_OWNERSHIP_CHALLENGE_TYPE_OWNERSHIP_KEY_REGISTER,
  VAULT_OWNERSHIP_CHALLENGE_VERSION,
} from "../../../../../lib/vaultOwnershipVerification";
import {
  recordVaultOwnershipVerificationSentinelCounter,
  VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS,
} from "../../../../../lib/vaultOwnershipVerificationSentinelCounters";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function storageNotConfiguredResponse() {
  return NextResponse.json(
    {
      success: false,
      code: "STORAGE_NOT_CONFIGURED",
      error: "Vault storage is not configured. Set Supabase service role credentials.",
    },
    { status: 503 }
  );
}

export async function POST(req) {
  recordVaultOwnershipVerificationSentinelCounter(
    VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.REGISTER_CHALLENGE_REQUEST_TOTAL
  );

  try {
    const bodyText = await req.text();
    const auth = await authorizeVaultRequest(req, {
      method: "POST",
      path: "/api/vault/ownership/register/challenge",
      bodyText,
    });
    if (!auth.ok) {
      return NextResponse.json(vaultAuthFailureResponse(auth), { status: auth.status });
    }

    if (!isVaultAdminConfigured()) {
      recordVaultOwnershipVerificationSentinelCounter(
        VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.REGISTER_CHALLENGE_ERROR_TOTAL
      );
      return storageNotConfiguredResponse();
    }

    const body = bodyText ? JSON.parse(bodyText) : {};
    const vaultId = String(body?.vault_id || "").trim().toLowerCase();

    if (!UUID_PATTERN.test(vaultId)) {
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_REQUEST",
          error: "vault_id must be a valid UUID.",
        },
        { status: 400 }
      );
    }

    const { ownershipKey, error: ownershipError } = await getVaultOwnershipKey(vaultId);
    if (ownershipError) {
      recordVaultOwnershipVerificationSentinelCounter(
        VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.REGISTER_CHALLENGE_ERROR_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "OWNERSHIP_LOOKUP_FAILED",
          error: ownershipError.message || "Unable to load vault ownership key.",
        },
        { status: 502 }
      );
    }

    if (ownershipKey) {
      recordVaultOwnershipVerificationSentinelCounter(
        VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.REGISTER_CHALLENGE_ALREADY_REGISTERED_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "OWNERSHIP_KEY_ALREADY_REGISTERED",
          error: "Vault ownership public key is already registered and immutable.",
        },
        { status: 409 }
      );
    }

    const issuedAtMs = Date.now();
    const issuedAt = new Date(issuedAtMs).toISOString();
    const expiresAt = new Date(issuedAtMs + VAULT_OWNERSHIP_CHALLENGE_TTL_SECONDS * 1000).toISOString();
    const challengeNonce = crypto.randomBytes(32).toString("base64url");
    const challengeNonceHash = crypto.createHash("sha256").update(challengeNonce).digest("hex");
    const challengeType = VAULT_OWNERSHIP_CHALLENGE_TYPE_OWNERSHIP_KEY_REGISTER;

    const { verification, error: createError } = await createVaultOwnershipVerificationChallenge({
      challengeType,
      challengeNonceHash,
      issuedAt,
      expiresAt,
      ownershipKeyId: null,
      vaultId,
      vaultDeviceId: auth.vault_device_id,
      metadata: {
        challenge_version: VAULT_OWNERSHIP_CHALLENGE_VERSION,
        challenge_ttl_seconds: VAULT_OWNERSHIP_CHALLENGE_TTL_SECONDS,
        ownership_key_algorithm: VAULT_OWNERSHIP_KEY_ALGORITHM,
        challenge_nonce_hash: challengeNonceHash,
      },
    });

    if (createError) {
      recordVaultOwnershipVerificationSentinelCounter(
        VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.REGISTER_CHALLENGE_ERROR_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "CHALLENGE_CREATE_FAILED",
          error: createError.message || "Unable to create vault ownership registration challenge.",
        },
        { status: 502 }
      );
    }

    recordVaultOwnershipVerificationSentinelCounter(
      VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.REGISTER_CHALLENGE_CREATED_TOTAL
    );

    return NextResponse.json({
      success: true,
      challenge_id: verification.challenge_id || verification.id,
      challenge: {
        version: VAULT_OWNERSHIP_CHALLENGE_VERSION,
        action: challengeType,
        challenge_type: challengeType,
        vault_id: vaultId,
        vault_device_id: auth.vault_device_id,
        challenge_nonce: challengeNonce,
        issued_at: issuedAt,
        expires_at: expiresAt,
      },
      ownership_key_registered: false,
      ownership_key_algorithm: VAULT_OWNERSHIP_KEY_ALGORITHM,
    });
  } catch {
    recordVaultOwnershipVerificationSentinelCounter(
      VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.REGISTER_CHALLENGE_ERROR_TOTAL
    );
    return NextResponse.json(
      {
        success: false,
        code: "INVALID_REQUEST",
        error: "Invalid ownership registration challenge request.",
      },
      { status: 400 }
    );
  }
}

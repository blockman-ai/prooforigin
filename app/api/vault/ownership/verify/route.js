import { NextResponse } from "next/server";
import crypto from "crypto";
import { authorizeVaultRequest, vaultAuthFailureResponse } from "../../../../lib/vaultAuth";
import {
  bindVaultDeviceToVault,
  getVaultOwnershipKey,
  getVaultOwnershipVerificationChallengeById,
  isVaultAdminConfigured,
  verifyVaultOwnershipChallenge,
  VAULT_OWNERSHIP_KEY_ALGORITHM,
} from "../../../../lib/vaultAdmin";
import {
  buildVaultOwnershipChallengeMessage,
  VAULT_OWNERSHIP_CHALLENGE_TYPE_MIGRATION_AUTHORITY_VERIFY,
} from "../../../../lib/vaultOwnershipVerification";
import {
  recordVaultOwnershipVerificationSentinelCounter,
  VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS,
} from "../../../../lib/vaultOwnershipVerificationSentinelCounters";

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

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseBase64ToBytes(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error("signature is required.");
  }
  return Buffer.from(normalized, "base64");
}

async function verifyOwnershipSignature({ publicKeyJwk, message, signatureBase64 }) {
  const verifyKey = await crypto.webcrypto.subtle.importKey(
    "jwk",
    publicKeyJwk,
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    false,
    ["verify"]
  );

  const signatureBytes = parseBase64ToBytes(signatureBase64);
  const messageBytes = new TextEncoder().encode(message);

  return crypto.webcrypto.subtle.verify(
    {
      name: "ECDSA",
      hash: "SHA-256",
    },
    verifyKey,
    signatureBytes,
    messageBytes
  );
}

export async function POST(req) {
  recordVaultOwnershipVerificationSentinelCounter(
    VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.VERIFY_REQUEST_TOTAL
  );

  try {
    const bodyText = await req.text();
    const auth = await authorizeVaultRequest(req, {
      method: "POST",
      path: "/api/vault/ownership/verify",
      bodyText,
    });
    if (!auth.ok) {
      return NextResponse.json(vaultAuthFailureResponse(auth), { status: auth.status });
    }

    if (!isVaultAdminConfigured()) {
      recordVaultOwnershipVerificationSentinelCounter(
        VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.VERIFY_ERROR_TOTAL
      );
      return storageNotConfiguredResponse();
    }

    const body = bodyText ? JSON.parse(bodyText) : {};
    const challengeId = String(body?.challenge_id || "").trim().toLowerCase();
    const challengeNonce = String(body?.challenge_nonce || "").trim();
    const signature = String(body?.signature || "").trim();
    const challengePayload = body?.challenge;

    if (!UUID_PATTERN.test(challengeId)) {
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_REQUEST",
          error: "challenge_id must be a valid UUID.",
        },
        { status: 400 }
      );
    }

    if (!challengeNonce || !signature || !isObject(challengePayload)) {
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_REQUEST",
          error: "challenge payload, challenge_nonce, and signature are required.",
        },
        { status: 400 }
      );
    }

    const { verification, error: challengeLookupError } =
      await getVaultOwnershipVerificationChallengeById(challengeId);
    if (challengeLookupError) {
      recordVaultOwnershipVerificationSentinelCounter(
        VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.VERIFY_ERROR_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "CHALLENGE_LOOKUP_FAILED",
          error: challengeLookupError.message || "Unable to load ownership challenge.",
        },
        { status: 502 }
      );
    }

    if (!verification) {
      return NextResponse.json(
        {
          success: false,
          code: "CHALLENGE_NOT_FOUND",
          error: "Ownership challenge does not exist.",
        },
        { status: 404 }
      );
    }

    if (verification.status !== "pending" || verification.consumed_at) {
      recordVaultOwnershipVerificationSentinelCounter(
        VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.VERIFY_REPLAY_REJECTED_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "CHALLENGE_ALREADY_USED",
          error: "Ownership challenge was already consumed.",
        },
        { status: 409 }
      );
    }

    if (Date.now() > Date.parse(String(verification.expires_at || ""))) {
      recordVaultOwnershipVerificationSentinelCounter(
        VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.VERIFY_EXPIRED_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "CHALLENGE_EXPIRED",
          error: "Ownership challenge expired.",
        },
        { status: 410 }
      );
    }

    if (verification.challenge_type !== VAULT_OWNERSHIP_CHALLENGE_TYPE_MIGRATION_AUTHORITY_VERIFY) {
      recordVaultOwnershipVerificationSentinelCounter(
        VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.VERIFY_ACTION_MISMATCH_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "CHALLENGE_ACTION_MISMATCH",
          error: "Ownership challenge action does not match verification ceremony.",
        },
        { status: 409 }
      );
    }

    const payloadChallengeType = String(
      challengePayload.challenge_type || challengePayload.action || ""
    ).trim();
    if (payloadChallengeType !== verification.challenge_type) {
      recordVaultOwnershipVerificationSentinelCounter(
        VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.VERIFY_ACTION_MISMATCH_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "CHALLENGE_ACTION_MISMATCH",
          error: "Ownership challenge action does not match verification ceremony.",
        },
        { status: 409 }
      );
    }

    if (verification.vault_device_id !== auth.vault_device_id) {
      recordVaultOwnershipVerificationSentinelCounter(
        VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.VERIFY_DEVICE_MISMATCH_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "CHALLENGE_DEVICE_MISMATCH",
          error: "Ownership challenge is bound to a different device.",
        },
        { status: 409 }
      );
    }

    const payloadVaultId = String(challengePayload.vault_id || "").trim().toLowerCase();
    if (!UUID_PATTERN.test(payloadVaultId) || payloadVaultId !== verification.vault_id) {
      recordVaultOwnershipVerificationSentinelCounter(
        VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.VERIFY_VAULT_MISMATCH_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "CHALLENGE_VAULT_MISMATCH",
          error: "Ownership challenge vault scope mismatch.",
        },
        { status: 409 }
      );
    }

    const nonceHash = crypto.createHash("sha256").update(challengeNonce).digest("hex");
    if (nonceHash !== verification.challenge_nonce_hash) {
      recordVaultOwnershipVerificationSentinelCounter(
        VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.VERIFY_SIGNATURE_FAILED_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "CHALLENGE_NONCE_INVALID",
          error: "Ownership challenge nonce is invalid.",
        },
        { status: 401 }
      );
    }

    const { ownershipKey, error: ownershipError } = await getVaultOwnershipKey(verification.vault_id);
    if (ownershipError) {
      recordVaultOwnershipVerificationSentinelCounter(
        VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.VERIFY_ERROR_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "OWNERSHIP_LOOKUP_FAILED",
          error: ownershipError.message || "Unable to load ownership key for verification.",
        },
        { status: 502 }
      );
    }

    if (!ownershipKey) {
      recordVaultOwnershipVerificationSentinelCounter(
        VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.VERIFY_SIGNATURE_FAILED_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "OWNERSHIP_KEY_REQUIRED",
          error: "Vault ownership key must exist for verification.",
        },
        { status: 403 }
      );
    }

    const message = buildVaultOwnershipChallengeMessage({
      challengeId,
      challengeType: verification.challenge_type,
      vaultId: verification.vault_id,
      vaultDeviceId: verification.vault_device_id,
      challengeNonce,
      issuedAt: verification.issued_at,
      expiresAt: verification.expires_at,
      version: challengePayload.version,
    });

    let signatureValid = false;
    try {
      signatureValid = await verifyOwnershipSignature({
        publicKeyJwk: ownershipKey.public_key_jwk,
        message,
        signatureBase64: signature,
      });
    } catch {
      signatureValid = false;
    }

    if (!signatureValid) {
      recordVaultOwnershipVerificationSentinelCounter(
        VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.VERIFY_SIGNATURE_FAILED_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "OWNERSHIP_SIGNATURE_INVALID",
          error: "Ownership challenge signature verification failed.",
        },
        { status: 401 }
      );
    }

    const verifiedAt = new Date().toISOString();
    const signatureHash = crypto.createHash("sha256").update(signature).digest("hex");
    const { verification: verifiedChallenge, error: verifyPersistError } =
      await verifyVaultOwnershipChallenge({
        verificationId: verification.id,
        ownershipKeyId: ownershipKey.id,
        verifiedAt,
        metadata: {
          verification_version: "vault_ownership_verify_v1",
          challenge_type: verification.challenge_type,
          ownership_key_algorithm: ownershipKey.algorithm || VAULT_OWNERSHIP_KEY_ALGORITHM,
          challenge_id: challengeId,
          challenge_nonce_hash: nonceHash,
          signature_hash: signatureHash,
          signature_verified: true,
        },
      });

    if (verifyPersistError || !verifiedChallenge) {
      const isReplay = verifyPersistError?.code === "PGRST116" || !verifiedChallenge;
      recordVaultOwnershipVerificationSentinelCounter(
        isReplay
          ? VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.VERIFY_REPLAY_REJECTED_TOTAL
          : VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.VERIFY_ERROR_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: isReplay ? "CHALLENGE_ALREADY_USED" : "OWNERSHIP_VERIFY_PERSIST_FAILED",
          error: isReplay
            ? "Ownership challenge was already consumed."
            : verifyPersistError?.message || "Unable to persist ownership verification.",
        },
        { status: isReplay ? 409 : 502 }
      );
    }

    const { registration: boundRegistration, error: bindError } = await bindVaultDeviceToVault({
      vaultDeviceId: auth.vault_device_id,
      vaultId: verification.vault_id,
      vaultOwnershipProofMetadata: {
        proof_version: "vault_ownership_verify_v1",
        challenge_type: verification.challenge_type,
        challenge_id: challengeId,
        challenge_nonce_hash: nonceHash,
        signature_verified: true,
        ownership_key_id: ownershipKey.id,
        verified_at: verifiedAt,
      },
      vaultIdBoundAt: verifiedAt,
    });

    if (bindError) {
      recordVaultOwnershipVerificationSentinelCounter(
        VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.VERIFY_ERROR_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "DEVICE_BIND_FAILED",
          error: bindError.message || "Unable to bind verified device to vault.",
        },
        { status: 502 }
      );
    }

    recordVaultOwnershipVerificationSentinelCounter(
      VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.VERIFY_SUCCESS_TOTAL
    );

    return NextResponse.json({
      success: true,
      migration_authority_verified: true,
      challenge_id: challengeId,
      challenge_type: verification.challenge_type,
      verified_at: verifiedAt,
      vault_id: verification.vault_id,
      vault_device_id: boundRegistration?.vault_device_id || auth.vault_device_id,
    });
  } catch {
    recordVaultOwnershipVerificationSentinelCounter(
      VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.VERIFY_ERROR_TOTAL
    );
    return NextResponse.json(
      { success: false, code: "INVALID_REQUEST", error: "Invalid ownership verification request." },
      { status: 400 }
    );
  }
}

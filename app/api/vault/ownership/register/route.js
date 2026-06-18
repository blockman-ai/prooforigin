import { NextResponse } from "next/server";
import crypto from "crypto";
import { authorizeVaultRequest, vaultAuthFailureResponse } from "../../../../lib/vaultAuth";
import {
  bindVaultDeviceToVault,
  createVaultOwnershipKey,
  getVaultOwnershipKey,
  getVaultOwnershipVerificationChallengeById,
  isVaultAdminConfigured,
  verifyVaultOwnershipChallenge,
  VAULT_OWNERSHIP_KEY_ALGORITHM,
} from "../../../../lib/vaultAdmin";
import {
  buildVaultOwnershipChallengeMessage,
  hashOwnershipChallengeNonce,
  VAULT_OWNERSHIP_CHALLENGE_TYPE_OWNERSHIP_KEY_REGISTER,
  verifyOwnershipSignature,
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

function validatePublicOwnershipJwk(jwk) {
  if (!isObject(jwk)) {
    return "ownership_public_key_jwk must be an object.";
  }

  const privateMembers = ["d", "p", "q", "dp", "dq", "qi", "oth", "k"];
  const leakedMember = privateMembers.find((member) => Object.prototype.hasOwnProperty.call(jwk, member));
  if (leakedMember) {
    return "ownership_public_key_jwk must not contain private key material.";
  }

  if (jwk.kty !== "EC" || jwk.crv !== "P-256") {
    return "ownership_public_key_jwk must be an EC P-256 public JWK.";
  }

  if (typeof jwk.x !== "string" || !jwk.x || typeof jwk.y !== "string" || !jwk.y) {
    return "ownership_public_key_jwk must include public x and y coordinates.";
  }

  return null;
}

function normalizeOwnershipProofMetadata({
  proof = {},
  algorithm = VAULT_OWNERSHIP_KEY_ALGORITHM,
  challengeId,
  challengeType,
  signatureVerified,
}) {
  return {
    proof_version: "vault_ownership_register_v2",
    challenge_format: VAULT_OWNERSHIP_CHALLENGE_TYPE_OWNERSHIP_KEY_REGISTER,
    challenge_id: challengeId,
    challenge_type: challengeType,
    challenge_hash: String(proof.challenge_hash || "").trim() || null,
    signature_verified: signatureVerified === true,
    public_key_fingerprint: String(proof.public_key_fingerprint || ""),
    algorithm,
  };
}

export async function POST(req) {
  recordVaultOwnershipVerificationSentinelCounter(
    VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.REGISTER_REQUEST_TOTAL
  );

  try {
    const bodyText = await req.text();
    const auth = await authorizeVaultRequest(req, {
      method: "POST",
      path: "/api/vault/ownership/register",
      bodyText,
    });
    if (!auth.ok) {
      return NextResponse.json(vaultAuthFailureResponse(auth), { status: auth.status });
    }

    if (!isVaultAdminConfigured()) {
      recordVaultOwnershipVerificationSentinelCounter(
        VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.REGISTER_ERROR_TOTAL
      );
      return storageNotConfiguredResponse();
    }

    const body = bodyText ? JSON.parse(bodyText) : {};
    const vaultId = String(body?.vault_id || "").trim().toLowerCase();
    const algorithm = String(
      body?.ownership_key_algorithm || VAULT_OWNERSHIP_KEY_ALGORITHM
    ).trim();
    const publicKeyJwk = body?.ownership_public_key_jwk;
    const challengeId = String(body?.challenge_id || "").trim().toLowerCase();
    const challengeNonce = String(body?.challenge_nonce || "").trim();
    const signature = String(body?.signature || "").trim();
    const challengePayload = body?.challenge;
    const ownershipProof = body?.ownership_proof;

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

    const publicKeyError = validatePublicOwnershipJwk(publicKeyJwk);
    if (publicKeyError) {
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_REQUEST",
          error: publicKeyError,
        },
        { status: 400 }
      );
    }

    if (algorithm !== VAULT_OWNERSHIP_KEY_ALGORITHM) {
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_REQUEST",
          error: `ownership_key_algorithm must be ${VAULT_OWNERSHIP_KEY_ALGORITHM}.`,
        },
        { status: 400 }
      );
    }

    if (!UUID_PATTERN.test(challengeId) || !challengeNonce || !signature || !isObject(challengePayload)) {
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_REQUEST",
          error: "challenge_id, challenge_nonce, signature, and challenge payload are required.",
        },
        { status: 400 }
      );
    }

    const existing = await getVaultOwnershipKey(vaultId);
    if (existing.error) {
      recordVaultOwnershipVerificationSentinelCounter(
        VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.REGISTER_ERROR_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "OWNERSHIP_LOOKUP_FAILED",
          error: existing.error.message || "Unable to load vault ownership key.",
        },
        { status: 502 }
      );
    }

    if (existing.ownershipKey) {
      return NextResponse.json(
        {
          success: false,
          code: "OWNERSHIP_KEY_ALREADY_REGISTERED",
          error: "Vault ownership public key is already registered and immutable.",
        },
        { status: 409 }
      );
    }

    const { verification, error: challengeLookupError } =
      await getVaultOwnershipVerificationChallengeById(challengeId);
    if (challengeLookupError) {
      recordVaultOwnershipVerificationSentinelCounter(
        VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.REGISTER_ERROR_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "CHALLENGE_LOOKUP_FAILED",
          error: challengeLookupError.message || "Unable to load ownership registration challenge.",
        },
        { status: 502 }
      );
    }

    if (!verification) {
      return NextResponse.json(
        {
          success: false,
          code: "CHALLENGE_NOT_FOUND",
          error: "Ownership registration challenge does not exist.",
        },
        { status: 404 }
      );
    }

    if (verification.status !== "pending" || verification.consumed_at) {
      recordVaultOwnershipVerificationSentinelCounter(
        VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.REGISTER_REPLAY_REJECTED_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "CHALLENGE_ALREADY_USED",
          error: "Ownership registration challenge was already consumed.",
        },
        { status: 409 }
      );
    }

    if (Date.now() > Date.parse(String(verification.expires_at || ""))) {
      recordVaultOwnershipVerificationSentinelCounter(
        VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.REGISTER_EXPIRED_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "CHALLENGE_EXPIRED",
          error: "Ownership registration challenge expired.",
        },
        { status: 410 }
      );
    }

    if (verification.challenge_type !== VAULT_OWNERSHIP_CHALLENGE_TYPE_OWNERSHIP_KEY_REGISTER) {
      recordVaultOwnershipVerificationSentinelCounter(
        VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.REGISTER_ACTION_MISMATCH_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "CHALLENGE_ACTION_MISMATCH",
          error: "Ownership registration challenge action does not match registration ceremony.",
        },
        { status: 409 }
      );
    }

    const payloadChallengeType = String(
      challengePayload.challenge_type || challengePayload.action || ""
    ).trim();
    if (payloadChallengeType !== verification.challenge_type) {
      recordVaultOwnershipVerificationSentinelCounter(
        VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.REGISTER_ACTION_MISMATCH_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "CHALLENGE_ACTION_MISMATCH",
          error: "Ownership registration challenge action does not match registration ceremony.",
        },
        { status: 409 }
      );
    }

    if (verification.vault_device_id !== auth.vault_device_id) {
      recordVaultOwnershipVerificationSentinelCounter(
        VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.REGISTER_DEVICE_MISMATCH_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "CHALLENGE_DEVICE_MISMATCH",
          error: "Ownership registration challenge is bound to a different device.",
        },
        { status: 409 }
      );
    }

    const payloadVaultId = String(challengePayload.vault_id || "").trim().toLowerCase();
    if (!UUID_PATTERN.test(payloadVaultId) || payloadVaultId !== verification.vault_id) {
      recordVaultOwnershipVerificationSentinelCounter(
        VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.REGISTER_VAULT_MISMATCH_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "CHALLENGE_VAULT_MISMATCH",
          error: "Ownership registration challenge vault scope mismatch.",
        },
        { status: 409 }
      );
    }

    if (payloadVaultId !== vaultId || verification.vault_id !== vaultId) {
      recordVaultOwnershipVerificationSentinelCounter(
        VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.REGISTER_VAULT_MISMATCH_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "CHALLENGE_VAULT_MISMATCH",
          error: "Ownership registration challenge vault scope mismatch.",
        },
        { status: 409 }
      );
    }

    const nonceHash = hashOwnershipChallengeNonce(challengeNonce);
    if (nonceHash !== verification.challenge_nonce_hash) {
      recordVaultOwnershipVerificationSentinelCounter(
        VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.REGISTER_SIGNATURE_FAILED_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "CHALLENGE_NONCE_INVALID",
          error: "Ownership registration challenge nonce is invalid.",
        },
        { status: 401 }
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
        publicKeyJwk,
        message,
        signatureBase64: signature,
      });
    } catch {
      signatureValid = false;
    }

    if (!signatureValid) {
      recordVaultOwnershipVerificationSentinelCounter(
        VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.REGISTER_SIGNATURE_FAILED_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "OWNERSHIP_SIGNATURE_INVALID",
          error: "Ownership registration signature verification failed.",
        },
        { status: 401 }
      );
    }

    const proofMetadata = normalizeOwnershipProofMetadata({
      proof: ownershipProof || {},
      algorithm,
      challengeId,
      challengeType: verification.challenge_type,
      signatureVerified: true,
    });

    const { ownershipKey, error: createError } = await createVaultOwnershipKey({
      vaultId,
      publicKeyJwk,
      algorithm,
      metadata: {
        registration_source: "prooforigin-vault-phase10d1",
        ...proofMetadata,
      },
    });

    if (createError) {
      const isDuplicate = createError.code === "23505";
      recordVaultOwnershipVerificationSentinelCounter(
        VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.REGISTER_ERROR_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: isDuplicate ? "OWNERSHIP_KEY_ALREADY_REGISTERED" : "OWNERSHIP_CREATE_FAILED",
          error:
            createError.message ||
            (isDuplicate
              ? "Vault ownership public key is already registered and immutable."
              : "Unable to create vault ownership key."),
        },
        { status: isDuplicate ? 409 : 502 }
      );
    }

    const verifiedAt = new Date().toISOString();
    const signatureHash = crypto.createHash("sha256").update(signature).digest("hex");
    const { verification: consumedChallenge, error: consumeError } =
      await verifyVaultOwnershipChallenge({
        verificationId: verification.id,
        ownershipKeyId: ownershipKey.id,
        verifiedAt,
        metadata: {
          verification_version: "vault_ownership_register_v2",
          challenge_type: verification.challenge_type,
          ownership_key_algorithm: algorithm,
          challenge_id: challengeId,
          challenge_nonce_hash: nonceHash,
          signature_hash: signatureHash,
          signature_verified: true,
        },
      });

    if (consumeError || !consumedChallenge) {
      recordVaultOwnershipVerificationSentinelCounter(
        VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.REGISTER_REPLAY_REJECTED_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "CHALLENGE_ALREADY_USED",
          error: "Ownership registration challenge was already consumed.",
        },
        { status: 409 }
      );
    }

    const { registration, error: bindError } = await bindVaultDeviceToVault({
      vaultDeviceId: auth.vault_device_id,
      vaultId,
      vaultOwnershipProofMetadata: {
        ...proofMetadata,
        ownership_key_id: ownershipKey.id,
      },
    });

    if (bindError) {
      recordVaultOwnershipVerificationSentinelCounter(
        VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.REGISTER_ERROR_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "DEVICE_BIND_FAILED",
          error: bindError.message || "Unable to bind device to vault ownership.",
        },
        { status: 502 }
      );
    }

    recordVaultOwnershipVerificationSentinelCounter(
      VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.REGISTER_SUCCESS_TOTAL
    );

    return NextResponse.json({
      success: true,
      vault_id: vaultId,
      vault_device_id: registration?.vault_device_id || auth.vault_device_id,
      ownership_key_registered: true,
      ownership_key_id: ownershipKey.id,
      device_bound: true,
      vault_id_bound_at: registration?.vault_id_bound_at || null,
      migration_ready_boundary: {
        old_recovery_kits: "identity_restore_only",
        new_recovery_kit_required_for_migration_proof: true,
      },
    });
  } catch {
    recordVaultOwnershipVerificationSentinelCounter(
      VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS.REGISTER_ERROR_TOTAL
    );
    return NextResponse.json(
      { success: false, code: "INVALID_REQUEST", error: "Invalid ownership registration request." },
      { status: 400 }
    );
  }
}

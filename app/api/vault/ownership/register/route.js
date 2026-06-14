import { NextResponse } from "next/server";
import crypto from "crypto";
import { authorizeVaultRequest, vaultAuthFailureResponse } from "../../../../lib/vaultAuth";
import {
  bindVaultDeviceToVault,
  createVaultOwnershipKey,
  getVaultOwnershipKey,
  isVaultAdminConfigured,
  VAULT_OWNERSHIP_KEY_ALGORITHM,
} from "../../../../lib/vaultAdmin";

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

function normalizeOwnershipProofMetadata(proof = {}, algorithm = VAULT_OWNERSHIP_KEY_ALGORITHM) {
  const challenge = String(proof.challenge || "");
  const challengeHash =
    String(proof.challenge_hash || "").trim() ||
    (challenge ? crypto.createHash("sha256").update(challenge).digest("hex") : "");

  return {
    proof_version: "vault_ownership_register_v1",
    challenge_format: String(proof.challenge_format || "prooforigin-vault-ownership-register-v1"),
    challenge_hash: challengeHash,
    signature_present: Boolean(proof.signature),
    public_key_fingerprint: String(proof.public_key_fingerprint || ""),
    algorithm,
  };
}

export async function POST(req) {
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
      return storageNotConfiguredResponse();
    }

    const body = bodyText ? JSON.parse(bodyText) : {};
    const vaultId = String(body?.vault_id || "").trim().toLowerCase();
    const algorithm = String(
      body?.ownership_key_algorithm || VAULT_OWNERSHIP_KEY_ALGORITHM
    ).trim();
    const publicKeyJwk = body?.ownership_public_key_jwk;
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

    if (!isObject(ownershipProof)) {
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_REQUEST",
          error: "ownership_proof metadata is required.",
        },
        { status: 400 }
      );
    }

    const existing = await getVaultOwnershipKey(vaultId);
    if (existing.error) {
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

    const proofMetadata = normalizeOwnershipProofMetadata(ownershipProof, algorithm);

    const { ownershipKey, error: createError } = await createVaultOwnershipKey({
      vaultId,
      publicKeyJwk,
      algorithm,
      metadata: {
        registration_source: "prooforigin-vault-phase3",
        ...proofMetadata,
      },
    });

    if (createError) {
      const isDuplicate = createError.code === "23505";
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

    const { registration, error: bindError } = await bindVaultDeviceToVault({
      vaultDeviceId: auth.vault_device_id,
      vaultId,
      vaultOwnershipProofMetadata: {
        ...proofMetadata,
        ownership_key_id: ownershipKey.id,
      },
    });

    if (bindError) {
      return NextResponse.json(
        {
          success: false,
          code: "DEVICE_BIND_FAILED",
          error: bindError.message || "Unable to bind device to vault ownership.",
        },
        { status: 502 }
      );
    }

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
    return NextResponse.json(
      { success: false, code: "INVALID_REQUEST", error: "Invalid ownership registration request." },
      { status: 400 }
    );
  }
}

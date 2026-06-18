import { NextResponse } from "next/server";
import crypto from "crypto";
import { authorizeDisclosureOwnerRequest } from "../../../../../lib/vaultDisclosureAuthority";
import {
  getVaultOwnershipKey,
  getVaultOwnershipVerificationChallengeById,
  verifyVaultOwnershipChallenge,
  VAULT_OWNERSHIP_KEY_ALGORITHM,
} from "../../../../../lib/vaultAdmin";
import {
  buildVaultOwnershipChallengeMessage,
  VAULT_OWNERSHIP_CHALLENGE_TYPE_ASSET_TRANSFER_ACCEPT,
  verifyOwnershipSignature,
} from "../../../../../lib/vaultOwnershipVerification";
import { getAssetRecordById } from "../../../../../lib/assetRegistryStore";
import {
  ASSET_TRANSFER_STATUS_PENDING,
  buildTransferRecipientBindingHash,
  buildTransferPublicHandleHash,
  isAssetTransferExpired,
  serializeRecipientTransfer,
  serializeTransferReceipt,
} from "../../../../../lib/assetTransfer";
import {
  acceptAssetTransfer,
  getTransferRecordByHandleHash,
} from "../../../../../lib/assetTransferStore";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function denied(code, error, status = 409) {
  return NextResponse.json({ success: false, code, error }, { status });
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function POST(req, { params }) {
  try {
    const bodyText = await req.text();
    const authority = await authorizeDisclosureOwnerRequest(req, {
      method: "POST",
      path: `/api/assets/transfers/${params?.handle || ""}/accept`,
      bodyText,
    });

    if (!authority.ok) {
      return NextResponse.json(authority.payload, { status: authority.status });
    }

    const recipientVaultId = authority.registration.vault_id;
    const recipientDeviceId = authority.auth.vault_device_id;

    const body = bodyText ? JSON.parse(bodyText) : {};
    const recipientChallenge = String(body.recipient_challenge || body.recipient_secret || "").trim();
    const challengeId = String(body.challenge_id || "").trim().toLowerCase();
    const challengeNonce = String(body.challenge_nonce || "").trim();
    const signature = String(body.signature || "").trim();
    const challengePayload = body.challenge;

    if (!recipientChallenge) {
      return denied("INVALID_REQUEST", "recipient_challenge is required.", 400);
    }
    if (!UUID_PATTERN.test(challengeId) || !challengeNonce || !signature || !isObject(challengePayload)) {
      return denied(
        "INVALID_REQUEST",
        "challenge_id, challenge_nonce, signature, and challenge payload are required.",
        400
      );
    }

    const handle = String(params?.handle || "").trim();
    const publicHandleHash = buildTransferPublicHandleHash(handle);
    const { transfer, error: transferError } = await getTransferRecordByHandleHash(publicHandleHash);
    if (transferError) {
      return denied("TRANSFER_LOOKUP_FAILED", "Unable to load transfer.", 502);
    }
    if (!transfer) {
      return denied("TRANSFER_NOT_FOUND", "Transfer not found.", 404);
    }
    if (transfer.status !== ASSET_TRANSFER_STATUS_PENDING) {
      return denied("TRANSFER_NOT_PENDING", "Transfer is no longer pending.");
    }
    if (isAssetTransferExpired(transfer)) {
      return denied("TRANSFER_EXPIRED", "Transfer offer has expired.", 410);
    }

    if (buildTransferRecipientBindingHash(recipientChallenge) !== transfer.recipient_binding_hash) {
      return denied("RECIPIENT_BINDING_MISMATCH", "Recipient challenge does not match this transfer.", 401);
    }

    if (authority.vaultRefHash === transfer.from_vault_ref_hash) {
      return denied("SELF_TRANSFER_REJECTED", "An asset cannot be transferred to its current owner.");
    }

    // Ownership acceptance ceremony (reuse 10D-1 consume-once ECDSA challenge).
    const { verification, error: challengeLookupError } =
      await getVaultOwnershipVerificationChallengeById(challengeId);
    if (challengeLookupError) {
      return denied("CHALLENGE_LOOKUP_FAILED", "Unable to load acceptance challenge.", 502);
    }
    if (!verification) {
      return denied("CHALLENGE_NOT_FOUND", "Acceptance challenge does not exist.", 404);
    }
    if (verification.status !== "pending" || verification.consumed_at) {
      return denied("CHALLENGE_ALREADY_USED", "Acceptance challenge was already consumed.");
    }
    if (Date.now() > Date.parse(String(verification.expires_at || ""))) {
      return denied("CHALLENGE_EXPIRED", "Acceptance challenge expired.", 410);
    }
    if (verification.challenge_type !== VAULT_OWNERSHIP_CHALLENGE_TYPE_ASSET_TRANSFER_ACCEPT) {
      return denied("CHALLENGE_ACTION_MISMATCH", "Acceptance challenge action mismatch.");
    }
    if (verification.vault_device_id !== recipientDeviceId) {
      return denied("CHALLENGE_DEVICE_MISMATCH", "Acceptance challenge is bound to a different device.");
    }
    if (verification.vault_id !== recipientVaultId) {
      return denied("CHALLENGE_VAULT_MISMATCH", "Acceptance challenge vault scope mismatch.");
    }

    const nonceHash = crypto.createHash("sha256").update(challengeNonce).digest("hex");
    if (nonceHash !== verification.challenge_nonce_hash) {
      return denied("CHALLENGE_NONCE_INVALID", "Acceptance challenge nonce is invalid.", 401);
    }

    const { ownershipKey, error: ownershipError } = await getVaultOwnershipKey(recipientVaultId);
    if (ownershipError) {
      return denied("OWNERSHIP_LOOKUP_FAILED", "Unable to load recipient ownership key.", 502);
    }
    if (!ownershipKey) {
      return denied(
        "OWNERSHIP_KEY_REQUIRED",
        "Recipient must register a vault ownership key before accepting transfers.",
        403
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
      return denied("OWNERSHIP_SIGNATURE_INVALID", "Acceptance signature verification failed.", 401);
    }

    const acceptedAt = new Date().toISOString();
    const signatureHash = crypto.createHash("sha256").update(signature).digest("hex");
    const { verification: consumed, error: consumeError } = await verifyVaultOwnershipChallenge({
      verificationId: verification.id,
      ownershipKeyId: ownershipKey.id,
      verifiedAt: acceptedAt,
      metadata: {
        verification_version: "asset_transfer_accept_v1",
        challenge_type: verification.challenge_type,
        ownership_key_algorithm: ownershipKey.algorithm || VAULT_OWNERSHIP_KEY_ALGORITHM,
        challenge_id: challengeId,
        challenge_nonce_hash: nonceHash,
        signature_hash: signatureHash,
        signature_verified: true,
      },
    });

    if (consumeError || !consumed) {
      const replay = consumeError?.code === "PGRST116" || !consumed;
      return denied(
        replay ? "CHALLENGE_ALREADY_USED" : "OWNERSHIP_VERIFY_PERSIST_FAILED",
        replay ? "Acceptance challenge was already consumed." : "Unable to persist acceptance.",
        replay ? 409 : 502
      );
    }

    const { asset, error: assetError } = await getAssetRecordById({ assetId: transfer.asset_id });
    if (assetError || !asset) {
      return denied("ASSET_NOT_FOUND", "Asset record could not be loaded.", assetError ? 502 : 404);
    }

    const result = await acceptAssetTransfer({
      transfer,
      asset,
      toVaultRefHash: authority.vaultRefHash,
      toDeviceRefHash: authority.deviceRefHash,
      acceptanceSignatureHash: signatureHash,
      acceptedAt,
    });

    if (result.error || !result.transfer) {
      const conflictCodes = ["TRANSFER_NOT_PENDING", "SOURCE_OWNERSHIP_MISMATCH", "ASSET_RETIRED"];
      const status = conflictCodes.includes(result.error?.code) ? 409 : 502;
      return denied(
        result.error?.code || "TRANSFER_ACCEPT_FAILED",
        result.error?.message || "Unable to accept transfer.",
        status
      );
    }

    return NextResponse.json({
      success: true,
      status: "accepted",
      transfer: serializeRecipientTransfer(result.transfer),
      transfer_receipt: serializeTransferReceipt(result.transfer),
      custody_event: result.event
        ? { event_type: result.event.event_type, event_hash: result.event.event_hash, created_at: result.event.created_at }
        : null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        code: "INVALID_TRANSFER_ACCEPT_REQUEST",
        error: error.message || "Invalid transfer accept request.",
      },
      { status: 400 }
    );
  }
}

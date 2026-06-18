import { vaultSignedFetch } from "./vaultDocumentClient.js";
import {
  ASSET_TYPES,
  formatAssetStatusLabel,
  formatAssetTypeLabel,
} from "./assetRegistry.js";
import { getVaultDevice } from "./vaultDevice.js";
import { signVaultOwnershipChallenge } from "./vaultOwnershipKey.js";
import { buildVaultOwnershipChallengeMessage } from "./vaultOwnershipVerification.js";
import {
  clearOwnershipRegistrationClientState,
  ensureVaultOwnershipRegistered,
  getOrCreateLocalVaultOwnershipMaterial,
} from "./vaultOwnershipClient.js";

export { ASSET_TYPES, formatAssetStatusLabel, formatAssetTypeLabel };

export function truncateAssetHash(hash, head = 12, tail = 8) {
  if (!hash || hash.length <= head + tail + 3) return hash || "—";
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function formatAssetTimestamp(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export async function listRegisteredAssets() {
  return vaultSignedFetch({
    method: "GET",
    path: "/api/assets",
  });
}

export async function getRegisteredAsset(assetId) {
  return vaultSignedFetch({
    method: "GET",
    path: `/api/assets/${assetId}`,
  });
}

export async function registerAsset(payload) {
  let ownership = await ensureVaultOwnershipRegistered();
  if (!ownership.ready) {
    return {
      ok: false,
      status: 403,
      data: {
        success: false,
        code: "OWNERSHIP_VERIFICATION_REQUIRED",
        error: ownership.error || "Vault ownership verification is required before asset registration.",
      },
    };
  }

  let result = await vaultSignedFetch({
    method: "POST",
    path: "/api/assets/register",
    body: JSON.stringify(payload),
  });

  if (
    result.status === 403 &&
    result.data?.code === "OWNERSHIP_VERIFICATION_REQUIRED"
  ) {
    // Stale local ownership marker can skip the server ceremony; clear and retry once.
    clearOwnershipRegistrationClientState();
    ownership = await ensureVaultOwnershipRegistered({ force: true });
    if (!ownership.ready) {
      return result;
    }
    result = await vaultSignedFetch({
      method: "POST",
      path: "/api/assets/register",
      body: JSON.stringify(payload),
    });
  }

  return result;
}

export async function hashClientAssetDescriptor(value) {
  return sha256Hex(String(value || "").trim().toLowerCase());
}

export async function hashClientAssetImage(value) {
  return sha256Hex(String(value || ""));
}

export async function fetchPublicAssetVerification(verificationSlug) {
  const response = await fetch(`/api/assets/verify/${encodeURIComponent(verificationSlug)}`);
  const data = await response.json().catch(() => ({}));
  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

export function formatAssetEventLabel(eventType) {
  const labels = {
    registered: "Registered",
    verified: "Verified",
    disclosed: "Disclosed",
    custody_transfer: "Custody transfer",
    ownership_claim_update: "Ownership claim updated",
    retired: "Retired",
    transfer_initiated: "Transfer offered",
    transfer_accepted: "Transfer accepted",
    transfer_declined: "Transfer declined",
    transfer_expired: "Transfer expired",
    transfer_revoked: "Transfer revoked",
  };
  return labels[eventType] || formatAssetStatusLabel(eventType);
}

export function describeAssetEvent(eventType) {
  const descriptions = {
    registered: "Asset registered and fingerprinted in ProofOrigin.",
    transfer_initiated: "Current owner offered this asset to a recipient.",
    transfer_accepted: "Recipient accepted and cryptographically co-signed the handoff.",
    transfer_declined: "The recipient declined this transfer offer.",
    transfer_expired: "The transfer offer expired before acceptance.",
    transfer_revoked: "The owner revoked this transfer offer.",
  };
  return descriptions[eventType] || "Recorded in the ProofOrigin custody timeline.";
}

export function formatTransferStatusLabel(status) {
  const labels = {
    pending: "Pending",
    accepted: "Accepted",
    declined: "Declined",
    expired: "Expired",
    revoked: "Revoked",
  };
  return labels[status] || status || "Unknown";
}

export function transferTermsLabel(terms) {
  if (terms === "custody") return "Custody only";
  return "Custody and ownership claim";
}

export function transferStatusBadgeVariant(status) {
  if (status === "accepted") return "success";
  if (status === "pending") return "cyan";
  if (status === "declined" || status === "expired" || status === "revoked") return "warning";
  return "neutral";
}

export async function listAssetTransfers(assetId) {
  return vaultSignedFetch({ method: "GET", path: `/api/assets/${assetId}/transfer` });
}

export async function createAssetTransfer(assetId, payload) {
  return vaultSignedFetch({
    method: "POST",
    path: `/api/assets/${assetId}/transfer`,
    body: JSON.stringify(payload),
  });
}

export async function revokeAssetTransfer(assetId, transferId) {
  return vaultSignedFetch({
    method: "POST",
    path: `/api/assets/${assetId}/transfer/revoke`,
    body: JSON.stringify({ transfer_id: transferId }),
  });
}

export async function listIncomingTransfers() {
  return vaultSignedFetch({ method: "GET", path: "/api/assets/transfers/incoming" });
}

export async function previewIncomingTransfer(handle, recipientChallenge) {
  return vaultSignedFetch({
    method: "POST",
    path: `/api/assets/transfers/${encodeURIComponent(handle)}/preview`,
    body: JSON.stringify({ recipient_challenge: recipientChallenge }),
  });
}

export async function declineIncomingTransfer(handle, recipientChallenge) {
  return vaultSignedFetch({
    method: "POST",
    path: `/api/assets/transfers/${encodeURIComponent(handle)}/decline`,
    body: JSON.stringify({ recipient_challenge: recipientChallenge }),
  });
}

// Accepts an incoming transfer by proving control of the recipient vault: requests
// a consume-once challenge, signs it with the local ownership key (private key never
// leaves the device), then submits the acceptance.
export async function acceptIncomingTransfer(handle, recipientChallenge) {
  const device = getVaultDevice();
  if (!device?.vault_device_id) {
    throw new Error("Vault device is not initialized.");
  }

  const challengeResult = await vaultSignedFetch({
    method: "POST",
    path: "/api/assets/transfers/challenge",
    body: JSON.stringify({}),
  });
  if (!challengeResult.ok || !challengeResult.data?.success) {
    throw new Error(challengeResult.data?.error || "Unable to start transfer acceptance.");
  }

  const challenge = challengeResult.data.challenge;
  const challengeId = String(challengeResult.data.challenge_id || "").trim().toLowerCase();
  if (!challenge || !challengeId) {
    throw new Error("Transfer acceptance challenge response is incomplete.");
  }

  const ownership = await getOrCreateLocalVaultOwnershipMaterial();
  const message = buildVaultOwnershipChallengeMessage({
    challengeId,
    challengeType: challenge.challenge_type,
    vaultId: challenge.vault_id,
    vaultDeviceId: challenge.vault_device_id || device.vault_device_id,
    challengeNonce: challenge.challenge_nonce,
    issuedAt: challenge.issued_at,
    expiresAt: challenge.expires_at,
    version: challenge.version,
  });
  const signature = await signVaultOwnershipChallenge({
    privateKey: ownership.privateKey,
    challenge: message,
  });

  return vaultSignedFetch({
    method: "POST",
    path: `/api/assets/transfers/${encodeURIComponent(handle)}/accept`,
    body: JSON.stringify({
      recipient_challenge: recipientChallenge,
      challenge_id: challengeId,
      challenge_nonce: challenge.challenge_nonce,
      signature,
      challenge: {
        version: challenge.version,
        action: challenge.challenge_type,
        challenge_type: challenge.challenge_type,
        vault_id: challenge.vault_id,
        vault_device_id: challenge.vault_device_id,
        issued_at: challenge.issued_at,
        expires_at: challenge.expires_at,
      },
    }),
  });
}

export async function verifyTransferReceiptPublic(receiptId, receiptHash) {
  const response = await fetch("/api/assets/transfers/receipt/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ receipt_id: receiptId, receipt_hash: receiptHash }),
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

export function assetStatusBadgeVariant(status) {
  if (status === "registered") return "success";
  if (status === "verified") return "success";
  if (status === "disclosed") return "cyan";
  if (status === "retired") return "warning";
  return "neutral";
}

export const ASSET_REGISTRATION_GROUPS = [
  {
    label: "Digital",
    types: ["document", "photo", "video", "audio", "certificate"],
  },
  {
    label: "Physical",
    types: ["psa_card", "memorabilia", "watch", "artwork", "collectible", "other"],
  },
];

export const ASSET_TYPE_PRESENTATION = {
  document: { icon: "DOC", help: "Contracts, certificates, records, or private files." },
  photo: { icon: "IMG", help: "Original photos or visual work you want to prove existed." },
  video: { icon: "VID", help: "Video files, clips, or production evidence." },
  audio: { icon: "AUD", help: "Voice, music, interviews, or audio source material." },
  certificate: { icon: "CERT", help: "Digital or scanned certificates and supporting proof." },
  psa_card: { icon: "PSA", help: "Graded cards with certificate numbers or visual evidence." },
  memorabilia: { icon: "MEM", help: "Signed items, collectibles, game-used gear, or COAs." },
  watch: { icon: "TIME", help: "Watches with serials, papers, photos, or appraisal evidence." },
  artwork: { icon: "ART", help: "Fine art, digital art, editions, or ownership evidence." },
  collectible: { icon: "COL", help: "Collection items that need a shareable proof page." },
  other: { icon: "ASSET", help: "Anything else you want to register and verify." },
};

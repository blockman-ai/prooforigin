import crypto from "crypto";
import {
  buildOpaqueRefHash,
  generateDisclosureToken,
  hashDisclosureValue,
} from "./vaultDisclosureGrant.js";
import { constantTimeEqualHex } from "./vaultDisclosureReceipt.js";

export const ASSET_TRANSFER_PROTOCOL_VERSION = "prooforigin-asset-transfer-v1";

export const ASSET_TRANSFER_STATUS_PENDING = "pending";
export const ASSET_TRANSFER_STATUS_ACCEPTED = "accepted";
export const ASSET_TRANSFER_STATUS_DECLINED = "declined";
export const ASSET_TRANSFER_STATUS_EXPIRED = "expired";
export const ASSET_TRANSFER_STATUS_REVOKED = "revoked";

export const ASSET_TRANSFER_STATES = Object.freeze([
  ASSET_TRANSFER_STATUS_PENDING,
  ASSET_TRANSFER_STATUS_ACCEPTED,
  ASSET_TRANSFER_STATUS_DECLINED,
  ASSET_TRANSFER_STATUS_EXPIRED,
  ASSET_TRANSFER_STATUS_REVOKED,
]);

export const ASSET_TRANSFER_TERMINAL_STATES = Object.freeze([
  ASSET_TRANSFER_STATUS_ACCEPTED,
  ASSET_TRANSFER_STATUS_DECLINED,
  ASSET_TRANSFER_STATUS_EXPIRED,
  ASSET_TRANSFER_STATUS_REVOKED,
]);

export const ASSET_TRANSFER_TERMS_CUSTODY = "custody";
export const ASSET_TRANSFER_TERMS_CUSTODY_AND_OWNERSHIP = "custody_and_ownership";

export const ASSET_TRANSFER_TERMS = Object.freeze([
  ASSET_TRANSFER_TERMS_CUSTODY,
  ASSET_TRANSFER_TERMS_CUSTODY_AND_OWNERSHIP,
]);

export const ASSET_OWNERSHIP_CLAIM_SOURCE_REGISTRATION = "registration";
export const ASSET_OWNERSHIP_CLAIM_SOURCE_TRANSFER_ACCEPT = "transfer_accept";
export const ASSET_OWNERSHIP_CLAIM_SOURCE_SELF_ATTESTED = "self_attested";
export const ASSET_OWNERSHIP_CLAIM_SOURCE_DISPUTED = "disputed_claim";

export const ASSET_OWNERSHIP_CLAIM_STATUS_CURRENT = "current";
export const ASSET_OWNERSHIP_CLAIM_STATUS_SUPERSEDED = "superseded";
export const ASSET_OWNERSHIP_CLAIM_STATUS_DISPUTED = "disputed";

// New asset custody event types introduced by the transfer protocol. These map to
// the registered_assets / asset_custody_events `custody_transfer` and
// `ownership_claim_update` event taxonomy, with the specific transfer phase carried
// in event metadata so the existing append-only hash chain is reused unchanged.
export const ASSET_TRANSFER_EVENT_INITIATED = "transfer_initiated";
export const ASSET_TRANSFER_EVENT_ACCEPTED = "transfer_accepted";
export const ASSET_TRANSFER_EVENT_DECLINED = "transfer_declined";
export const ASSET_TRANSFER_EVENT_EXPIRED = "transfer_expired";
export const ASSET_TRANSFER_EVENT_REVOKED = "transfer_revoked";

export const ASSET_TRANSFER_MAX_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const ASSET_TRANSFER_DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeRequiredString(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

function parseJsonObject(bodyText) {
  const body = bodyText ? JSON.parse(bodyText) : {};
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Request body must be a JSON object.");
  }
  return body;
}

function computeHash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

export function generateTransferId() {
  return crypto.randomUUID();
}

export function generateTransferHandle() {
  return generateDisclosureToken(24);
}

export function buildTransferPublicHandleHash(handle) {
  return hashDisclosureValue(
    normalizeRequiredString(handle, "transfer_handle"),
    "asset-transfer-handle"
  );
}

export function buildTransferRecipientBindingHash(challenge) {
  return hashDisclosureValue(
    normalizeRequiredString(challenge, "recipient_challenge"),
    "asset-transfer-recipient"
  );
}

export { buildOpaqueRefHash };

export function normalizeTransferTerms(value) {
  if (value === undefined || value === null || value === "") {
    return ASSET_TRANSFER_TERMS_CUSTODY_AND_OWNERSHIP;
  }
  const normalized = String(value).trim().toLowerCase();
  if (!ASSET_TRANSFER_TERMS.includes(normalized)) {
    throw new Error(`transfer_terms must be one of: ${ASSET_TRANSFER_TERMS.join(", ")}.`);
  }
  return normalized;
}

export function computeTransferTermsHash({ transferTerms, transferMessageHash = null }) {
  const payload = [
    ASSET_TRANSFER_PROTOCOL_VERSION,
    "transfer-terms",
    String(transferTerms || ""),
    String(transferMessageHash || ""),
  ].join("\n");
  return computeHash(payload);
}

export function computeOwnershipClaimHash({
  assetId,
  claimVersion,
  claimantVaultRefHash,
  claimSource,
  transferRef = null,
  previousClaimId = null,
  createdAt,
}) {
  const payload = [
    ASSET_TRANSFER_PROTOCOL_VERSION,
    "ownership-claim",
    String(assetId || ""),
    String(claimVersion || ""),
    String(claimantVaultRefHash || ""),
    String(claimSource || ""),
    String(transferRef || ""),
    String(previousClaimId || ""),
    String(createdAt || ""),
  ].join("\n");
  return computeHash(payload);
}

export function computeTransferReceiptHash({
  receiptId,
  transferId,
  assetId,
  fromVaultRefHash,
  toVaultRefHash,
  transferTermsHash,
  previousClaimId,
  newClaimId,
  custodyEventHash,
  provenanceRecordHash,
  result = "success",
  createdAt,
}) {
  const payload = [
    ASSET_TRANSFER_PROTOCOL_VERSION,
    "transfer-receipt",
    String(receiptId || ""),
    String(transferId || ""),
    String(assetId || ""),
    String(fromVaultRefHash || ""),
    String(toVaultRefHash || ""),
    String(transferTermsHash || ""),
    String(previousClaimId || ""),
    String(newClaimId || ""),
    String(custodyEventHash || ""),
    String(provenanceRecordHash || ""),
    String(result || "success"),
    String(createdAt || ""),
  ].join("\n");
  return computeHash(payload);
}

export function buildTransferReceiptRecord({
  receiptId,
  transferId,
  assetId,
  fromVaultRefHash,
  toVaultRefHash,
  transferTermsHash,
  previousClaimId,
  newClaimId,
  custodyEventHash,
  provenanceRecordHash,
  result = "success",
  createdAt = new Date().toISOString(),
}) {
  const receiptHash = computeTransferReceiptHash({
    receiptId,
    transferId,
    assetId,
    fromVaultRefHash,
    toVaultRefHash,
    transferTermsHash,
    previousClaimId,
    newClaimId,
    custodyEventHash,
    provenanceRecordHash,
    result,
    createdAt,
  });

  return {
    receipt_id: receiptId,
    transfer_id: transferId,
    asset_id: assetId,
    from_vault_ref_hash: fromVaultRefHash,
    to_vault_ref_hash: toVaultRefHash,
    transfer_terms_hash: transferTermsHash,
    previous_claim_id: previousClaimId,
    new_claim_id: newClaimId,
    custody_event_hash: custodyEventHash,
    provenance_record_hash: provenanceRecordHash,
    result,
    receipt_hash: receiptHash,
    created_at: createdAt,
  };
}

export function verifyTransferReceipt({ receipt, submittedReceiptHash }) {
  const dummyHash = "0".repeat(64);
  const receiptHashMatch = constantTimeEqualHex(
    submittedReceiptHash,
    receipt?.receipt_hash || dummyHash
  );

  if (!receipt || !receiptHashMatch) {
    return { kind: "denied", verified: false };
  }

  const expectedIntegrityHash = computeTransferReceiptHash({
    receiptId: receipt.receipt_id,
    transferId: receipt.transfer_id,
    assetId: receipt.asset_id,
    fromVaultRefHash: receipt.from_vault_ref_hash,
    toVaultRefHash: receipt.to_vault_ref_hash,
    transferTermsHash: receipt.transfer_terms_hash,
    previousClaimId: receipt.previous_claim_id,
    newClaimId: receipt.new_claim_id,
    custodyEventHash: receipt.custody_event_hash,
    provenanceRecordHash: receipt.provenance_record_hash,
    result: receipt.result,
    createdAt: receipt.created_at,
  });

  const integrity = constantTimeEqualHex(expectedIntegrityHash, receipt.receipt_hash);
  return {
    kind: integrity ? "verified" : "integrity_failed",
    verified: integrity,
    checks: {
      receipt_hash_match: true,
      receipt_integrity: integrity,
    },
  };
}

function normalizeExpiresAt(value, nowMs) {
  if (value === undefined || value === null || value === "") {
    return new Date(nowMs + ASSET_TRANSFER_DEFAULT_TTL_MS).toISOString();
  }
  const expiresAt = normalizeRequiredString(value, "expires_at");
  const expiresMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresMs)) {
    throw new Error("expires_at must be a valid timestamp.");
  }
  if (expiresMs <= nowMs) {
    throw new Error("expires_at must be in the future.");
  }
  if (expiresMs - nowMs > ASSET_TRANSFER_MAX_TTL_MS) {
    throw new Error("expires_at exceeds the maximum transfer TTL.");
  }
  return new Date(expiresMs).toISOString();
}

export function validateCreateTransferInput(bodyText, nowMs = Date.now()) {
  const body = parseJsonObject(bodyText);

  const recipientChallenge = normalizeRequiredString(
    body.recipient_challenge || body.recipient_secret,
    "recipient_challenge"
  );
  if (recipientChallenge.length < 16 || recipientChallenge.length > 256) {
    throw new Error("recipient_challenge must be 16 to 256 characters.");
  }

  const transferTerms = normalizeTransferTerms(body.transfer_terms);

  let transferMessageHash = null;
  if (typeof body.transfer_message === "string" && body.transfer_message.trim()) {
    transferMessageHash = computeHash(body.transfer_message.trim().slice(0, 500));
  }

  return {
    recipientChallenge,
    transferTerms,
    transferMessageHash,
    expiresAt: normalizeExpiresAt(body.expires_at, nowMs),
  };
}

export function validateTransferId(value) {
  const normalized = normalizeRequiredString(value, "transfer_id").toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error("transfer_id must be a valid UUID.");
  }
  return normalized;
}

export function isAssetTransferExpired(transfer, nowMs = Date.now()) {
  const expiresMs = Date.parse(String(transfer?.expires_at || ""));
  return Number.isFinite(expiresMs) && expiresMs <= nowMs;
}

export function isHashHex(value) {
  return HASH_PATTERN.test(String(value || "").toLowerCase());
}

export function serializeOwnerTransfer(transfer, { publicHandle = null } = {}) {
  if (!transfer) return null;
  return {
    transfer_id: transfer.transfer_id,
    asset_id: transfer.asset_id,
    status: transfer.status,
    transfer_terms: transfer.transfer_terms,
    transfer_terms_hash: transfer.transfer_terms_hash,
    expires_at: transfer.expires_at,
    created_at: transfer.created_at,
    updated_at: transfer.updated_at,
    accepted_at: transfer.accepted_at || null,
    declined_at: transfer.declined_at || null,
    revoked_at: transfer.revoked_at || null,
    transfer_receipt_id: transfer.transfer_receipt_id || null,
    ...(publicHandle ? { transfer_handle: publicHandle } : {}),
  };
}

export function serializeRecipientTransfer(transfer) {
  if (!transfer) return null;
  return {
    transfer_id: transfer.transfer_id,
    asset_id: transfer.asset_id,
    status: transfer.status,
    transfer_terms: transfer.transfer_terms,
    expires_at: transfer.expires_at,
    created_at: transfer.created_at,
    accepted_at: transfer.accepted_at || null,
    transfer_receipt_id: transfer.transfer_receipt_id || null,
  };
}

export function serializeTransferReceipt(transfer) {
  if (!transfer || !transfer.transfer_receipt_id) return null;
  return {
    receipt_id: transfer.transfer_receipt_id,
    receipt_hash: transfer.transfer_receipt_hash,
    transfer_id: transfer.transfer_id,
    created_at: transfer.accepted_at || transfer.updated_at,
  };
}

// Renders an ordered ownership chain (A -> B -> C) using only sequential owner
// labels and truncated opaque ref hashes. Never exposes identities.
export function serializePublicOwnershipChain(claims = []) {
  const ordered = [...claims].sort(
    (a, b) => Number(a.claim_version || 0) - Number(b.claim_version || 0)
  );

  return ordered.map((claim, index) => ({
    owner_label: `Owner ${index + 1}`,
    owner_ref: truncateRefHash(claim.claimant_vault_ref_hash),
    claim_version: Number(claim.claim_version || index + 1),
    claim_source: claim.claim_source,
    status: claim.status,
    is_current: claim.status === ASSET_OWNERSHIP_CLAIM_STATUS_CURRENT,
    verified_transfer:
      claim.claim_source === ASSET_OWNERSHIP_CLAIM_SOURCE_TRANSFER_ACCEPT,
    created_at: claim.created_at,
  }));
}

export function truncateRefHash(hash, head = 6, tail = 4) {
  const value = String(hash || "");
  if (value.length <= head + tail + 1) return value || "—";
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

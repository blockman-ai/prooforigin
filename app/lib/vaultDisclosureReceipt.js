import crypto from "crypto";
import {
  DISCLOSURE_EVENT_RESULTS,
  DISCLOSURE_GRANT_EVENT_TYPES,
  hashDisclosureValue,
  verifyDisclosureGrantEventChainRecords,
} from "./vaultDisclosureGrant.js";
import { DISCLOSURE_GRANT_TYPE_SCOPED_VERIFY } from "./vaultDisclosurePolicy.js";

export const DISCLOSURE_RECEIPT_RESULT_SUCCESS = "success";
export const DISCLOSURE_RECEIPT_VERIFY_UNAVAILABLE_MESSAGE =
  "Receipt could not be verified.";

const RECEIPT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECEIPT_HASH_PATTERN = /^[0-9a-f]{64}$/;
const DUMMY_RECEIPT_HASH = "0".repeat(64);

export function normalizeDisclosureReceiptTimestamp(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value || "") : date.toISOString();
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

export function computeDisclosureCustodySnapshotHash(custodySnapshot = {}) {
  return hashDisclosureValue(stableStringify(custodySnapshot), "custody-snapshot");
}

export function computeDisclosureDigest({
  grantType = DISCLOSURE_GRANT_TYPE_SCOPED_VERIFY,
  scopeType,
  purposeLabel,
  policySnapshotHash,
}) {
  const payload = [
    "prooforigin-disclosure-digest-v1",
    String(grantType || ""),
    String(scopeType || ""),
    String(purposeLabel || ""),
    String(policySnapshotHash || ""),
  ].join("\n");

  return crypto.createHash("sha256").update(payload).digest("hex");
}

export function computeDisclosureReceiptHash({
  receiptId,
  grantRef,
  policyRef,
  sessionRef,
  eventRef,
  scopeType,
  scopeRefHash,
  recipientBindingHash,
  policySnapshotHash,
  conditionProfileHash,
  custodySnapshotHash,
  disclosureDigest,
  result = DISCLOSURE_RECEIPT_RESULT_SUCCESS,
  createdAt,
}) {
  const payload = [
    "prooforigin-disclosure-receipt-v1",
    String(receiptId || ""),
    String(grantRef || ""),
    String(policyRef || ""),
    String(sessionRef || ""),
    String(eventRef || ""),
    String(scopeType || ""),
    String(scopeRefHash || ""),
    String(recipientBindingHash || ""),
    String(policySnapshotHash || ""),
    String(conditionProfileHash || ""),
    String(custodySnapshotHash || ""),
    String(disclosureDigest || ""),
    String(result || DISCLOSURE_RECEIPT_RESULT_SUCCESS),
    normalizeDisclosureReceiptTimestamp(createdAt),
  ].join("\n");

  return crypto.createHash("sha256").update(payload).digest("hex");
}

export function buildDisclosureReceiptRecord({
  receiptId,
  grantRef,
  policyRef,
  sessionRef,
  eventRef,
  scopeType,
  scopeRefHash,
  recipientBindingHash,
  policySnapshotHash,
  conditionProfileHash,
  custodySnapshotHash,
  disclosureDigest,
  result = DISCLOSURE_RECEIPT_RESULT_SUCCESS,
  createdAt = new Date().toISOString(),
}) {
  const receiptHash = computeDisclosureReceiptHash({
    receiptId,
    grantRef,
    policyRef,
    sessionRef,
    eventRef,
    scopeType,
    scopeRefHash,
    recipientBindingHash,
    policySnapshotHash,
    conditionProfileHash,
    custodySnapshotHash,
    disclosureDigest,
    result,
    createdAt,
  });

  return {
    receipt_id: receiptId,
    grant_ref: grantRef,
    policy_ref: policyRef,
    session_ref: sessionRef,
    event_ref: eventRef,
    scope_type: scopeType,
    scope_ref_hash: scopeRefHash,
    recipient_binding_hash: recipientBindingHash,
    policy_snapshot_hash: policySnapshotHash,
    condition_profile_hash: conditionProfileHash,
    custody_snapshot_hash: custodySnapshotHash,
    disclosure_digest: disclosureDigest,
    result,
    receipt_hash: receiptHash,
    created_at: createdAt,
  };
}

export function serializeOwnerDisclosureReceipt(receipt) {
  if (!receipt) return null;
  return {
    receipt_id: receipt.receipt_id,
    grant_ref: receipt.grant_ref,
    policy_ref: receipt.policy_ref,
    event_ref: receipt.event_ref,
    scope_type: receipt.scope_type,
    result: receipt.result,
    receipt_hash: receipt.receipt_hash,
    policy_snapshot_hash: receipt.policy_snapshot_hash,
    condition_profile_hash: receipt.condition_profile_hash,
    custody_snapshot_hash: receipt.custody_snapshot_hash,
    disclosure_digest: receipt.disclosure_digest,
    created_at: receipt.created_at,
  };
}

export function serializeRecipientDisclosureReceipt(receipt) {
  if (!receipt) return null;
  return {
    receipt_id: receipt.receipt_id,
    receipt_hash: receipt.receipt_hash,
    policy_snapshot_hash: receipt.policy_snapshot_hash,
    custody_snapshot_hash: receipt.custody_snapshot_hash,
    disclosure_digest: receipt.disclosure_digest,
    created_at: receipt.created_at,
  };
}

export function normalizeReceiptHash(value) {
  return String(value || "").trim().toLowerCase();
}

export function isValidReceiptHash(value) {
  return RECEIPT_HASH_PATTERN.test(normalizeReceiptHash(value));
}

export function validateReceiptId(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!RECEIPT_ID_PATTERN.test(normalized)) {
    throw new Error("receipt_id must be a valid UUID.");
  }
  return normalized;
}

export function constantTimeEqualHex(leftHex, rightHex) {
  const left = normalizeReceiptHash(leftHex);
  const right = normalizeReceiptHash(rightHex);
  const leftBuf = Buffer.alloc(64, 0);
  const rightBuf = Buffer.alloc(64, 0);

  if (RECEIPT_HASH_PATTERN.test(left)) {
    Buffer.from(left, "utf8").copy(leftBuf);
  }
  if (RECEIPT_HASH_PATTERN.test(right)) {
    Buffer.from(right, "utf8").copy(rightBuf);
  }

  const lengthsMatch = left.length === 64 && right.length === 64;
  return crypto.timingSafeEqual(leftBuf, rightBuf) && lengthsMatch;
}

export function serializePublicDisclosureReceipt(receipt) {
  if (!receipt) return null;
  return {
    receipt_id: receipt.receipt_id,
    receipt_hash: receipt.receipt_hash,
    created_at: receipt.created_at,
    scope_type: receipt.scope_type,
    result: receipt.result,
    disclosure_digest: receipt.disclosure_digest,
    policy_snapshot_hash: receipt.policy_snapshot_hash,
    custody_snapshot_hash: receipt.custody_snapshot_hash,
    event_ref: receipt.event_ref,
  };
}

export function buildUniformReceiptVerifyDeniedResponse() {
  return {
    ok: false,
    verified: false,
    status: "unavailable",
    error: DISCLOSURE_RECEIPT_VERIFY_UNAVAILABLE_MESSAGE,
  };
}

export function buildReceiptVerifyInvalidRequestResponse() {
  return {
    ok: false,
    verified: false,
    status: "invalid_request",
    error: "receipt_id and receipt_hash are required.",
  };
}

export function verifyPublicDisclosureReceipt({
  receipt,
  submittedReceiptHash,
  events = [],
}) {
  const receiptHashMatch = constantTimeEqualHex(
    submittedReceiptHash,
    receipt?.receipt_hash || DUMMY_RECEIPT_HASH
  );

  if (!receipt || !receiptHashMatch) {
    return { kind: "denied" };
  }

  const expectedIntegrityHash = computeDisclosureReceiptHash({
    receiptId: receipt.receipt_id,
    grantRef: receipt.grant_ref,
    policyRef: receipt.policy_ref,
    sessionRef: receipt.session_ref,
    eventRef: receipt.event_ref,
    scopeType: receipt.scope_type,
    scopeRefHash: receipt.scope_ref_hash,
    recipientBindingHash: receipt.recipient_binding_hash,
    policySnapshotHash: receipt.policy_snapshot_hash,
    conditionProfileHash: receipt.condition_profile_hash,
    custodySnapshotHash: receipt.custody_snapshot_hash,
    disclosureDigest: receipt.disclosure_digest,
    result: receipt.result,
    createdAt: receipt.created_at,
  });

  const receiptIntegrity = constantTimeEqualHex(expectedIntegrityHash, receipt.receipt_hash);
  const chain = verifyDisclosureGrantEventChainRecords({
    grantRef: receipt.grant_ref,
    events,
  });

  const receiptEvent = events.find(
    (event) => String(event.event_id || event.id || "") === String(receipt.event_ref || "")
  );
  const accessReceiptedEvent = Boolean(
    receiptEvent &&
      receiptEvent.event_type === DISCLOSURE_GRANT_EVENT_TYPES.ACCESS_RECEIPTED &&
      receiptEvent.result === DISCLOSURE_EVENT_RESULTS.SUCCESS
  );

  const verified = receiptIntegrity && chain.verified && accessReceiptedEvent;
  const checks = {
    receipt_hash_match: true,
    receipt_integrity: receiptIntegrity,
    event_chain_verified: chain.verified,
    access_receipted_event: accessReceiptedEvent,
  };
  const publicReceipt = serializePublicDisclosureReceipt(receipt);
  const publicChain = {
    verified: chain.verified,
    event_count: chain.event_count,
  };

  if (verified) {
    return {
      kind: "verified",
      verified: true,
      status: "verified",
      checks,
      receipt: publicReceipt,
      chain: publicChain,
    };
  }

  return {
    kind: "integrity_failed",
    verified: false,
    status: "integrity_failed",
    checks,
    receipt: publicReceipt,
    chain: publicChain,
  };
}

export function buildPublicReceiptVerifyResponse(result) {
  if (result.kind === "denied") {
    return buildUniformReceiptVerifyDeniedResponse();
  }

  return {
    ok: true,
    verified: result.verified,
    status: result.status,
    checks: result.checks,
    receipt: result.receipt,
    chain: result.chain,
  };
}

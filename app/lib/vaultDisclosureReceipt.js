import crypto from "crypto";
import { hashDisclosureValue } from "./vaultDisclosureGrant.js";
import { DISCLOSURE_GRANT_TYPE_SCOPED_VERIFY } from "./vaultDisclosurePolicy.js";

export const DISCLOSURE_RECEIPT_RESULT_SUCCESS = "success";

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

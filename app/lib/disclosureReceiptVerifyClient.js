import {
  DISCLOSURE_RECEIPT_VERIFY_UNAVAILABLE_MESSAGE,
} from "./vaultDisclosureReceipt.js";

export const DISCLOSURE_RECEIPT_VERIFY_API_PATH = "/api/disclosure/receipts/verify";

export const DISCLOSURE_RECEIPT_VERIFY_PHASE = Object.freeze({
  IDLE: "idle",
  VERIFYING: "verifying",
  AUTHENTIC: "authentic",
  INTEGRITY_WARNING: "integrity_warning",
  DENIED: "denied",
  INVALID: "invalid",
  UNAVAILABLE: "unavailable",
});

export const DISCLOSURE_RECEIPT_VERIFY_COPY = Object.freeze({
  AUTHENTIC_HEADLINE: "Receipt authentic",
  AUTHENTIC_BODY:
    "This disclosure occurred exactly as recorded by ProofOrigin. No tampering detected.",
  INTEGRITY_HEADLINE: "Integrity warning",
  INTEGRITY_BODY:
    "The receipt exists, but integrity verification failed. This record should not be trusted.",
  DENIED_HEADLINE: "Could not verify",
  DENIED_BODY:
    "We couldn't confirm this receipt. Check the receipt ID and hash from your receipt card.",
});

export const DISCLOSURE_RECEIPT_VERIFY_BADGE = Object.freeze({
  AUTHENTIC: "Authentic",
  INTEGRITY_WARNING: "Integrity warning",
  COULD_NOT_VERIFY: "Could not verify",
});

export function buildReceiptVerifyPagePath(receiptId = "") {
  const normalized = String(receiptId || "").trim();
  if (!normalized) {
    return "/verify/receipt";
  }
  return `/verify/receipt?receipt_id=${encodeURIComponent(normalized)}`;
}

export function parseReceiptVerifyQueryReceiptId(searchParams) {
  const value = searchParams?.get?.("receipt_id") || "";
  return String(value).trim();
}

export function resolveReceiptVerifyPhase(status, payload) {
  if (status === 400) {
    return DISCLOSURE_RECEIPT_VERIFY_PHASE.INVALID;
  }
  if (status === 502) {
    return DISCLOSURE_RECEIPT_VERIFY_PHASE.UNAVAILABLE;
  }
  if (status === 404 || payload?.status === "unavailable") {
    return DISCLOSURE_RECEIPT_VERIFY_PHASE.DENIED;
  }
  if (payload?.verified === true && payload?.status === "verified") {
    return DISCLOSURE_RECEIPT_VERIFY_PHASE.AUTHENTIC;
  }
  if (payload?.verified === false && payload?.status === "integrity_failed") {
    return DISCLOSURE_RECEIPT_VERIFY_PHASE.INTEGRITY_WARNING;
  }
  return DISCLOSURE_RECEIPT_VERIFY_PHASE.DENIED;
}

export function getReceiptVerifyPresentation(phase) {
  if (phase === DISCLOSURE_RECEIPT_VERIFY_PHASE.AUTHENTIC) {
    return {
      badge: DISCLOSURE_RECEIPT_VERIFY_BADGE.AUTHENTIC,
      badgeVariant: "success",
      statusVariant: "success",
      headline: DISCLOSURE_RECEIPT_VERIFY_COPY.AUTHENTIC_HEADLINE,
      body: DISCLOSURE_RECEIPT_VERIFY_COPY.AUTHENTIC_BODY,
    };
  }

  if (phase === DISCLOSURE_RECEIPT_VERIFY_PHASE.INTEGRITY_WARNING) {
    return {
      badge: DISCLOSURE_RECEIPT_VERIFY_BADGE.INTEGRITY_WARNING,
      badgeVariant: "warning",
      statusVariant: "warning",
      headline: DISCLOSURE_RECEIPT_VERIFY_COPY.INTEGRITY_HEADLINE,
      body: DISCLOSURE_RECEIPT_VERIFY_COPY.INTEGRITY_BODY,
    };
  }

  return {
    badge: DISCLOSURE_RECEIPT_VERIFY_BADGE.COULD_NOT_VERIFY,
    badgeVariant: "error",
    statusVariant: "error",
    headline: DISCLOSURE_RECEIPT_VERIFY_COPY.DENIED_HEADLINE,
    body: DISCLOSURE_RECEIPT_VERIFY_COPY.DENIED_BODY,
  };
}

export function isUniformReceiptVerifyDenial(payload) {
  return (
    payload?.ok === false &&
    payload?.verified === false &&
    payload?.status === "unavailable" &&
    payload?.error === DISCLOSURE_RECEIPT_VERIFY_UNAVAILABLE_MESSAGE
  );
}

export async function fetchReceiptVerification({ receiptId, receiptHash, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(DISCLOSURE_RECEIPT_VERIFY_API_PATH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      receipt_id: receiptId,
      receipt_hash: receiptHash,
    }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  return {
    status: response.status,
    payload,
    phase: resolveReceiptVerifyPhase(response.status, payload),
  };
}

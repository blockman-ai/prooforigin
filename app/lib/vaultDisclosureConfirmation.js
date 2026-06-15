import crypto from "crypto";
import { hashDisclosureValue } from "./vaultDisclosureGrant.js";

export const DISCLOSURE_CONFIRMATION_TTL_MS = 5 * 60 * 1000;

const pendingConfirmations = new Map();

function buildConfirmationKey(nonceHash) {
  return String(nonceHash || "").toLowerCase();
}

function pruneExpired(nowMs = Date.now()) {
  for (const [key, record] of pendingConfirmations.entries()) {
    if (record.expiresAtMs <= nowMs || record.consumed) {
      pendingConfirmations.delete(key);
    }
  }
}

export function hashDisclosureConfirmationNonce(nonce) {
  return hashDisclosureValue(String(nonce || "").trim(), "confirmation-nonce");
}

export function issueDisclosureConfirmationNonce({
  vaultRefHash,
  deviceRefHash,
  nowMs = Date.now(),
} = {}) {
  if (!vaultRefHash || !deviceRefHash) {
    throw new Error("vault_ref_hash and device_ref_hash are required.");
  }

  pruneExpired(nowMs);
  const nonce = crypto.randomBytes(32).toString("base64url");
  const nonceHash = hashDisclosureConfirmationNonce(nonce);
  const expiresAtMs = nowMs + DISCLOSURE_CONFIRMATION_TTL_MS;

  pendingConfirmations.set(buildConfirmationKey(nonceHash), {
    vaultRefHash,
    deviceRefHash,
    expiresAtMs,
    consumed: false,
  });

  return {
    confirmationNonce: nonce,
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
}

export function consumeDisclosureConfirmationNonce({
  nonce,
  vaultRefHash,
  deviceRefHash,
  nowMs = Date.now(),
} = {}) {
  const normalizedNonce = String(nonce || "").trim();
  if (!normalizedNonce) {
    return { ok: false, code: "CONFIRMATION_NONCE_REQUIRED" };
  }

  const nonceHash = hashDisclosureConfirmationNonce(normalizedNonce);
  const key = buildConfirmationKey(nonceHash);
  const record = pendingConfirmations.get(key);

  if (!record) {
    return { ok: false, code: "CONFIRMATION_NONCE_INVALID" };
  }

  if (record.consumed) {
    pendingConfirmations.delete(key);
    return { ok: false, code: "CONFIRMATION_NONCE_ALREADY_USED" };
  }

  if (record.expiresAtMs <= nowMs) {
    pendingConfirmations.delete(key);
    return { ok: false, code: "CONFIRMATION_NONCE_EXPIRED" };
  }

  if (record.vaultRefHash !== vaultRefHash || record.deviceRefHash !== deviceRefHash) {
    return { ok: false, code: "CONFIRMATION_NONCE_SCOPE_MISMATCH" };
  }

  record.consumed = true;
  pendingConfirmations.delete(key);
  pruneExpired(nowMs);
  return { ok: true };
}

export function resetDisclosureConfirmationsForTests() {
  pendingConfirmations.clear();
}

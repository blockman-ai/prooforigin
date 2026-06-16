import crypto from "crypto";
import { createVaultAdminClient, isVaultAdminConfigured } from "./vaultAdmin.js";
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

function shouldUseMemoryConfirmations() {
  if (process.env.DISCLOSURE_CONFIRMATION_MEMORY === "1") {
    return process.env.NODE_ENV !== "production";
  }
  if (process.env.NODE_ENV !== "production" && process.env.DISCLOSURE_CONFIRMATION_DB !== "1") {
    return true;
  }
  return !isVaultAdminConfigured() && process.env.NODE_ENV !== "production";
}

export function hashDisclosureConfirmationNonce(nonce) {
  return hashDisclosureValue(String(nonce || "").trim(), "confirmation-nonce");
}

function issueDisclosureConfirmationNonceMemory({
  vaultRefHash,
  deviceRefHash,
  purpose = "disclosure",
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
    purpose,
    expiresAtMs,
    consumed: false,
  });

  return {
    confirmationNonce: nonce,
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
}

export async function issueDisclosureConfirmationNonce({
  vaultRefHash,
  deviceRefHash,
  purpose = "disclosure",
  nowMs = Date.now(),
} = {}) {
  if (!vaultRefHash || !deviceRefHash) {
    throw new Error("vault_ref_hash and device_ref_hash are required.");
  }

  const nonce = crypto.randomBytes(32).toString("base64url");
  const nonceHash = hashDisclosureConfirmationNonce(nonce);
  const expiresAtMs = nowMs + DISCLOSURE_CONFIRMATION_TTL_MS;
  const expiresAt = new Date(expiresAtMs).toISOString();

  if (shouldUseMemoryConfirmations()) {
    pendingConfirmations.set(buildConfirmationKey(nonceHash), {
      vaultRefHash,
      deviceRefHash,
      purpose,
      expiresAtMs,
      consumed: false,
    });
    return { confirmationNonce: nonce, expiresAt };
  }

  try {
    const supabase = createVaultAdminClient();
    const { data, error } = await supabase.rpc("disclosure_issue_confirmation_nonce_atomic", {
      p_nonce_hash: nonceHash,
      p_vault_ref_hash: vaultRefHash,
      p_device_ref_hash: deviceRefHash,
      p_purpose: purpose,
      p_expires_at: expiresAt,
    });

    if (error || data?.ok === false) {
      if (process.env.NODE_ENV !== "production") {
        return issueDisclosureConfirmationNonceMemory({
          vaultRefHash,
          deviceRefHash,
          purpose,
          nowMs,
        });
      }
      throw error || new Error(data?.code || "CONFIRMATION_NONCE_CREATE_FAILED");
    }

    return { confirmationNonce: nonce, expiresAt };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      return issueDisclosureConfirmationNonceMemory({
        vaultRefHash,
        deviceRefHash,
        purpose,
        nowMs,
      });
    }
    throw error;
  }
}

function consumeDisclosureConfirmationNonceMemory({
  nonce,
  vaultRefHash,
  deviceRefHash,
  purpose = "disclosure",
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

  if (
    record.vaultRefHash !== vaultRefHash ||
    record.deviceRefHash !== deviceRefHash ||
    String(record.purpose || "disclosure") !== purpose
  ) {
    return { ok: false, code: "CONFIRMATION_NONCE_SCOPE_MISMATCH" };
  }

  record.consumed = true;
  pendingConfirmations.delete(key);
  pruneExpired(nowMs);
  return { ok: true };
}

export async function consumeDisclosureConfirmationNonce({
  nonce,
  vaultRefHash,
  deviceRefHash,
  purpose = "disclosure",
  nowMs = Date.now(),
} = {}) {
  const normalizedNonce = String(nonce || "").trim();
  if (!normalizedNonce) {
    return { ok: false, code: "CONFIRMATION_NONCE_REQUIRED" };
  }

  if (shouldUseMemoryConfirmations()) {
    return consumeDisclosureConfirmationNonceMemory({
      nonce,
      vaultRefHash,
      deviceRefHash,
      purpose,
      nowMs,
    });
  }

  try {
    const supabase = createVaultAdminClient();
    const { data, error } = await supabase.rpc("disclosure_consume_confirmation_nonce_atomic", {
      p_nonce_hash: hashDisclosureConfirmationNonce(normalizedNonce),
      p_vault_ref_hash: vaultRefHash,
      p_device_ref_hash: deviceRefHash,
      p_purpose: purpose,
      p_now: new Date(nowMs).toISOString(),
    });

    if (error) {
      if (process.env.NODE_ENV !== "production") {
        return consumeDisclosureConfirmationNonceMemory({
          nonce,
          vaultRefHash,
          deviceRefHash,
          purpose,
          nowMs,
        });
      }
      return { ok: false, code: "CONFIRMATION_NONCE_STORE_UNAVAILABLE" };
    }

    return {
      ok: Boolean(data?.ok),
      code: data?.code || null,
    };
  } catch {
    if (process.env.NODE_ENV !== "production") {
      return consumeDisclosureConfirmationNonceMemory({
        nonce,
        vaultRefHash,
        deviceRefHash,
        purpose,
        nowMs,
      });
    }
    return { ok: false, code: "CONFIRMATION_NONCE_STORE_UNAVAILABLE" };
  }
}

export function resetDisclosureConfirmationsForTests() {
  pendingConfirmations.clear();
}

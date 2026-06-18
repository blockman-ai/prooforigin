import { createVaultAdminClient, isVaultAdminConfigured } from "./vaultAdmin.js";
import { checkRateLimit, getVaultRequestClientIp, resetVaultRateLimitsForTests } from "./vaultRateLimit.js";

export const DISCLOSURE_ACCEPT_IP_BURST_LIMIT = 5;
export const DISCLOSURE_ACCEPT_IP_BURST_WINDOW_MS = 60_000;
export const DISCLOSURE_ACCEPT_IP_HOUR_LIMIT = 30;
export const DISCLOSURE_ACCEPT_IP_HOUR_WINDOW_MS = 60 * 60 * 1000;
export const DISCLOSURE_ACCEPT_HANDLE_BURST_LIMIT = 5;
export const DISCLOSURE_ACCEPT_HANDLE_BURST_WINDOW_MS = 60_000;

export const DISCLOSURE_VERIFY_IP_BURST_LIMIT = 10;
export const DISCLOSURE_VERIFY_IP_BURST_WINDOW_MS = 60_000;
export const DISCLOSURE_VERIFY_IP_HOUR_LIMIT = 60;
export const DISCLOSURE_VERIFY_IP_HOUR_WINDOW_MS = 60 * 60 * 1000;
export const DISCLOSURE_VERIFY_HANDLE_BURST_LIMIT = 10;
export const DISCLOSURE_VERIFY_HANDLE_BURST_WINDOW_MS = 60_000;

export const DISCLOSURE_RECEIPT_VERIFY_IP_BURST_LIMIT = 10;
export const DISCLOSURE_RECEIPT_VERIFY_IP_BURST_WINDOW_MS = 60_000;
export const DISCLOSURE_RECEIPT_VERIFY_IP_HOUR_LIMIT = 60;
export const DISCLOSURE_RECEIPT_VERIFY_IP_HOUR_WINDOW_MS = 60 * 60 * 1000;

export const DISCLOSURE_FAILURE_LOCKOUT_THRESHOLD = 8;
export const DISCLOSURE_FAILURE_LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
export const DISCLOSURE_LOCKOUT_DURATION_MS = 30 * 60 * 1000;

const failureBuckets = new Map();
const lockoutUntil = new Map();

function pruneFailureEntries(entries, now, windowMs) {
  return entries.filter((entry) => now - entry.at < windowMs);
}

function handleScope(publicHandleHash) {
  const normalized = String(publicHandleHash || "unknown").toLowerCase();
  return normalized.slice(0, 16);
}

function recipientKey(req, publicHandleHash) {
  return `${handleScope(publicHandleHash)}:${getVaultRequestClientIp(req)}`;
}

function shouldUseMemoryDisclosureLockout() {
  if (process.env.PROOFORIGIN_RATE_LIMIT_MEMORY === "1") {
    return process.env.NODE_ENV !== "production";
  }
  if (process.env.NODE_ENV === "test") {
    return true;
  }
  return !isVaultAdminConfigured() && process.env.NODE_ENV !== "production";
}

function checkDisclosureRecipientLockoutMemory(req, publicHandleHash, now = Date.now()) {
  const key = recipientKey(req, publicHandleHash);
  const lockedUntil = lockoutUntil.get(key);
  if (lockedUntil && lockedUntil > now) {
    return { locked: true, retryAfterMs: lockedUntil - now };
  }
  if (lockedUntil) {
    lockoutUntil.delete(key);
  }
  return { locked: false, retryAfterMs: 0 };
}

export async function checkDisclosureRecipientLockout(req, publicHandleHash, now = Date.now()) {
  if (shouldUseMemoryDisclosureLockout()) {
    return checkDisclosureRecipientLockoutMemory(req, publicHandleHash, now);
  }

  try {
    const supabase = createVaultAdminClient();
    const { data, error } = await supabase.rpc("prooforigin_get_lockout_state", {
      p_lockout_key: recipientKey(req, publicHandleHash),
      p_now: new Date(now).toISOString(),
    });

    if (error) {
      if (process.env.NODE_ENV !== "production") {
        return checkDisclosureRecipientLockoutMemory(req, publicHandleHash, now);
      }
      return {
        locked: true,
        retryAfterMs: DISCLOSURE_LOCKOUT_DURATION_MS,
        error,
      };
    }

    return {
      locked: Boolean(data?.locked),
      retryAfterMs: Number(data?.retry_after_ms || data?.retryAfterMs || 0),
    };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      return checkDisclosureRecipientLockoutMemory(req, publicHandleHash, now);
    }
    return {
      locked: true,
      retryAfterMs: DISCLOSURE_LOCKOUT_DURATION_MS,
      error,
    };
  }
}

function recordDisclosureRecipientFailureMemory(req, publicHandleHash, now = Date.now()) {
  const key = recipientKey(req, publicHandleHash);
  const active = pruneFailureEntries(
    failureBuckets.get(key) || [],
    now,
    DISCLOSURE_FAILURE_LOCKOUT_WINDOW_MS
  );
  active.push({ at: now });
  failureBuckets.set(key, active);

  if (active.length >= DISCLOSURE_FAILURE_LOCKOUT_THRESHOLD) {
    lockoutUntil.set(key, now + DISCLOSURE_LOCKOUT_DURATION_MS);
    failureBuckets.delete(key);
  }
}

export async function recordDisclosureRecipientFailure(req, publicHandleHash, now = Date.now()) {
  if (shouldUseMemoryDisclosureLockout()) {
    recordDisclosureRecipientFailureMemory(req, publicHandleHash, now);
    return;
  }

  try {
    const supabase = createVaultAdminClient();
    const { error } = await supabase.rpc("prooforigin_record_lockout_failure_atomic", {
      p_lockout_key: recipientKey(req, publicHandleHash),
      p_reason: "disclosure_recipient_failure",
      p_threshold: DISCLOSURE_FAILURE_LOCKOUT_THRESHOLD,
      p_window_ms: DISCLOSURE_FAILURE_LOCKOUT_WINDOW_MS,
      p_lockout_ms: DISCLOSURE_LOCKOUT_DURATION_MS,
      p_now: new Date(now).toISOString(),
    });

    if (error && process.env.NODE_ENV !== "production") {
      recordDisclosureRecipientFailureMemory(req, publicHandleHash, now);
    }
  } catch {
    if (process.env.NODE_ENV !== "production") {
      recordDisclosureRecipientFailureMemory(req, publicHandleHash, now);
    }
  }
}

async function checkBurstAndHourly({ burstKey, burstLimit, burstWindowMs, hourlyKey, hourlyLimit, hourlyWindowMs, now }) {
  const burst = await checkRateLimit({
    key: burstKey,
    limit: burstLimit,
    windowMs: burstWindowMs,
    scope: "disclosure",
    now,
  });
  if (!burst.allowed) {
    return { allowed: false, retryAfterMs: burst.retryAfterMs };
  }

  const hourly = await checkRateLimit({
    key: hourlyKey,
    limit: hourlyLimit,
    windowMs: hourlyWindowMs,
    scope: "disclosure",
    now,
  });
  if (!hourly.allowed) {
    return { allowed: false, retryAfterMs: hourly.retryAfterMs };
  }

  return { allowed: true, retryAfterMs: 0 };
}

export async function checkDisclosureAcceptRateLimit(req, publicHandleHash, now = Date.now()) {
  const lockout = await checkDisclosureRecipientLockout(req, publicHandleHash, now);
  if (lockout.locked) {
    return { allowed: false, retryAfterMs: lockout.retryAfterMs, reason: "lockout" };
  }

  const ip = getVaultRequestClientIp(req);
  const handle = handleScope(publicHandleHash);

  const ipLimits = await checkBurstAndHourly({
    burstKey: `disclosure:accept:ip:${ip}:burst`,
    burstLimit: DISCLOSURE_ACCEPT_IP_BURST_LIMIT,
    burstWindowMs: DISCLOSURE_ACCEPT_IP_BURST_WINDOW_MS,
    hourlyKey: `disclosure:accept:ip:${ip}:hour`,
    hourlyLimit: DISCLOSURE_ACCEPT_IP_HOUR_LIMIT,
    hourlyWindowMs: DISCLOSURE_ACCEPT_IP_HOUR_WINDOW_MS,
    now,
  });
  if (!ipLimits.allowed) {
    return { ...ipLimits, reason: "rate_limited" };
  }

  const handleBurst = await checkRateLimit({
    key: `disclosure:accept:handle:${handle}:burst`,
    limit: DISCLOSURE_ACCEPT_HANDLE_BURST_LIMIT,
    windowMs: DISCLOSURE_ACCEPT_HANDLE_BURST_WINDOW_MS,
    scope: "disclosure",
    now,
  });
  if (!handleBurst.allowed) {
    return { allowed: false, retryAfterMs: handleBurst.retryAfterMs, reason: "rate_limited" };
  }

  return { allowed: true, retryAfterMs: 0, reason: null };
}

export async function checkDisclosureVerifyRateLimit(req, publicHandleHash, now = Date.now()) {
  const lockout = await checkDisclosureRecipientLockout(req, publicHandleHash, now);
  if (lockout.locked) {
    return { allowed: false, retryAfterMs: lockout.retryAfterMs, reason: "lockout" };
  }

  const ip = getVaultRequestClientIp(req);
  const handle = handleScope(publicHandleHash);

  const ipLimits = await checkBurstAndHourly({
    burstKey: `disclosure:verify:ip:${ip}:burst`,
    burstLimit: DISCLOSURE_VERIFY_IP_BURST_LIMIT,
    burstWindowMs: DISCLOSURE_VERIFY_IP_BURST_WINDOW_MS,
    hourlyKey: `disclosure:verify:ip:${ip}:hour`,
    hourlyLimit: DISCLOSURE_VERIFY_IP_HOUR_LIMIT,
    hourlyWindowMs: DISCLOSURE_VERIFY_IP_HOUR_WINDOW_MS,
    now,
  });
  if (!ipLimits.allowed) {
    return { ...ipLimits, reason: "rate_limited" };
  }

  const handleBurst = await checkRateLimit({
    key: `disclosure:verify:handle:${handle}:burst`,
    limit: DISCLOSURE_VERIFY_HANDLE_BURST_LIMIT,
    windowMs: DISCLOSURE_VERIFY_HANDLE_BURST_WINDOW_MS,
    scope: "disclosure",
    now,
  });
  if (!handleBurst.allowed) {
    return { allowed: false, retryAfterMs: handleBurst.retryAfterMs, reason: "rate_limited" };
  }

  return { allowed: true, retryAfterMs: 0, reason: null };
}

export async function checkDisclosureReceiptVerifyRateLimit(req, now = Date.now()) {
  const ip = getVaultRequestClientIp(req);

  const ipLimits = await checkBurstAndHourly({
    burstKey: `disclosure:receipt-verify:ip:${ip}:burst`,
    burstLimit: DISCLOSURE_RECEIPT_VERIFY_IP_BURST_LIMIT,
    burstWindowMs: DISCLOSURE_RECEIPT_VERIFY_IP_BURST_WINDOW_MS,
    hourlyKey: `disclosure:receipt-verify:ip:${ip}:hour`,
    hourlyLimit: DISCLOSURE_RECEIPT_VERIFY_IP_HOUR_LIMIT,
    hourlyWindowMs: DISCLOSURE_RECEIPT_VERIFY_IP_HOUR_WINDOW_MS,
    now,
  });
  if (!ipLimits.allowed) {
    return { allowed: false, retryAfterMs: ipLimits.retryAfterMs, reason: "rate_limited" };
  }

  return { allowed: true, retryAfterMs: 0, reason: null };
}

export function resetDisclosureRateLimitsForTests() {
  resetVaultRateLimitsForTests();
  failureBuckets.clear();
  lockoutUntil.clear();
}

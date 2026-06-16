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

export function checkDisclosureRecipientLockout(req, publicHandleHash, now = Date.now()) {
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

export function recordDisclosureRecipientFailure(req, publicHandleHash, now = Date.now()) {
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

function checkBurstAndHourly({ burstKey, burstLimit, burstWindowMs, hourlyKey, hourlyLimit, hourlyWindowMs, now }) {
  const burst = checkRateLimit({
    key: burstKey,
    limit: burstLimit,
    windowMs: burstWindowMs,
    now,
  });
  if (!burst.allowed) {
    return { allowed: false, retryAfterMs: burst.retryAfterMs };
  }

  const hourly = checkRateLimit({
    key: hourlyKey,
    limit: hourlyLimit,
    windowMs: hourlyWindowMs,
    now,
  });
  if (!hourly.allowed) {
    return { allowed: false, retryAfterMs: hourly.retryAfterMs };
  }

  return { allowed: true, retryAfterMs: 0 };
}

export function checkDisclosureAcceptRateLimit(req, publicHandleHash, now = Date.now()) {
  const lockout = checkDisclosureRecipientLockout(req, publicHandleHash, now);
  if (lockout.locked) {
    return { allowed: false, retryAfterMs: lockout.retryAfterMs, reason: "lockout" };
  }

  const ip = getVaultRequestClientIp(req);
  const handle = handleScope(publicHandleHash);

  const ipLimits = checkBurstAndHourly({
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

  const handleBurst = checkRateLimit({
    key: `disclosure:accept:handle:${handle}:burst`,
    limit: DISCLOSURE_ACCEPT_HANDLE_BURST_LIMIT,
    windowMs: DISCLOSURE_ACCEPT_HANDLE_BURST_WINDOW_MS,
    now,
  });
  if (!handleBurst.allowed) {
    return { allowed: false, retryAfterMs: handleBurst.retryAfterMs, reason: "rate_limited" };
  }

  return { allowed: true, retryAfterMs: 0, reason: null };
}

export function checkDisclosureVerifyRateLimit(req, publicHandleHash, now = Date.now()) {
  const lockout = checkDisclosureRecipientLockout(req, publicHandleHash, now);
  if (lockout.locked) {
    return { allowed: false, retryAfterMs: lockout.retryAfterMs, reason: "lockout" };
  }

  const ip = getVaultRequestClientIp(req);
  const handle = handleScope(publicHandleHash);

  const ipLimits = checkBurstAndHourly({
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

  const handleBurst = checkRateLimit({
    key: `disclosure:verify:handle:${handle}:burst`,
    limit: DISCLOSURE_VERIFY_HANDLE_BURST_LIMIT,
    windowMs: DISCLOSURE_VERIFY_HANDLE_BURST_WINDOW_MS,
    now,
  });
  if (!handleBurst.allowed) {
    return { allowed: false, retryAfterMs: handleBurst.retryAfterMs, reason: "rate_limited" };
  }

  return { allowed: true, retryAfterMs: 0, reason: null };
}

export function resetDisclosureRateLimitsForTests() {
  resetVaultRateLimitsForTests();
  failureBuckets.clear();
  lockoutUntil.clear();
}

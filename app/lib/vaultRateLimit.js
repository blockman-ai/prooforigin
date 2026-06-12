const buckets = new Map();

export const VAULT_REGISTRATION_IP_LIMIT = 20;
export const VAULT_REGISTRATION_IP_WINDOW_MS = 60 * 60 * 1000;
export const VAULT_REGISTRATION_DEVICE_LIMIT = 5;
export const VAULT_REGISTRATION_DEVICE_WINDOW_MS = 60 * 60 * 1000;

function pruneBucket(entries, now, windowMs) {
  return entries.filter((entry) => now - entry.at < windowMs);
}

export function checkRateLimit({ key, limit, windowMs, now = Date.now() }) {
  if (!key || !Number.isFinite(limit) || limit <= 0 || !Number.isFinite(windowMs)) {
    return { allowed: true, remaining: limit, retryAfterMs: 0 };
  }

  const existing = buckets.get(key) || [];
  const active = pruneBucket(existing, now, windowMs);

  if (active.length >= limit) {
    const oldest = active[0]?.at || now;
    const retryAfterMs = Math.max(0, windowMs - (now - oldest));
    buckets.set(key, active);
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  active.push({ at: now });
  buckets.set(key, active);

  return {
    allowed: true,
    remaining: Math.max(0, limit - active.length),
    retryAfterMs: 0,
  };
}

export function getVaultRequestClientIp(req) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim() || "unknown";
  }

  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export function resetVaultRateLimitsForTests() {
  buckets.clear();
}

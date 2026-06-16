import { createVaultAdminClient, isVaultAdminConfigured } from "./vaultAdmin.js";

const buckets = new Map();

export const VAULT_REGISTRATION_IP_LIMIT = 20;
export const VAULT_REGISTRATION_IP_WINDOW_MS = 60 * 60 * 1000;
export const VAULT_REGISTRATION_DEVICE_LIMIT = 5;
export const VAULT_REGISTRATION_DEVICE_WINDOW_MS = 60 * 60 * 1000;

function pruneBucket(entries, now, windowMs) {
  return entries.filter((entry) => now - entry.at < windowMs);
}

function shouldUseMemoryRateLimit() {
  if (process.env.PROOFORIGIN_RATE_LIMIT_MEMORY === "1") {
    return process.env.NODE_ENV !== "production";
  }
  if (process.env.NODE_ENV !== "production" && process.env.PROOFORIGIN_RATE_LIMIT_DB !== "1") {
    return true;
  }
  return !isVaultAdminConfigured() && process.env.NODE_ENV !== "production";
}

function checkRateLimitMemory({ key, limit, windowMs, now = Date.now() }) {
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

export async function checkRateLimit({
  key,
  limit,
  windowMs,
  scope = "general",
  now = Date.now(),
}) {
  if (shouldUseMemoryRateLimit()) {
    return checkRateLimitMemory({ key, limit, windowMs, now });
  }

  if (!isVaultAdminConfigured()) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: windowMs || 60_000,
      error: { message: "rate_limit_store_unavailable" },
    };
  }

  try {
    const supabase = createVaultAdminClient();
    const { data, error } = await supabase.rpc("prooforigin_check_rate_limit_atomic", {
      p_bucket_key: key,
      p_scope: scope,
      p_limit: limit,
      p_window_ms: windowMs,
      p_now: new Date(now).toISOString(),
    });

    if (error) {
      if (process.env.NODE_ENV !== "production") {
        return checkRateLimitMemory({ key, limit, windowMs, now });
      }
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: windowMs || 60_000,
        error,
      };
    }

    return {
      allowed: Boolean(data?.allowed),
      remaining: Number(data?.remaining || 0),
      retryAfterMs: Number(data?.retry_after_ms || data?.retryAfterMs || 0),
    };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      return checkRateLimitMemory({ key, limit, windowMs, now });
    }
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: windowMs || 60_000,
      error,
    };
  }
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

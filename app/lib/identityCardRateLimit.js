const buckets = new Map();

export function checkRateLimit(key, maxRequests = 10, windowMs = 60_000) {
  const now = Date.now();
  const existing = buckets.get(key) || [];
  const recent = existing.filter((timestamp) => now - timestamp < windowMs);

  if (recent.length >= maxRequests) {
    const retryAfterMs = windowMs - (now - recent[0]);
    return {
      allowed: false,
      retryAfterMs: Math.max(retryAfterMs, 1000),
    };
  }

  recent.push(now);
  buckets.set(key, recent);
  return { allowed: true, retryAfterMs: 0 };
}

export function getClientRateLimitKey(req, suffix = "") {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  return `${ip}:${suffix}`;
}

import { checkRateLimit as checkSharedRateLimit, getVaultRequestClientIp, resetVaultRateLimitsForTests } from "./vaultRateLimit.js";

export async function checkRateLimit(key, maxRequests = 10, windowMs = 60_000) {
  const result = await checkSharedRateLimit({
    key: `identity-card:${key}`,
    limit: maxRequests,
    windowMs,
    scope: "identity_card",
  });
  return {
    allowed: result.allowed,
    retryAfterMs: Math.max(Number(result.retryAfterMs || 0), result.allowed ? 0 : 1000),
  };
}

export function getClientRateLimitKey(req, suffix = "") {
  const ip = getVaultRequestClientIp(req);
  return `${ip}:${suffix}`;
}

export function resetIdentityCardRateLimitsForTests() {
  resetVaultRateLimitsForTests();
}

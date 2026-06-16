import { checkRateLimit, getVaultRequestClientIp } from "./vaultRateLimit.js";

export const GUIDE_IP_LIMIT = 30;
export const GUIDE_IP_WINDOW_MS = 60 * 60 * 1000;
export const GUIDE_BURST_LIMIT = 5;
export const GUIDE_BURST_WINDOW_MS = 60 * 1000;

export function getGuideRateLimitKey(req) {
  return `guide:ip:${getVaultRequestClientIp(req)}`;
}

export async function checkGuideRateLimit(req, now = Date.now()) {
  const key = getGuideRateLimitKey(req);

  const burst = await checkRateLimit({
    key: `${key}:burst`,
    limit: GUIDE_BURST_LIMIT,
    windowMs: GUIDE_BURST_WINDOW_MS,
    scope: "guide",
    now,
  });

  if (!burst.allowed) {
    return {
      allowed: false,
      retryAfterMs: burst.retryAfterMs,
      scope: "burst",
    };
  }

  const hourly = await checkRateLimit({
    key,
    limit: GUIDE_IP_LIMIT,
    windowMs: GUIDE_IP_WINDOW_MS,
    scope: "guide",
    now,
  });

  if (!hourly.allowed) {
    return {
      allowed: false,
      retryAfterMs: hourly.retryAfterMs,
      scope: "hourly",
    };
  }

  return {
    allowed: true,
    retryAfterMs: 0,
    scope: null,
  };
}

export { resetVaultRateLimitsForTests as resetGuideRateLimitsForTests } from "./vaultRateLimit.js";

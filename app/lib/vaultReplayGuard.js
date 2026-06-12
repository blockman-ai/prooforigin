const REPLAY_CACHE_TTL_MS = 5 * 60 * 1000;
const replayCache = new Map();

export function buildVaultReplayCacheKey({ vaultDeviceId, nonce }) {
  return `${vaultDeviceId}:${String(nonce).toLowerCase()}`;
}

function pruneReplayCache(now = Date.now()) {
  for (const [key, expiresAt] of replayCache.entries()) {
    if (expiresAt <= now) {
      replayCache.delete(key);
    }
  }
}

export function reserveVaultRequestNonce({ vaultDeviceId, nonce, now = Date.now() }) {
  pruneReplayCache(now);

  const key = buildVaultReplayCacheKey({ vaultDeviceId, nonce });
  if (replayCache.has(key)) {
    return { ok: false, replay: true };
  }

  replayCache.set(key, now + REPLAY_CACHE_TTL_MS);
  return { ok: true, replay: false };
}

export function resetVaultReplayGuardForTests() {
  replayCache.clear();
}

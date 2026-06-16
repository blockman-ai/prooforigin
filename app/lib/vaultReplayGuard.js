import { createVaultAdminClient, isVaultAdminConfigured } from "./vaultAdmin.js";

const VAULT_REQUEST_NONCES_TABLE = "vault_request_nonces";
export const REPLAY_CACHE_TTL_MS = 5 * 60 * 1000;

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

function shouldUseMemoryReplayGuard() {
  if (process.env.VAULT_REPLAY_GUARD_MEMORY === "1") {
    return process.env.NODE_ENV !== "production";
  }

  return !isVaultAdminConfigured() && process.env.NODE_ENV !== "production";
}

function replayGuardUnavailableResult(error) {
  return {
    ok: false,
    replay: false,
    expired: false,
    mode: "database",
    error: error || { message: "replay_guard_store_unavailable" },
  };
}

function reserveVaultRequestNonceMemory({ vaultDeviceId, nonce, now = Date.now() }) {
  pruneReplayCache(now);

  const key = buildVaultReplayCacheKey({ vaultDeviceId, nonce });
  if (replayCache.has(key)) {
    return { ok: false, replay: true, expired: false, mode: "memory" };
  }

  replayCache.set(key, now + REPLAY_CACHE_TTL_MS);
  return { ok: true, replay: false, expired: false, mode: "memory" };
}

export async function cleanupExpiredVaultRequestNonces() {
  if (shouldUseMemoryReplayGuard()) {
    pruneReplayCache();
    return { deleted: 0, mode: "memory" };
  }

  try {
    const supabase = createVaultAdminClient();
    const { error } = await supabase
      .from(VAULT_REQUEST_NONCES_TABLE)
      .delete()
      .lt("expires_at", new Date().toISOString());

    if (error) {
      return { deleted: 0, error, mode: "database" };
    }

    return { deleted: null, mode: "database" };
  } catch (error) {
    return { deleted: 0, error, mode: "database" };
  }
}

export async function reserveVaultRequestNonce({
  vaultDeviceId,
  nonce,
  now = Date.now(),
  expiresAtMs = REPLAY_CACHE_TTL_MS,
}) {
  if (shouldUseMemoryReplayGuard()) {
    return reserveVaultRequestNonceMemory({ vaultDeviceId, nonce, now });
  }

  const expiresAt = new Date(now + expiresAtMs).toISOString();

  try {
    const supabase = createVaultAdminClient();

    const { data: existing, error: lookupError } = await supabase
      .from(VAULT_REQUEST_NONCES_TABLE)
      .select("nonce, expires_at")
      .eq("nonce", nonce)
      .maybeSingle();

    if (lookupError) {
      if (lookupError.code === "42P01") {
        if (process.env.NODE_ENV !== "production") {
          return reserveVaultRequestNonceMemory({ vaultDeviceId, nonce, now });
        }
        return replayGuardUnavailableResult(lookupError);
      }
      if (process.env.NODE_ENV !== "production") {
        return reserveVaultRequestNonceMemory({ vaultDeviceId, nonce, now });
      }
      return replayGuardUnavailableResult(lookupError);
    }

    if (existing) {
      const expired = new Date(existing.expires_at).getTime() <= now;
      return { ok: false, replay: true, expired, mode: "database" };
    }

    const { error: insertError } = await supabase.from(VAULT_REQUEST_NONCES_TABLE).insert({
      nonce,
      vault_device_id: vaultDeviceId,
      expires_at: expiresAt,
    });

    if (insertError) {
      if (insertError.code === "23505") {
        return { ok: false, replay: true, expired: false, mode: "database" };
      }

      if (insertError.code === "42P01") {
        if (process.env.NODE_ENV !== "production") {
          return reserveVaultRequestNonceMemory({ vaultDeviceId, nonce, now });
        }
        return replayGuardUnavailableResult(insertError);
      }

      if (process.env.NODE_ENV !== "production") {
        return reserveVaultRequestNonceMemory({ vaultDeviceId, nonce, now });
      }
      return replayGuardUnavailableResult(insertError);
    }

    return { ok: true, replay: false, expired: false, mode: "database" };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      return reserveVaultRequestNonceMemory({ vaultDeviceId, nonce, now });
    }
    return replayGuardUnavailableResult(error);
  }
}

export function resetVaultReplayGuardForTests() {
  replayCache.clear();
}

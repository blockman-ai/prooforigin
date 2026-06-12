import { incrementSentinelCounter, SENTINEL_OPERATIONAL_COUNTER_KEYS } from "./sentinelCounters.js";

export const VAULT_AUTH_SENTINEL_COUNTERS = Object.freeze({
  REPLAY_REJECTED: "vault.auth.replay_rejected",
  REPLAY_EXPIRED_NONCE: "vault.auth.replay_expired_nonce",
  SIGNATURE_FAILED: "vault.auth.signature_failed",
  MISSING_HEADERS: "vault.auth.missing_headers",
  DEVICE_NOT_REGISTERED: "vault.auth.device_not_registered",
  RATE_LIMITED: "vault.auth.rate_limited",
});

let incrementImpl = incrementSentinelCounter;
const recordedKeysForTests = [];

export function recordVaultAuthSentinelCounter(counterKey) {
  if (!SENTINEL_OPERATIONAL_COUNTER_KEYS.has(counterKey)) {
    return;
  }

  recordedKeysForTests.push(counterKey);
  try {
    Promise.resolve(incrementImpl(counterKey)).catch(() => {});
  } catch {
    // Best-effort only.
  }
}

export function setVaultAuthSentinelCounterIncrementForTests(fn = null) {
  incrementImpl = fn ?? incrementSentinelCounter;
}

export function resetVaultAuthSentinelCountersForTests() {
  incrementImpl = incrementSentinelCounter;
  recordedKeysForTests.length = 0;
}

export function getVaultAuthSentinelCounterCallsForTests() {
  return [...recordedKeysForTests];
}

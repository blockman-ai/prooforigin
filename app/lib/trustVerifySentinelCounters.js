import { incrementSentinelCounter, SENTINEL_OPERATIONAL_COUNTER_KEYS } from "./sentinelCounters.js";

export const TRUST_VERIFY_SENTINEL_COUNTERS = Object.freeze({
  SUCCESS: "trust.verify.success",
  INVALID_CODE: "trust.verify.invalid_code",
  CARD_NOT_FOUND: "trust.verify.card_not_found",
  REVOKED: "trust.verify.revoked",
  EXPIRED: "trust.verify.expired",
  RATE_LIMITED: "trust.verify.rate_limited",
  SERVER_ERROR: "trust.verify.server_error",
});

let incrementImpl = incrementSentinelCounter;
const recordedKeysForTests = [];

export function recordTrustVerifySentinelCounter(counterKey) {
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

export function setTrustVerifySentinelCounterIncrementForTests(fn = null) {
  incrementImpl = fn ?? incrementSentinelCounter;
}

export function resetTrustVerifySentinelCountersForTests() {
  incrementImpl = incrementSentinelCounter;
  recordedKeysForTests.length = 0;
}

export function getTrustVerifySentinelCounterCallsForTests() {
  return [...recordedKeysForTests];
}

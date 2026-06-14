import { incrementSentinelCounter, SENTINEL_OPERATIONAL_COUNTER_KEYS } from "./sentinelCounters.js";

export const TRUST_VOICE_LINK_SENTINEL_COUNTERS = Object.freeze({
  SUCCESS: "trust.voice_link.success",
  INVALID_CREDENTIALS: "trust.voice_link.invalid_credentials",
  NOT_FOUND: "trust.voice_link.not_found",
  ALREADY_LINKED: "trust.voice_link.already_linked",
  RATE_LIMITED: "trust.voice_link.rate_limited",
  SERVER_ERROR: "trust.voice_link.server_error",
  UNLINK_SUCCESS: "trust.voice_link.unlink.success",
});

let incrementImpl = incrementSentinelCounter;
const recordedKeysForTests = [];

export function recordTrustVoiceLinkSentinelCounter(counterKey) {
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

export function setTrustVoiceLinkSentinelCounterIncrementForTests(fn = null) {
  incrementImpl = fn ?? incrementSentinelCounter;
}

export function resetTrustVoiceLinkSentinelCountersForTests() {
  incrementImpl = incrementSentinelCounter;
  recordedKeysForTests.length = 0;
}

export function getTrustVoiceLinkSentinelCounterCallsForTests() {
  return [...recordedKeysForTests];
}

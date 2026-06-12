import { incrementSentinelCounter, SENTINEL_OPERATIONAL_COUNTER_KEYS } from "./sentinelCounters.js";

export const GUIDE_SENTINEL_COUNTERS = Object.freeze({
  REQUEST_TOTAL: "guide.request.total",
  MODE_OPENAI: "guide.mode.openai",
  MODE_DETERMINISTIC: "guide.mode.deterministic",
  REFUSAL_PROMPT_INJECTION: "guide.refusal.prompt_injection",
  REFUSAL_SECRET_REQUEST: "guide.refusal.secret_request",
  REFUSAL_EMPTY_QUESTION: "guide.refusal.empty_question",
  RATE_LIMITED: "guide.rate_limited",
  OUTPUT_FILTER_REJECTED: "guide.output_filter.rejected",
});

let incrementImpl = incrementSentinelCounter;
const recordedKeysForTests = [];

export function recordGuideSentinelCounter(counterKey) {
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

export function recordGuideSentinelRefusal(reason) {
  if (reason === "prompt_injection") {
    recordGuideSentinelCounter(GUIDE_SENTINEL_COUNTERS.REFUSAL_PROMPT_INJECTION);
    return;
  }

  if (reason === "secret_request") {
    recordGuideSentinelCounter(GUIDE_SENTINEL_COUNTERS.REFUSAL_SECRET_REQUEST);
    return;
  }

  if (reason === "empty_question") {
    recordGuideSentinelCounter(GUIDE_SENTINEL_COUNTERS.REFUSAL_EMPTY_QUESTION);
  }
}

export function setGuideSentinelCounterIncrementForTests(fn = null) {
  incrementImpl = fn ?? incrementSentinelCounter;
}

export function resetGuideSentinelCountersForTests() {
  incrementImpl = incrementSentinelCounter;
  recordedKeysForTests.length = 0;
}

export function getGuideSentinelCounterCallsForTests() {
  return [...recordedKeysForTests];
}

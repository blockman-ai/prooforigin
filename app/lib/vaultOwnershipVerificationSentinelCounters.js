import { incrementSentinelCounter, SENTINEL_OPERATIONAL_COUNTER_KEYS } from "./sentinelCounters.js";

export const VAULT_OWNERSHIP_VERIFICATION_SENTINEL_COUNTERS = Object.freeze({
  CHALLENGE_REQUEST_TOTAL: "vault.ownership.challenge.request_total",
  CHALLENGE_CREATED_TOTAL: "vault.ownership.challenge.created_total",
  CHALLENGE_MISSING_KEY_TOTAL: "vault.ownership.challenge.missing_key_total",
  CHALLENGE_ERROR_TOTAL: "vault.ownership.challenge.error_total",
  VERIFY_REQUEST_TOTAL: "vault.ownership.verify.request_total",
  VERIFY_SUCCESS_TOTAL: "vault.ownership.verify.success_total",
  VERIFY_EXPIRED_TOTAL: "vault.ownership.verify.expired_total",
  VERIFY_REPLAY_REJECTED_TOTAL: "vault.ownership.verify.replay_rejected_total",
  VERIFY_SIGNATURE_FAILED_TOTAL: "vault.ownership.verify.signature_failed_total",
  VERIFY_VAULT_MISMATCH_TOTAL: "vault.ownership.verify.vault_mismatch_total",
  VERIFY_DEVICE_MISMATCH_TOTAL: "vault.ownership.verify.device_mismatch_total",
  VERIFY_ACTION_MISMATCH_TOTAL: "vault.ownership.verify.action_mismatch_total",
  VERIFY_ERROR_TOTAL: "vault.ownership.verify.error_total",
});

let incrementImpl = incrementSentinelCounter;
const recordedKeysForTests = [];

export function recordVaultOwnershipVerificationSentinelCounter(counterKey) {
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

export function setVaultOwnershipVerificationSentinelCounterIncrementForTests(fn = null) {
  incrementImpl = fn ?? incrementSentinelCounter;
}

export function resetVaultOwnershipVerificationSentinelCountersForTests() {
  incrementImpl = incrementSentinelCounter;
  recordedKeysForTests.length = 0;
}

export function getVaultOwnershipVerificationSentinelCounterCallsForTests() {
  return [...recordedKeysForTests];
}

import { incrementSentinelCounter, SENTINEL_OPERATIONAL_COUNTER_KEYS } from "./sentinelCounters.js";

export const VAULT_DISCLOSURE_SENTINEL_COUNTERS = Object.freeze({
  GRANT_CREATED_TOTAL: "vault.disclosure.grant.created_total",
  FAILED_ACCEPTANCE_TOTAL: "vault.disclosure.access.failed_acceptance_total",
  FAILED_VERIFY_TOTAL: "vault.disclosure.access.failed_verify_total",
  REVOKED_ATTEMPT_TOTAL: "vault.disclosure.access.revoked_attempt_total",
  EXPIRED_ATTEMPT_TOTAL: "vault.disclosure.access.expired_attempt_total",
  REPEATED_RECIPIENT_TOTAL: "vault.disclosure.access.repeated_recipient_total",
  CREATED_AFTER_DEVICE_REGISTRATION_TOTAL:
    "vault.disclosure.grant.created_after_device_registration_total",
  CREATED_AFTER_CUSTODY_TRANSFER_TOTAL:
    "vault.disclosure.grant.created_after_custody_transfer_total",
  RATE_LIMITED_TOTAL: "vault.disclosure.access.rate_limited_total",
});

const DAY_MS = 24 * 60 * 60 * 1000;
let incrementImpl = incrementSentinelCounter;
const recordedKeysForTests = [];

export function recordVaultDisclosureSentinelCounter(counterKey) {
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

export function recordVaultDisclosureCreationContextCounters({
  registration,
  migrations = [],
  nowMs = Date.now(),
} = {}) {
  const registeredAtMs = Date.parse(String(registration?.created_at || ""));
  if (Number.isFinite(registeredAtMs) && nowMs - registeredAtMs <= DAY_MS) {
    recordVaultDisclosureSentinelCounter(
      VAULT_DISCLOSURE_SENTINEL_COUNTERS.CREATED_AFTER_DEVICE_REGISTRATION_TOTAL
    );
  }

  const hasRecentTransfer = migrations.some((migration) => {
    const completedAtMs = Date.parse(
      String(migration?.source_retired_at || migration?.completed_at || migration?.updated_at || "")
    );
    return Number.isFinite(completedAtMs) && nowMs - completedAtMs <= DAY_MS;
  });

  if (hasRecentTransfer) {
    recordVaultDisclosureSentinelCounter(
      VAULT_DISCLOSURE_SENTINEL_COUNTERS.CREATED_AFTER_CUSTODY_TRANSFER_TOTAL
    );
  }
}

export function setVaultDisclosureSentinelCounterIncrementForTests(fn = null) {
  incrementImpl = fn ?? incrementSentinelCounter;
}

export function resetVaultDisclosureSentinelCountersForTests() {
  incrementImpl = incrementSentinelCounter;
  recordedKeysForTests.length = 0;
}

export function getVaultDisclosureSentinelCounterCallsForTests() {
  return [...recordedKeysForTests];
}

import { incrementSentinelCounter, SENTINEL_OPERATIONAL_COUNTER_KEYS } from "./sentinelCounters.js";

export const VAULT_MIGRATION_PLANNING_SENTINEL_COUNTERS = Object.freeze({
  REQUEST_TOTAL: "vault.migration.planning.request_total",
  CREATED_TOTAL: "vault.migration.planning.created_total",
  UNVERIFIED_DEVICE_TOTAL: "vault.migration.planning.unverified_device_total",
  VAULT_MISMATCH_TOTAL: "vault.migration.planning.vault_mismatch_total",
  ERROR_TOTAL: "vault.migration.planning.error_total",
});

let incrementImpl = incrementSentinelCounter;
const recordedKeysForTests = [];

export function recordVaultMigrationPlanningSentinelCounter(counterKey) {
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

export function setVaultMigrationPlanningSentinelCounterIncrementForTests(fn = null) {
  incrementImpl = fn ?? incrementSentinelCounter;
}

export function resetVaultMigrationPlanningSentinelCountersForTests() {
  incrementImpl = incrementSentinelCounter;
  recordedKeysForTests.length = 0;
}

export function getVaultMigrationPlanningSentinelCounterCallsForTests() {
  return [...recordedKeysForTests];
}

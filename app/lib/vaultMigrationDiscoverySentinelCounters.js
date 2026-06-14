import { incrementSentinelCounter, SENTINEL_OPERATIONAL_COUNTER_KEYS } from "./sentinelCounters.js";

export const VAULT_MIGRATION_DISCOVERY_SENTINEL_COUNTERS = Object.freeze({
  REQUEST_TOTAL: "vault.migration.discovery.request_total",
  SUCCESS_TOTAL: "vault.migration.discovery.success_total",
  UNBOUND_DEVICE_TOTAL: "vault.migration.discovery.unbound_device_total",
  OWNERSHIP_KEY_ABSENT_TOTAL: "vault.migration.discovery.ownership_key_absent_total",
  ERROR_TOTAL: "vault.migration.discovery.error_total",
});

let incrementImpl = incrementSentinelCounter;
const recordedKeysForTests = [];

export function recordVaultMigrationDiscoverySentinelCounter(counterKey) {
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

export function setVaultMigrationDiscoverySentinelCounterIncrementForTests(fn = null) {
  incrementImpl = fn ?? incrementSentinelCounter;
}

export function resetVaultMigrationDiscoverySentinelCountersForTests() {
  incrementImpl = incrementSentinelCounter;
  recordedKeysForTests.length = 0;
}

export function getVaultMigrationDiscoverySentinelCounterCallsForTests() {
  return [...recordedKeysForTests];
}

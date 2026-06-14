import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getVaultMigrationDiscoverySentinelCounterCallsForTests,
  recordVaultMigrationDiscoverySentinelCounter,
  resetVaultMigrationDiscoverySentinelCountersForTests,
  setVaultMigrationDiscoverySentinelCounterIncrementForTests,
  VAULT_MIGRATION_DISCOVERY_SENTINEL_COUNTERS,
} from "../../app/lib/vaultMigrationDiscoverySentinelCounters.js";

test("migration discovery sentinel counters record only allowed keys", async () => {
  const writes = [];
  setVaultMigrationDiscoverySentinelCounterIncrementForTests(async (key) => {
    writes.push(key);
    return { ok: true };
  });

  recordVaultMigrationDiscoverySentinelCounter(
    VAULT_MIGRATION_DISCOVERY_SENTINEL_COUNTERS.REQUEST_TOTAL
  );
  recordVaultMigrationDiscoverySentinelCounter("vault.migration.discovery.not_allowed_key");
  recordVaultMigrationDiscoverySentinelCounter(
    VAULT_MIGRATION_DISCOVERY_SENTINEL_COUNTERS.SUCCESS_TOTAL
  );

  await Promise.resolve();
  await Promise.resolve();

  const recorded = getVaultMigrationDiscoverySentinelCounterCallsForTests();
  assert.deepEqual(recorded, [
    VAULT_MIGRATION_DISCOVERY_SENTINEL_COUNTERS.REQUEST_TOTAL,
    VAULT_MIGRATION_DISCOVERY_SENTINEL_COUNTERS.SUCCESS_TOTAL,
  ]);
  assert.deepEqual(writes, recorded);

  resetVaultMigrationDiscoverySentinelCountersForTests();
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getVaultMigrationPlanningSentinelCounterCallsForTests,
  recordVaultMigrationPlanningSentinelCounter,
  resetVaultMigrationPlanningSentinelCountersForTests,
  setVaultMigrationPlanningSentinelCounterIncrementForTests,
  VAULT_MIGRATION_PLANNING_SENTINEL_COUNTERS,
} from "../../app/lib/vaultMigrationPlanningSentinelCounters.js";

test("migration planning sentinel counters record only allowed keys", async () => {
  const writes = [];
  setVaultMigrationPlanningSentinelCounterIncrementForTests(async (key) => {
    writes.push(key);
    return { ok: true };
  });

  recordVaultMigrationPlanningSentinelCounter(
    VAULT_MIGRATION_PLANNING_SENTINEL_COUNTERS.REQUEST_TOTAL
  );
  recordVaultMigrationPlanningSentinelCounter("vault.migration.planning.not_allowed_key");
  recordVaultMigrationPlanningSentinelCounter(
    VAULT_MIGRATION_PLANNING_SENTINEL_COUNTERS.CREATED_TOTAL
  );

  await Promise.resolve();
  await Promise.resolve();

  const recorded = getVaultMigrationPlanningSentinelCounterCallsForTests();
  assert.deepEqual(recorded, [
    VAULT_MIGRATION_PLANNING_SENTINEL_COUNTERS.REQUEST_TOTAL,
    VAULT_MIGRATION_PLANNING_SENTINEL_COUNTERS.CREATED_TOTAL,
  ]);
  assert.deepEqual(writes, recorded);

  resetVaultMigrationPlanningSentinelCountersForTests();
});

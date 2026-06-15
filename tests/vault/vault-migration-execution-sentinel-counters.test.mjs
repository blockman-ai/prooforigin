import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getVaultMigrationExecutionSentinelCounterCallsForTests,
  recordVaultMigrationExecutionSentinelCounter,
  resetVaultMigrationExecutionSentinelCountersForTests,
  setVaultMigrationExecutionSentinelCounterIncrementForTests,
  VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS,
} from "../../app/lib/vaultMigrationExecutionSentinelCounters.js";

test("migration execution sentinel counters record only allowed keys", async () => {
  const writes = [];
  setVaultMigrationExecutionSentinelCounterIncrementForTests(async (key) => {
    writes.push(key);
    return { ok: true };
  });

  recordVaultMigrationExecutionSentinelCounter(
    VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.SOURCE_URL_REQUEST_TOTAL
  );
  recordVaultMigrationExecutionSentinelCounter("vault.migration.execution.not_allowed_key");
  recordVaultMigrationExecutionSentinelCounter(
    VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.STAGING_VERIFY_SUCCESS_TOTAL
  );
  recordVaultMigrationExecutionSentinelCounter(
    VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.COMMIT_SUCCESS_TOTAL
  );
  recordVaultMigrationExecutionSentinelCounter(
    VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.CLEANUP_STAGING_DELETED_TOTAL
  );
  recordVaultMigrationExecutionSentinelCounter(
    VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.RETIREMENT_ELIGIBLE_TOTAL
  );
  recordVaultMigrationExecutionSentinelCounter(
    VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.RETIREMENT_SUCCESS_TOTAL
  );

  await Promise.resolve();
  await Promise.resolve();

  const recorded = getVaultMigrationExecutionSentinelCounterCallsForTests();
  assert.deepEqual(recorded, [
    VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.SOURCE_URL_REQUEST_TOTAL,
    VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.STAGING_VERIFY_SUCCESS_TOTAL,
    VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.COMMIT_SUCCESS_TOTAL,
    VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.CLEANUP_STAGING_DELETED_TOTAL,
    VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.RETIREMENT_ELIGIBLE_TOTAL,
    VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS.RETIREMENT_SUCCESS_TOTAL,
  ]);
  assert.deepEqual(writes, recorded);

  resetVaultMigrationExecutionSentinelCountersForTests();
});

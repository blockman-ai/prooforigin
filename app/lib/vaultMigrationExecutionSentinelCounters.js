import { incrementSentinelCounter, SENTINEL_OPERATIONAL_COUNTER_KEYS } from "./sentinelCounters.js";

export const VAULT_MIGRATION_EXECUTION_SENTINEL_COUNTERS = Object.freeze({
  SOURCE_URL_REQUEST_TOTAL: "vault.migration.execution.source_url.request_total",
  SOURCE_URL_ISSUED_TOTAL: "vault.migration.execution.source_url.issued_total",
  SOURCE_URL_REJECTED_TOTAL: "vault.migration.execution.source_url.rejected_total",
  STAGING_UPLOAD_REQUEST_TOTAL: "vault.migration.execution.staging_upload.request_total",
  STAGING_UPLOAD_ISSUED_TOTAL: "vault.migration.execution.staging_upload.issued_total",
  STAGING_UPLOAD_REJECTED_TOTAL: "vault.migration.execution.staging_upload.rejected_total",
  STAGING_VERIFY_REQUEST_TOTAL: "vault.migration.execution.staging_verify.request_total",
  STAGING_VERIFY_SUCCESS_TOTAL: "vault.migration.execution.staging_verify.success_total",
  STAGING_VERIFY_FAILED_TOTAL: "vault.migration.execution.staging_verify.failed_total",
  COMMIT_REQUEST_TOTAL: "vault.migration.execution.commit.request_total",
  COMMIT_SUCCESS_TOTAL: "vault.migration.execution.commit.success_total",
  COMMIT_REJECTED_TOTAL: "vault.migration.execution.commit.rejected_total",
  COMMIT_SLOT_OCCUPIED_TOTAL: "vault.migration.execution.commit.slot_occupied_total",
  COMMIT_ROLLBACK_TOTAL: "vault.migration.execution.commit.rollback_total",
  COMMIT_FAILED_TOTAL: "vault.migration.execution.commit.failed_total",
  CLEANUP_REQUEST_TOTAL: "vault.migration.execution.cleanup.request_total",
  CLEANUP_STAGING_DELETED_TOTAL: "vault.migration.execution.cleanup.staging.deleted_total",
  CLEANUP_STAGING_MISSING_TOTAL: "vault.migration.execution.cleanup.staging.missing_total",
  CLEANUP_STAGING_FAILED_TOTAL: "vault.migration.execution.cleanup.staging.failed_total",
  CLEANUP_REJECTED_TOTAL: "vault.migration.execution.cleanup.rejected_total",
  RETIREMENT_ELIGIBLE_TOTAL: "vault.migration.execution.retirement_eligible.total",
  ERROR_TOTAL: "vault.migration.execution.error_total",
});

let incrementImpl = incrementSentinelCounter;
const recordedKeysForTests = [];

export function recordVaultMigrationExecutionSentinelCounter(counterKey) {
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

export function setVaultMigrationExecutionSentinelCounterIncrementForTests(fn = null) {
  incrementImpl = fn ?? incrementSentinelCounter;
}

export function resetVaultMigrationExecutionSentinelCountersForTests() {
  incrementImpl = incrementSentinelCounter;
  recordedKeysForTests.length = 0;
}

export function getVaultMigrationExecutionSentinelCounterCallsForTests() {
  return [...recordedKeysForTests];
}

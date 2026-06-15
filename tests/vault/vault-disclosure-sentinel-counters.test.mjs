import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getVaultDisclosureSentinelCounterCallsForTests,
  recordVaultDisclosureSentinelCounter,
  resetVaultDisclosureSentinelCountersForTests,
  setVaultDisclosureSentinelCounterIncrementForTests,
  VAULT_DISCLOSURE_SENTINEL_COUNTERS,
} from "../../app/lib/vaultDisclosureSentinelCounters.js";

test("disclosure sentinel counters record only allowed metadata-only keys", async () => {
  const writes = [];
  setVaultDisclosureSentinelCounterIncrementForTests(async (key) => {
    writes.push(key);
    return { ok: true };
  });

  recordVaultDisclosureSentinelCounter(
    VAULT_DISCLOSURE_SENTINEL_COUNTERS.GRANT_CREATED_TOTAL
  );
  recordVaultDisclosureSentinelCounter("vault.disclosure.raw_secret_leak");
  recordVaultDisclosureSentinelCounter(
    VAULT_DISCLOSURE_SENTINEL_COUNTERS.FAILED_VERIFY_TOTAL
  );
  recordVaultDisclosureSentinelCounter(
    VAULT_DISCLOSURE_SENTINEL_COUNTERS.REVOKED_ATTEMPT_TOTAL
  );
  recordVaultDisclosureSentinelCounter(
    VAULT_DISCLOSURE_SENTINEL_COUNTERS.EXPIRED_ATTEMPT_TOTAL
  );

  await Promise.resolve();
  await Promise.resolve();

  const recorded = getVaultDisclosureSentinelCounterCallsForTests();
  assert.deepEqual(recorded, [
    VAULT_DISCLOSURE_SENTINEL_COUNTERS.GRANT_CREATED_TOTAL,
    VAULT_DISCLOSURE_SENTINEL_COUNTERS.FAILED_VERIFY_TOTAL,
    VAULT_DISCLOSURE_SENTINEL_COUNTERS.REVOKED_ATTEMPT_TOTAL,
    VAULT_DISCLOSURE_SENTINEL_COUNTERS.EXPIRED_ATTEMPT_TOTAL,
  ]);
  assert.deepEqual(writes, recorded);

  resetVaultDisclosureSentinelCountersForTests();
});

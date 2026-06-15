import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SENTINEL_CUSTODY_INTELLIGENCE_VERSION,
  buildVaultSentinelCustodyIntelligence,
} from "../../app/lib/vaultSentinelCustodyIntelligence.js";

const VAULT_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_VAULT_ID = "77777777-7777-4777-8777-777777777777";
const DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const DOC_ID = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-03-15T12:00:00.000Z");

test("sentinel custody intelligence returns versioned health and signals", () => {
  const result = buildVaultSentinelCustodyIntelligence({
    vaultId: VAULT_ID,
    devices: [
      {
        vault_device_id: DEVICE_ID,
        vault_id: VAULT_ID,
        verified: true,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    documents: [
      {
        id: DOC_ID,
        vault_id: VAULT_ID,
        vault_device_id: DEVICE_ID,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    now: NOW,
  });

  assert.equal(result.sentinel_version, SENTINEL_CUSTODY_INTELLIGENCE_VERSION);
  assert.equal(result.health.score >= 0 && result.health.score <= 100, true);
  assert.equal(result.health.band, "clear");
  assert.equal(result.signals.ownership_confidence.score, 100);
  assert.equal(result.signals.device_stability.score, 100);
  assert.equal(result.observation_windows["24h"].document_events, 0);
});

test("sentinel custody intelligence triggers cleanup backlog anomaly", () => {
  const result = buildVaultSentinelCustodyIntelligence({
    vaultId: VAULT_ID,
    migrations: [
      {
        vault_id: VAULT_ID,
        state: "completed",
        created_at: "2026-03-01T00:00:00.000Z",
        updated_at: "2026-03-01T00:00:00.000Z",
        metadata: { staging_cleanup_state: "pending" },
      },
    ],
    now: NOW,
  });

  assert.equal(
    result.anomalies.some((anomaly) => anomaly.kind === "cleanup.backlog"),
    true
  );
  assert.equal(result.signals.cleanup_hygiene.score < 100, true);
  assert.equal(
    result.signals.cleanup_hygiene.reason_codes.includes("staging_cleanup_pending"),
    true
  );
});

test("sentinel custody intelligence triggers migration failure spike deterministically", () => {
  const result = buildVaultSentinelCustodyIntelligence({
    vaultId: VAULT_ID,
    migrations: [
      {
        vault_id: VAULT_ID,
        state: "failed",
        created_at: "2026-03-10T00:00:00.000Z",
        updated_at: "2026-03-10T00:00:00.000Z",
      },
      {
        vault_id: VAULT_ID,
        state: "failed",
        created_at: "2026-03-12T00:00:00.000Z",
        updated_at: "2026-03-12T00:00:00.000Z",
      },
    ],
    now: NOW,
  });

  assert.equal(
    result.anomalies.some((anomaly) => anomaly.kind === "migration.failure_spike"),
    true
  );
  assert.equal(result.signals.migration_reliability.score < 100, true);
});

test("sentinel custody intelligence scopes vault data strictly", () => {
  const result = buildVaultSentinelCustodyIntelligence({
    vaultId: VAULT_ID,
    devices: [
      {
        vault_device_id: DEVICE_ID,
        vault_id: OTHER_VAULT_ID,
        verified: false,
        created_at: "2026-03-14T00:00:00.000Z",
      },
    ],
    documentStateEvents: [
      {
        document_id: DOC_ID,
        event_type: "compromised",
        created_at: "2026-03-14T00:00:00.000Z",
      },
    ],
    documents: [
      {
        id: DOC_ID,
        vault_id: OTHER_VAULT_ID,
      },
    ],
    now: NOW,
  });

  assert.equal(result.anomalies.length, 0);
  assert.equal(result.health.score, 100);
});

test("sentinel custody intelligence scoring is deterministic for same inputs", () => {
  const input = {
    vaultId: VAULT_ID,
    devices: [
      {
        vault_device_id: DEVICE_ID,
        vault_id: VAULT_ID,
        verified: false,
        created_at: "2026-03-14T00:00:00.000Z",
      },
    ],
    now: NOW,
  };

  const first = buildVaultSentinelCustodyIntelligence(input);
  const second = buildVaultSentinelCustodyIntelligence(input);

  assert.deepEqual(first.health, second.health);
  assert.deepEqual(first.signals, second.signals);
  assert.deepEqual(first.anomalies.map((a) => a.kind), second.anomalies.map((a) => a.kind));
});

test("sentinel custody intelligence caps overall band when critical anomaly is active", () => {
  const result = buildVaultSentinelCustodyIntelligence({
    vaultId: VAULT_ID,
    documents: [
      {
        id: DOC_ID,
        vault_id: VAULT_ID,
        vault_device_id: DEVICE_ID,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    documentStateEvents: [
      {
        document_id: DOC_ID,
        event_type: "compromised",
        created_at: "2026-03-14T00:00:00.000Z",
      },
    ],
    now: NOW,
  });

  assert.equal(
    result.anomalies.some((anomaly) => anomaly.kind === "custody.compromised_active"),
    true
  );
  assert.notEqual(result.health.band, "clear");
  assert.equal(result.health.band, "attention");
  assert.equal(result.health.severity, "warning");
});

test("sentinel custody intelligence ignores platform-global metric inputs", () => {
  const result = buildVaultSentinelCustodyIntelligence({
    vaultId: VAULT_ID,
    now: NOW,
  });

  assert.equal(result.signals.storage_integrity.score, 100);
  assert.equal(result.signals.auth_integrity.score, 100);
  assert.equal(result.signals.identity_trust.score, 100);
  assert.equal(
    result.anomalies.some((anomaly) => anomaly.kind.startsWith("storage.")),
    false
  );
  assert.equal(
    result.anomalies.some((anomaly) => anomaly.kind === "auth.replay_pressure"),
    false
  );
});

test("sentinel custody intelligence never exposes sensitive fields", () => {
  const result = buildVaultSentinelCustodyIntelligence({
    vaultId: VAULT_ID,
    migrations: [
      {
        id: "99999999-9999-4999-8999-999999999999",
        vault_id: VAULT_ID,
        state: "completed",
        metadata: {
          live_storage_path: "secret/path.enc",
          staging_ciphertext_sha256: "a".repeat(64),
          staging_cleanup_state: "pending",
        },
        created_at: "2026-03-01T00:00:00.000Z",
        updated_at: "2026-03-01T00:00:00.000Z",
      },
    ],
    now: NOW,
  });

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("ciphertext"), false);
  assert.equal(serialized.includes("storage_path"), false);
  assert.equal(serialized.includes("sha256"), false);
  assert.equal(serialized.includes("secret"), false);
  assert.equal(serialized.includes(VAULT_ID), false);
  assert.equal(serialized.includes("99999999"), false);
});

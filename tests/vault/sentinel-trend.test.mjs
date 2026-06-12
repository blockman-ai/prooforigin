import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildSentinelTrendComparison,
  buildSentinelTrendReport,
  computeNumericSnapshotDelta,
  diffBlockerLists,
} from "../../app/lib/sentinelTrend.js";
import { buildSentinelSnapshotFromParts } from "../../app/lib/sentinelSnapshot.js";

const BASELINE_V1 = buildSentinelSnapshotFromParts({
  timestamp: "2026-06-12T18:35:30.262Z",
  health: { status: "ok", blockers: [] },
  vault: {
    configured: true,
    active_documents: 1,
    compromised_documents: 0,
    active_devices: 7,
    revoked_devices: 0,
    state_events: 13,
  },
  trust_pass: {
    configured: true,
    active_cards: 1,
    revoked_cards: 0,
    expired_cards: 0,
    suspicious_cards: 0,
    state_events: 2,
  },
  storage: {
    configured: true,
    active_document_count: 1,
    storage_object_count: 1,
    orphan_count: 0,
    missing_ciphertext_count: 0,
    bucket_public: false,
  },
  replay: {
    configured: true,
    expired_nonce_count: 0,
    active_nonce_count: 0,
  },
  guide: { openai_configured: true },
});

const CURRENT = buildSentinelSnapshotFromParts({
  timestamp: "2026-06-13T10:00:00.000Z",
  health: { status: "ok", blockers: [] },
  vault: {
    configured: true,
    active_documents: 1,
    compromised_documents: 0,
    active_devices: 8,
    revoked_devices: 0,
    state_events: 15,
  },
  trust_pass: {
    configured: true,
    active_cards: 2,
    revoked_cards: 0,
    expired_cards: 0,
    suspicious_cards: 0,
    state_events: 4,
  },
  storage: {
    configured: true,
    active_document_count: 1,
    storage_object_count: 1,
    orphan_count: 0,
    missing_ciphertext_count: 0,
    bucket_public: false,
  },
  replay: {
    configured: true,
    expired_nonce_count: 0,
    active_nonce_count: 1,
  },
  guide: { openai_configured: true },
});

test("computeNumericSnapshotDelta compares baseline v1 against current snapshot", () => {
  const delta = computeNumericSnapshotDelta(CURRENT, BASELINE_V1);

  assert.equal(delta["vault.active_documents"], 0);
  assert.equal(delta["vault.active_devices"], 1);
  assert.equal(delta["vault.state_events"], 2);
  assert.equal(delta["trust_pass.active_cards"], 1);
  assert.equal(delta["trust_pass.state_events"], 2);
  assert.equal(delta["storage.orphan_count"], 0);
  assert.equal(delta["replay.active_nonce_count"], 1);
});

test("buildSentinelTrendComparison flags storage and blocker changes", () => {
  const degraded = buildSentinelSnapshotFromParts({
    health: { status: "degraded", blockers: ["vault_orphan_ciphertext"] },
    storage: {
      configured: true,
      active_document_count: 1,
      storage_object_count: 2,
      orphan_count: 1,
      missing_ciphertext_count: 0,
      bucket_public: false,
    },
  });

  const comparison = buildSentinelTrendComparison(degraded, {
    id: "baseline-id",
    captured_at: "2026-06-12T18:35:30.262Z",
    label: "baseline_v1",
    snapshot: BASELINE_V1,
  });

  assert.equal(comparison.delta["storage.orphan_count"], 1);
  assert.equal(comparison.boolean_changes["health.status_changed"], true);
  assert.ok(comparison.flags.some((flag) => flag.includes("orphan_count")));
  assert.ok(comparison.blockers.added.includes("vault_orphan_ciphertext"));
});

test("buildSentinelTrendReport includes baseline metadata and deltas", () => {
  const report = buildSentinelTrendReport({
    currentSnapshot: CURRENT,
    baselineRecord: {
      id: "baseline-id",
      captured_at: "2026-06-12T18:35:30.262Z",
      label: "baseline_v1",
      snapshot: BASELINE_V1,
    },
    previousRecord: {
      id: "prev-id",
      captured_at: "2026-06-13T09:00:00.000Z",
      label: null,
      snapshot: buildSentinelSnapshotFromParts({
        vault: {
          configured: true,
          active_documents: 1,
          compromised_documents: 0,
          active_devices: 7,
          revoked_devices: 0,
          state_events: 14,
        },
      }),
    },
  });

  assert.equal(report.version, "s1");
  assert.equal(report.baseline.label, "baseline_v1");
  assert.equal(report.delta_vs_baseline["vault.state_events"], 2);
  assert.equal(report.delta_vs_previous["vault.state_events"], 1);
  assert.equal(JSON.stringify(report).includes("PROOFORIGIN_OPS_SECRET"), false);
});

test("diffBlockerLists reports added and removed blockers", () => {
  const diff = diffBlockerLists(
    { health: { blockers: ["vault_orphan_ciphertext"] } },
    { health: { blockers: [] } }
  );

  assert.deepEqual(diff.added, ["vault_orphan_ciphertext"]);
  assert.deepEqual(diff.removed, []);
});

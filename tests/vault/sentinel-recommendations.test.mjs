import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSentinelRecommendations } from "../../app/lib/sentinelRecommendations.js";
import { buildSentinelSnapshotFromParts } from "../../app/lib/sentinelSnapshot.js";

const CLEAN_SNAPSHOT = buildSentinelSnapshotFromParts({
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

const FORBIDDEN_OUTPUT_FRAGMENTS = [
  /secret_ciphertext/i,
  /auth_secret/i,
  /service_role/i,
  /api[_-]?key/i,
  /password/i,
  /\bpin\b/i,
  /recovery phrase/i,
  /-----BEGIN/i,
];

function countersFromMap(map) {
  return Object.entries(map).map(([counter_key, count]) => ({
    counter_key,
    count,
    first_seen_at: "2026-06-12T00:00:00.000Z",
    last_seen_at: "2026-06-12T18:00:00.000Z",
  }));
}

function assertNoSecretsInRecommendations(report) {
  const serialized = JSON.stringify(report);

  for (const pattern of FORBIDDEN_OUTPUT_FRAGMENTS) {
    assert.doesNotMatch(serialized, pattern, `Recommendation output must not match ${pattern}`);
  }
}

function findRecommendation(report, id) {
  return report.recommendations.find((item) => item.id === id) || null;
}

test("clean baseline returns no recommendations", () => {
  const report = buildSentinelRecommendations({
    snapshot: CLEAN_SNAPSHOT,
    counters: [],
  });

  assert.equal(report.recommendation_count, 0);
  assert.deepEqual(report.recommendations, []);
  assertNoSecretsInRecommendations(report);
});

test("public bucket recommendation is critical", () => {
  const snapshot = buildSentinelSnapshotFromParts({
    ...CLEAN_SNAPSHOT,
    storage: {
      ...CLEAN_SNAPSHOT.storage,
      bucket_public: true,
    },
  });

  const report = buildSentinelRecommendations({ snapshot, counters: [] });
  const recommendation = findRecommendation(report, "storage.bucket_public");

  assert.ok(recommendation);
  assert.equal(recommendation.severity, "critical");
  assert.equal(recommendation.category, "storage");
  assert.equal(recommendation.evidence.bucket_public, true);
  assertNoSecretsInRecommendations(report);
});

test("missing ciphertext recommendation is high severity", () => {
  const snapshot = buildSentinelSnapshotFromParts({
    ...CLEAN_SNAPSHOT,
    storage: {
      ...CLEAN_SNAPSHOT.storage,
      missing_ciphertext_count: 2,
    },
  });

  const report = buildSentinelRecommendations({ snapshot, counters: [] });
  const recommendation = findRecommendation(report, "storage.missing_ciphertext");

  assert.ok(recommendation);
  assert.equal(recommendation.severity, "high");
  assert.equal(recommendation.evidence.missing_ciphertext_count, 2);
});

test("prompt injection counter produces low guide recommendation", () => {
  const report = buildSentinelRecommendations({
    snapshot: CLEAN_SNAPSHOT,
    counters: countersFromMap({
      "guide.refusal.prompt_injection": 3,
    }),
  });

  const recommendation = findRecommendation(report, "guide.prompt_injection");

  assert.ok(recommendation);
  assert.equal(recommendation.severity, "low");
  assert.equal(recommendation.category, "guide");
  assert.equal(recommendation.evidence.prompt_injection_count, 3);
});

test("trust invalid-code ratio rule fires at medium severity", () => {
  const report = buildSentinelRecommendations({
    snapshot: CLEAN_SNAPSHOT,
    counters: countersFromMap({
      "trust.verify.invalid_code": 20,
      "trust.verify.success": 2,
    }),
  });

  const recommendation = findRecommendation(report, "trust.invalid_code_ratio");

  assert.ok(recommendation);
  assert.equal(recommendation.severity, "medium");
  assert.equal(recommendation.evidence.invalid_code_count, 20);
  assert.equal(recommendation.evidence.success_count, 2);
  assert.equal(recommendation.evidence.ratio_threshold_exceeded, true);
});

test("trust invalid-code ratio rule does not fire below minimum count", () => {
  const report = buildSentinelRecommendations({
    snapshot: CLEAN_SNAPSHOT,
    counters: countersFromMap({
      "trust.verify.invalid_code": 4,
      "trust.verify.success": 0,
    }),
  });

  assert.equal(findRecommendation(report, "trust.invalid_code_ratio"), null);
});

test("vault auth replay and signature failures produce medium recommendations", () => {
  const report = buildSentinelRecommendations({
    snapshot: CLEAN_SNAPSHOT,
    counters: countersFromMap({
      "vault.auth.replay_rejected": 7,
      "vault.auth.signature_failed": 2,
    }),
  });

  const replay = findRecommendation(report, "vault.auth.replay_rejected");
  const signature = findRecommendation(report, "vault.auth.signature_failed");

  assert.ok(replay);
  assert.equal(replay.severity, "medium");
  assert.equal(replay.evidence.replay_rejected_count, 7);

  assert.ok(signature);
  assert.equal(signature.severity, "medium");
  assert.equal(signature.evidence.signature_failed_count, 2);
  assertNoSecretsInRecommendations(report);
});

test("degraded health produces high ops recommendation with boolean evidence only", () => {
  const snapshot = buildSentinelSnapshotFromParts({
    ...CLEAN_SNAPSHOT,
    health: {
      status: "degraded",
      blockers: ["vault_orphan_ciphertext"],
    },
    storage: {
      ...CLEAN_SNAPSHOT.storage,
      orphan_count: 1,
    },
  });

  const report = buildSentinelRecommendations({ snapshot, counters: [] });
  const health = findRecommendation(report, "health.not_ok");
  const orphan = findRecommendation(report, "storage.orphan_objects");

  assert.ok(health);
  assert.equal(health.severity, "high");
  assert.equal(health.evidence.status, "degraded");
  assert.equal(health.evidence.blocker_count, 1);
  assert.equal(health.evidence.has_storage_integrity_blocker, true);
  assert.equal(typeof health.evidence.status, "string");
  assert.ok(orphan);
  assertNoSecretsInRecommendations(report);
});

test("ops route exposes sentinel_recommendations action", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");

  const routePath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../app/api/health/prooforigin/ops/route.js"
  );
  const source = fs.readFileSync(routePath, "utf8");

  assert.match(source, /sentinel_recommendations/);
  assert.match(source, /buildSentinelRecommendations/);
});

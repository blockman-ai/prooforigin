import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  buildSentinelSnapshot,
  buildSentinelSnapshotFromParts,
  buildStorageMetricsFromHealthReport,
  collectReplayMetrics,
  collectTrustPassMetrics,
  collectVaultMetrics,
  countTableRows,
  SENTINEL_SNAPSHOT_VERSION,
} from "../../app/lib/sentinelSnapshot.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function createCountMock(counts) {
  return {
    from(table) {
      return {
        select(_columns, _options) {
          const filters = [];
          const query = {
            is(column, value) {
              filters.push({ op: "is", column, value });
              return query;
            },
            not(column, operator, value) {
              filters.push({ op: "not", column, operator, value });
              return query;
            },
            eq(column, value) {
              filters.push({ op: "eq", column, value });
              return query;
            },
            lt(column, value) {
              filters.push({ op: "lt", column, value });
              return query;
            },
            gte(column, value) {
              filters.push({ op: "gte", column, value });
              return query;
            },
            then(resolve, reject) {
              const key = `${table}:${JSON.stringify(filters)}`;
              const count = counts[key];
              if (count === undefined) {
                return Promise.resolve({ count: 0, error: null }).then(resolve, reject);
              }
              if (count instanceof Error) {
                return Promise.resolve({ count: null, error: count }).then(resolve, reject);
              }
              return Promise.resolve({ count, error: null }).then(resolve, reject);
            },
          };
          return query;
        },
      };
    },
  };
}

test("buildSentinelSnapshotFromParts assembles the S0 snapshot shape", () => {
  const snapshot = buildSentinelSnapshotFromParts({
    timestamp: "2026-06-11T12:00:00.000Z",
    health: { status: "ok", blockers: [] },
    vault: {
      configured: true,
      active_documents: 4,
      compromised_documents: 0,
      active_devices: 2,
      revoked_devices: 1,
      state_events: 40,
    },
    trust_pass: {
      configured: true,
      active_cards: 18,
      revoked_cards: 2,
      expired_cards: 1,
      suspicious_cards: 0,
      state_events: 120,
    },
    storage: {
      configured: true,
      active_document_count: 4,
      storage_object_count: 4,
      orphan_count: 0,
      missing_ciphertext_count: 0,
      bucket_public: false,
    },
    replay: {
      configured: true,
      expired_nonce_count: 3,
      active_nonce_count: 1,
    },
    guide: { openai_configured: true },
  });

  assert.equal(snapshot.service, "prooforigin-sentinel");
  assert.equal(snapshot.version, SENTINEL_SNAPSHOT_VERSION);
  assert.equal(snapshot.health.status, "ok");
  assert.equal(snapshot.vault.active_documents, 4);
  assert.equal(snapshot.trust_pass.active_cards, 18);
  assert.equal(snapshot.storage.orphan_count, 0);
  assert.equal(snapshot.replay.expired_nonce_count, 3);
  assert.equal(snapshot.guide.openai_configured, true);
});

test("buildStorageMetricsFromHealthReport maps health storage audit fields", () => {
  const metrics = buildStorageMetricsFromHealthReport({
    vault: { admin_configured: true, bucket_public: false },
    storage_audit: {
      active_document_count: 4,
      storage_object_count: 5,
      orphan_count: 1,
      missing_ciphertext_count: 0,
    },
  });

  assert.equal(metrics.configured, true);
  assert.equal(metrics.active_document_count, 4);
  assert.equal(metrics.orphan_count, 1);
  assert.equal(metrics.bucket_public, false);
});

test("collectVaultMetrics returns aggregate counts without secret fields", async () => {
  const supabase = createCountMock({
    'vault_documents:[{"op":"is","column":"deleted_at","value":null}]': 4,
    'vault_documents:[{"op":"is","column":"deleted_at","value":null},{"op":"not","column":"compromised_at","operator":"is","value":null}]': 1,
    'vault_device_registrations:[{"op":"is","column":"revoked_at","value":null}]': 2,
    'vault_device_registrations:[{"op":"not","column":"revoked_at","operator":"is","value":null}]': 1,
    "vault_document_state_events:[]": 40,
  });

  const metrics = await collectVaultMetrics(supabase);

  assert.equal(metrics.configured, true);
  assert.equal(metrics.active_documents, 4);
  assert.equal(metrics.compromised_documents, 1);
  assert.equal(metrics.active_devices, 2);
  assert.equal(metrics.revoked_devices, 1);
  assert.equal(metrics.state_events, 40);
  assert.equal(Object.hasOwn(metrics, "pin"), false);
});

test("collectTrustPassMetrics returns trust state counts", async () => {
  const supabase = createCountMock({
    'identity_cards:[{"op":"eq","column":"trust_state","value":"active"}]': 18,
    'identity_cards:[{"op":"eq","column":"trust_state","value":"revoked"}]': 2,
    'identity_cards:[{"op":"eq","column":"trust_state","value":"expired"}]': 1,
    'identity_cards:[{"op":"eq","column":"trust_state","value":"suspicious"}]': 0,
    "identity_card_state_events:[]": 120,
  });

  const metrics = await collectTrustPassMetrics(supabase);

  assert.equal(metrics.active_cards, 18);
  assert.equal(metrics.revoked_cards, 2);
  assert.equal(metrics.state_events, 120);
});

test("collectReplayMetrics counts expired and active nonces", async () => {
  const supabase = createCountMock({
    'vault_request_nonces:[{"op":"lt","column":"expires_at","value":"2026-06-11T12:00:00.000Z"}]': 3,
    'vault_request_nonces:[{"op":"gte","column":"expires_at","value":"2026-06-11T12:00:00.000Z"}]': 1,
  });

  const originalDate = Date;
  global.Date = class extends Date {
    constructor(...args) {
      if (args.length === 0) {
        super("2026-06-11T12:00:00.000Z");
      } else {
        super(...args);
      }
    }

    static now() {
      return new originalDate("2026-06-11T12:00:00.000Z").getTime();
    }

    toISOString() {
      return "2026-06-11T12:00:00.000Z";
    }
  };

  try {
    const metrics = await collectReplayMetrics(supabase);
    assert.equal(metrics.expired_nonce_count, 3);
    assert.equal(metrics.active_nonce_count, 1);
  } finally {
    global.Date = originalDate;
  }
});

test("countTableRows returns null when query fails", async () => {
  const supabase = createCountMock({
    "vault_documents:[]": new Error("relation missing"),
  });

  const count = await countTableRows(supabase, "vault_documents");
  assert.equal(count, null);
});

test("buildSentinelSnapshot returns null metrics when supabase is not configured", async () => {
  const snapshot = await buildSentinelSnapshot({
    loadHealthReport: async () => ({
      timestamp: "2026-06-11T12:00:00.000Z",
      status: "error",
      blockers: ["supabase_not_configured"],
      guide: { openai_configured: false },
    }),
  });

  assert.equal(snapshot.health.status, "error");
  assert.equal(snapshot.vault.active_documents, null);
  assert.equal(snapshot.trust_pass.active_cards, null);
  assert.equal(snapshot.storage.orphan_count, null);
  assert.equal(snapshot.replay.expired_nonce_count, null);
  assert.equal(JSON.stringify(snapshot).includes("SUPABASE_SERVICE_ROLE_KEY"), false);
});

test("ops route exposes read-only sentinel_snapshot action", () => {
  const source = readFileSync(
    join(__dirname, "../../app/api/health/prooforigin/ops/route.js"),
    "utf8"
  );

  assert.match(source, /sentinel_snapshot/);
  assert.match(source, /sentinel_persist/);
  assert.match(source, /sentinel_trend/);
  assert.match(source, /sentinel_pin_baseline/);
  assert.match(source, /buildSentinelSnapshot/);
});

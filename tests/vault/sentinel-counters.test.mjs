import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  getSentinelCounters,
  incrementSentinelCounter,
  SENTINEL_COUNTERS_TABLE,
  validateSentinelCounterKey,
} from "../../app/lib/sentinelCounters.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function withSupabaseEnv(run) {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

  return run().finally(() => {
    if (originalUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    }

    if (originalKey === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    }
  });
}

function createCounterMock(initialRows = []) {
  const rows = new Map(initialRows.map((row) => [row.counter_key, { ...row }]));
  let rpcShouldFail = false;

  return {
    rows,
    setRpcFailure(shouldFail) {
      rpcShouldFail = shouldFail;
    },
    client: {
      rpc(name, params) {
        assert.equal(name, "sentinel_increment_counter");

        if (rpcShouldFail) {
          return Promise.resolve({
            error: { message: "rpc unavailable" },
          });
        }

        const key = params.p_counter_key;
        const amount = Number(params.p_amount);
        const existing = rows.get(key);

        if (existing) {
          existing.count += amount;
          existing.last_seen_at = new Date().toISOString();
        } else {
          const now = new Date().toISOString();
          rows.set(key, {
            counter_key: key,
            count: amount,
            first_seen_at: now,
            last_seen_at: now,
          });
        }

        return Promise.resolve({ error: null });
      },
      from(table) {
        assert.equal(table, SENTINEL_COUNTERS_TABLE);

        return {
          select(_columns) {
            return {
              order(_field, _options) {
                return Promise.resolve({
                  data: [...rows.values()],
                  error: null,
                });
              },
            };
          },
        };
      },
    },
  };
}

test("valid counter increment updates durable count", async () => {
  await withSupabaseEnv(async () => {
    const mock = createCounterMock();

    const result = await incrementSentinelCounter("guide.request.success", 2, {
      supabase: mock.client,
    });

    assert.equal(result.ok, true);
    assert.equal(mock.rows.get("guide.request.success").count, 2);

    const second = await incrementSentinelCounter("guide.request.success", 1, {
      supabase: mock.client,
    });

    assert.equal(second.ok, true);
    assert.equal(mock.rows.get("guide.request.success").count, 3);
  });
});

test("invalid counter key is rejected without writing", async () => {
  await withSupabaseEnv(async () => {
    const mock = createCounterMock();

    const result = await incrementSentinelCounter("metrics.unknown.event", 1, {
      supabase: mock.client,
    });

    assert.equal(result.ok, false);
    assert.equal(result.error, "counter_key_prefix_not_allowed");
    assert.equal(mock.rows.size, 0);
  });
});

test("getSentinelCounters applies prefix filter", async () => {
  await withSupabaseEnv(async () => {
    const mock = createCounterMock([
      {
        counter_key: "guide.request.success",
        count: 3,
        first_seen_at: "2026-06-12T00:00:00.000Z",
        last_seen_at: "2026-06-12T01:00:00.000Z",
      },
      {
        counter_key: "vault.auth.nonce_replay",
        count: 1,
        first_seen_at: "2026-06-12T00:00:00.000Z",
        last_seen_at: "2026-06-12T01:00:00.000Z",
      },
      {
        counter_key: "trust.verify.rate_limited",
        count: 5,
        first_seen_at: "2026-06-12T00:00:00.000Z",
        last_seen_at: "2026-06-12T01:00:00.000Z",
      },
    ]);

    const all = await getSentinelCounters(null, { supabase: mock.client });
    const guideOnly = await getSentinelCounters("guide.", { supabase: mock.client });

    assert.equal(all.ok, true);
    assert.equal(all.counters.length, 3);
    assert.equal(guideOnly.ok, true);
    assert.equal(guideOnly.counters.length, 1);
    assert.equal(guideOnly.counters[0].counter_key, "guide.request.success");
  });
});

test("incrementSentinelCounter is best-effort and does not throw on write failure", async () => {
  await withSupabaseEnv(async () => {
    const mock = createCounterMock();
    mock.setRpcFailure(true);

    let threw = false;
    let result = null;

    try {
      result = await incrementSentinelCounter("vault.auth.signature_invalid", 1, {
        supabase: mock.client,
      });
    } catch {
      threw = true;
    }

    assert.equal(threw, false);
    assert.equal(result.ok, false);
    assert.equal(result.error, "counter_write_failed");
  });
});

test("secret-looking counter keys are rejected", () => {
  const cases = [
    "guide.question.raw",
    "vault.auth.pin_failure",
    "trust.verify.user_ip",
    "guide.request.recovery_phrase",
    "vault.auth.service_role_access",
  ];

  for (const counterKey of cases) {
    const validation = validateSentinelCounterKey(counterKey);
    assert.equal(validation.valid, false, counterKey);
  }

  const safe = validateSentinelCounterKey("guide.request.blocked");
  assert.equal(safe.valid, true);

  for (const counterKey of [
    "guide.request.total",
    "guide.mode.openai",
    "guide.refusal.secret_request",
    "guide.refusal.empty_question",
    "guide.output_filter.rejected",
  ]) {
    assert.equal(validateSentinelCounterKey(counterKey).valid, true, counterKey);
  }
});

test("ops route exposes sentinel_counters action", () => {
  const source = readFileSync(
    join(__dirname, "../../app/api/health/prooforigin/ops/route.js"),
    "utf8"
  );

  assert.match(source, /sentinel_counters/);
  assert.match(source, /getSentinelCounters/);
});

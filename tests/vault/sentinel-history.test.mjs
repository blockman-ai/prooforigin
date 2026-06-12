import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSentinelSnapshotFromParts } from "../../app/lib/sentinelSnapshot.js";
import {
  getLatestSentinelSnapshotHistory,
  getSentinelSnapshotByLabel,
  persistSentinelSnapshot,
  pinSentinelBaseline,
  SENTINEL_SNAPSHOT_HISTORY_TABLE,
} from "../../app/lib/sentinelSnapshotHistory.js";

function createHistoryMock(initialRows = []) {
  const rows = [...initialRows];

  return {
    rows,
    client: {
      from(table) {
        assert.equal(table, SENTINEL_SNAPSHOT_HISTORY_TABLE);
        const state = {
          filters: [],
          orderField: null,
          ascending: true,
          limitValue: null,
          mode: "select",
          payload: null,
        };

        const query = {
          insert(payload) {
            state.mode = "insert";
            state.payload = payload;
            return query;
          },
          select(_columns) {
            return query;
          },
          eq(column, value) {
            state.filters.push({ column, value });
            return query;
          },
          order(field, { ascending }) {
            state.orderField = field;
            state.ascending = ascending;
            return query;
          },
          limit(value) {
            state.limitValue = value;
            return query;
          },
          maybeSingle() {
            return query.execute().then((result) => ({
              data: result.data[0] || null,
              error: null,
            }));
          },
          single() {
            return query.execute().then((result) => {
              if (state.mode === "insert") {
                const record = result.data[0];
                return { data: record, error: null };
              }

              return {
                data: result.data[0] || null,
                error: null,
              };
            });
          },
          execute() {
            if (state.mode === "insert") {
              const record = {
                id: `row-${rows.length + 1}`,
                captured_at: state.payload.captured_at,
                version: state.payload.version,
                label: state.payload.label,
                snapshot: state.payload.snapshot,
                source: state.payload.source,
              };
              rows.push(record);
              return Promise.resolve({ data: [record], error: null });
            }

            let matches = [...rows];
            for (const filter of state.filters) {
              matches = matches.filter((row) => row[filter.column] === filter.value);
            }

            if (state.orderField) {
              matches.sort((left, right) => {
                const cmp = String(left[state.orderField]).localeCompare(String(right[state.orderField]));
                return state.ascending ? cmp : -cmp;
              });
            }

            if (state.limitValue != null) {
              matches = matches.slice(0, state.limitValue);
            }

            return Promise.resolve({ data: matches, error: null });
          },
          then(resolve, reject) {
            return query.execute().then(resolve, reject);
          },
        };

        return query;
      },
    },
  };
}

const SAMPLE_SNAPSHOT = buildSentinelSnapshotFromParts({
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
});

test("persistSentinelSnapshot stores snapshot JSON without secret fields", async () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

  const mock = createHistoryMock();

  try {
    const result = await persistSentinelSnapshot({
      snapshot: SAMPLE_SNAPSHOT,
      label: "baseline_v1",
      supabase: mock.client,
    });

    assert.equal(result.ok, true);
    assert.equal(result.record.label, "baseline_v1");
    assert.equal(mock.rows.length, 1);
    assert.equal(JSON.stringify(result.record).includes("service-role-key"), false);
  } finally {
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
  }
});

test("pinSentinelBaseline is idempotent for the same label", async () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

  const mock = createHistoryMock();

  try {
    const first = await pinSentinelBaseline({
      snapshot: SAMPLE_SNAPSHOT,
      label: "baseline_v1",
      supabase: mock.client,
    });
    const second = await pinSentinelBaseline({
      snapshot: SAMPLE_SNAPSHOT,
      label: "baseline_v1",
      supabase: mock.client,
    });

    assert.equal(first.ok, true);
    assert.equal(first.already_pinned, false);
    assert.equal(second.ok, true);
    assert.equal(second.already_pinned, true);
    assert.equal(mock.rows.length, 1);
    assert.equal(second.record.id, first.record.id);
  } finally {
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
  }
});

test("history readers return latest labeled and recent snapshots", async () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

  const mock = createHistoryMock([
    {
      id: "older",
      captured_at: "2026-06-12T18:00:00.000Z",
      version: "s0",
      label: "baseline_v1",
      snapshot: SAMPLE_SNAPSHOT,
      source: "ops",
    },
    {
      id: "newer",
      captured_at: "2026-06-13T10:00:00.000Z",
      version: "s0",
      label: null,
      snapshot: SAMPLE_SNAPSHOT,
      source: "ops",
    },
  ]);

  try {
    const labeled = await getSentinelSnapshotByLabel("baseline_v1", { supabase: mock.client });
    const latest = await getLatestSentinelSnapshotHistory({ supabase: mock.client, limit: 1 });

    assert.equal(labeled.id, "older");
    assert.equal(latest[0].id, "newer");
  } finally {
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
  }
});
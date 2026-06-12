import { getSupabaseAdmin, isSupabaseAdminConfigured } from "./supabaseAdmin.js";

export const SENTINEL_SNAPSHOT_HISTORY_TABLE = "sentinel_snapshot_history";

export const SENTINEL_SNAPSHOT_SOURCES = ["ops", "cron", "manual"];

function normalizeLabel(label) {
  const value = String(label || "").trim();
  return value || null;
}

function normalizeSource(source) {
  const value = String(source || "ops").trim().toLowerCase();
  return SENTINEL_SNAPSHOT_SOURCES.includes(value) ? value : "ops";
}

export function mapSentinelHistoryRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    captured_at: row.captured_at,
    version: row.version,
    label: row.label ?? null,
    snapshot: row.snapshot,
    source: row.source,
  };
}

export async function persistSentinelSnapshot({
  snapshot,
  label = null,
  source = "ops",
  supabase = null,
} = {}) {
  if (!snapshot?.service || !snapshot?.version) {
    throw new Error("Sentinel snapshot is required.");
  }

  if (!isSupabaseAdminConfigured()) {
    return {
      ok: false,
      error: "supabase_not_configured",
    };
  }

  const client = supabase ?? getSupabaseAdmin();
  const payload = {
    captured_at: snapshot.timestamp || new Date().toISOString(),
    version: String(snapshot.version),
    label: normalizeLabel(label),
    snapshot,
    source: normalizeSource(source),
  };

  const { data, error } = await client
    .from(SENTINEL_SNAPSHOT_HISTORY_TABLE)
    .insert(payload)
    .select("id, captured_at, version, label, snapshot, source")
    .single();

  if (error) {
    if (/relation .* does not exist|schema cache/i.test(error.message || "")) {
      return {
        ok: false,
        error: "sentinel_history_table_missing",
        message: error.message,
      };
    }

    throw error;
  }

  return {
    ok: true,
    record: mapSentinelHistoryRow(data),
  };
}

export async function getSentinelSnapshotByLabel(label, { supabase = null } = {}) {
  const normalized = normalizeLabel(label);
  if (!normalized || !isSupabaseAdminConfigured()) {
    return null;
  }

  const client = supabase ?? getSupabaseAdmin();
  const { data, error } = await client
    .from(SENTINEL_SNAPSHOT_HISTORY_TABLE)
    .select("id, captured_at, version, label, snapshot, source")
    .eq("label", normalized)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (/relation .* does not exist|schema cache/i.test(error.message || "")) {
      return null;
    }

    throw error;
  }

  return mapSentinelHistoryRow(data);
}

export async function getLatestSentinelSnapshotHistory({ supabase = null, limit = 1 } = {}) {
  if (!isSupabaseAdminConfigured()) {
    return [];
  }

  const client = supabase ?? getSupabaseAdmin();
  const { data, error } = await client
    .from(SENTINEL_SNAPSHOT_HISTORY_TABLE)
    .select("id, captured_at, version, label, snapshot, source")
    .order("captured_at", { ascending: false })
    .limit(Math.max(1, limit));

  if (error) {
    if (/relation .* does not exist|schema cache/i.test(error.message || "")) {
      return [];
    }

    throw error;
  }

  return (data || []).map(mapSentinelHistoryRow);
}

export async function pinSentinelBaseline({
  snapshot,
  label = "baseline_v1",
  source = "ops",
  supabase = null,
} = {}) {
  const normalizedLabel = normalizeLabel(label);
  if (!normalizedLabel) {
    throw new Error("Baseline label is required.");
  }

  const existing = await getSentinelSnapshotByLabel(normalizedLabel, { supabase });
  if (existing) {
    return {
      ok: true,
      already_pinned: true,
      record: existing,
    };
  }

  const persisted = await persistSentinelSnapshot({
    snapshot,
    label: normalizedLabel,
    source,
    supabase,
  });

  if (!persisted.ok) {
    return persisted;
  }

  return {
    ok: true,
    already_pinned: false,
    record: persisted.record,
  };
}

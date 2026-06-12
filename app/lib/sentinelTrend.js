export const SENTINEL_TREND_VERSION = "s1";

const NUMERIC_METRIC_PATHS = [
  ["vault", "active_documents"],
  ["vault", "compromised_documents"],
  ["vault", "active_devices"],
  ["vault", "revoked_devices"],
  ["vault", "state_events"],
  ["trust_pass", "active_cards"],
  ["trust_pass", "revoked_cards"],
  ["trust_pass", "expired_cards"],
  ["trust_pass", "suspicious_cards"],
  ["trust_pass", "state_events"],
  ["storage", "active_document_count"],
  ["storage", "storage_object_count"],
  ["storage", "orphan_count"],
  ["storage", "missing_ciphertext_count"],
  ["replay", "expired_nonce_count"],
  ["replay", "active_nonce_count"],
];

function getPathValue(object, path) {
  let current = object;
  for (const segment of path) {
    if (current == null || typeof current !== "object") {
      return null;
    }
    current = current[segment];
  }

  return current ?? null;
}

function metricKey(path) {
  return path.join(".");
}

export function computeNumericSnapshotDelta(current, reference) {
  const delta = {};

  for (const path of NUMERIC_METRIC_PATHS) {
    const key = metricKey(path);
    const currentValue = getPathValue(current, path);
    const referenceValue = getPathValue(reference, path);

    if (typeof currentValue === "number" && typeof referenceValue === "number") {
      delta[key] = currentValue - referenceValue;
      continue;
    }

    delta[key] = null;
  }

  return delta;
}

export function computeBooleanSnapshotChanges(current, reference) {
  return {
    "health.status_changed": getPathValue(current, ["health", "status"]) !== getPathValue(reference, ["health", "status"]),
    "storage.bucket_public_changed":
      getPathValue(current, ["storage", "bucket_public"]) !==
      getPathValue(reference, ["storage", "bucket_public"]),
    "guide.openai_configured_changed":
      getPathValue(current, ["guide", "openai_configured"]) !==
      getPathValue(reference, ["guide", "openai_configured"]),
  };
}

export function diffBlockerLists(current, reference) {
  const currentBlockers = new Set(getPathValue(current, ["health", "blockers"]) || []);
  const referenceBlockers = new Set(getPathValue(reference, ["health", "blockers"]) || []);

  return {
    added: [...currentBlockers].filter((item) => !referenceBlockers.has(item)),
    removed: [...referenceBlockers].filter((item) => !currentBlockers.has(item)),
  };
}

export function buildSentinelTrendFlags({ delta, blockerDiff, booleanChanges }) {
  const flags = [];

  for (const [key, value] of Object.entries(delta || {})) {
    if (typeof value !== "number" || value === 0) {
      continue;
    }

    if (key.includes("orphan_count") || key.includes("missing_ciphertext_count") || key.includes("compromised_documents")) {
      flags.push(`${key} changed by ${value}`);
      continue;
    }

    flags.push(`${key} delta ${value > 0 ? "+" : ""}${value}`);
  }

  if (booleanChanges["health.status_changed"]) {
    flags.push("health.status changed");
  }

  if (booleanChanges["storage.bucket_public_changed"]) {
    flags.push("storage.bucket_public changed");
  }

  if ((blockerDiff?.added || []).length > 0) {
    flags.push(`health.blockers added: ${blockerDiff.added.join(", ")}`);
  }

  if ((blockerDiff?.removed || []).length > 0) {
    flags.push(`health.blockers removed: ${blockerDiff.removed.join(", ")}`);
  }

  return flags;
}

export function buildSentinelTrendComparison(current, reference) {
  if (!reference?.snapshot) {
    return null;
  }

  const delta = computeNumericSnapshotDelta(current, reference.snapshot);
  const booleanChanges = computeBooleanSnapshotChanges(current, reference.snapshot);
  const blockerDiff = diffBlockerLists(current, reference.snapshot);

  return {
    captured_at: reference.captured_at,
    label: reference.label ?? null,
    id: reference.id ?? null,
    delta,
    boolean_changes: booleanChanges,
    blockers: blockerDiff,
    flags: buildSentinelTrendFlags({ delta, blockerDiff, booleanChanges }),
  };
}

export function buildSentinelTrendReport({
  currentSnapshot,
  baselineRecord = null,
  previousRecord = null,
  baselineLabel = "baseline_v1",
  timestamp = new Date().toISOString(),
} = {}) {
  return {
    service: "prooforigin-sentinel",
    version: SENTINEL_TREND_VERSION,
    timestamp,
    baseline: baselineRecord
      ? {
          label: baselineRecord.label || baselineLabel,
          captured_at: baselineRecord.captured_at,
          id: baselineRecord.id,
        }
      : {
          label: baselineLabel,
          captured_at: null,
          id: null,
        },
    current: currentSnapshot,
    delta_vs_baseline: baselineRecord
      ? buildSentinelTrendComparison(currentSnapshot, baselineRecord)?.delta ?? null
      : null,
    delta_vs_previous: previousRecord
      ? buildSentinelTrendComparison(currentSnapshot, previousRecord)?.delta ?? null
      : null,
    comparison_vs_baseline: buildSentinelTrendComparison(currentSnapshot, baselineRecord),
    comparison_vs_previous: buildSentinelTrendComparison(currentSnapshot, previousRecord),
    flags: [
      ...new Set([
        ...(buildSentinelTrendComparison(currentSnapshot, baselineRecord)?.flags || []),
        ...(buildSentinelTrendComparison(currentSnapshot, previousRecord)?.flags || []),
      ]),
    ],
  };
}

export async function buildSentinelTrend({
  baselineLabel = "baseline_v1",
  buildSnapshot,
  getBaseline,
  getLatestHistory,
} = {}) {
  const resolveSnapshot = buildSnapshot ?? (await import("./sentinelSnapshot.js")).buildSentinelSnapshot;
  const resolveBaseline =
    getBaseline ??
    (async (label) => (await import("./sentinelSnapshotHistory.js")).getSentinelSnapshotByLabel(label));
  const resolveHistory =
    getLatestHistory ??
    (async (limit) =>
      (await import("./sentinelSnapshotHistory.js")).getLatestSentinelSnapshotHistory({ limit }));

  const [currentSnapshot, baselineRecord, history] = await Promise.all([
    resolveSnapshot(),
    resolveBaseline(baselineLabel),
    resolveHistory(1),
  ]);

  const previousRecord = history[0] ?? null;

  return buildSentinelTrendReport({
    currentSnapshot,
    baselineRecord,
    previousRecord,
    baselineLabel,
  });
}

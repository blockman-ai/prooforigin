export const SENTINEL_CUSTODY_INTELLIGENCE_VERSION = 1;

const MS_HOUR = 60 * 60 * 1000;
const MS_DAY = 24 * MS_HOUR;

const ACTIVITY_SPIKE_1H = 8;
const DEVICE_CHURN_24H = 2;
const DEVICE_REVOCATION_24H = 1;
const MIGRATION_FAILURE_7D = 2;
const MIGRATION_RETRY_LOOP_7D = 2;
const MIGRATION_STALLED_MS = MS_DAY;
const RETIREMENT_STALE_MS = 7 * MS_DAY;

const ANOMALY_DEDUCTIONS = {
  critical: 35,
  high: 25,
  medium: 15,
  low: 8,
};

function isSameVaultStrict(row, vaultId) {
  return row?.vault_id === vaultId;
}

function parseTime(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function isWithinWindow(timestamp, nowMs, windowMs) {
  const time = parseTime(timestamp);
  if (time == null) return false;
  return time >= nowMs - windowMs && time <= nowMs;
}

function countInWindow(items, getTimestamp, nowMs, windowMs) {
  return items.filter((item) => isWithinWindow(getTimestamp(item), nowMs, windowMs)).length;
}

function bandForScore(score) {
  if (score >= 90) return "clear";
  if (score >= 70) return "watch";
  if (score >= 50) return "attention";
  return "critical";
}

function severityForBand(band) {
  if (band === "clear") return "info";
  if (band === "watch") return "info";
  if (band === "attention") return "warning";
  return "critical";
}

function buildSignal(score, reasonCodes = []) {
  const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));
  const band = bandForScore(normalizedScore);
  return {
    score: normalizedScore,
    band,
    severity: severityForBand(band),
    reason_codes: reasonCodes,
  };
}

const DEFERRED_VAULT_SCOPED_SIGNAL = buildSignal(100, []);

function applyCriticalAnomalyBandCap(health, anomalies) {
  const hasCriticalAnomaly = anomalies.some((anomaly) => anomaly.severity === "critical");
  if (!hasCriticalAnomaly || health.band === "attention" || health.band === "critical") {
    return health;
  }

  return {
    ...health,
    band: "attention",
    severity: "warning",
  };
}

function isRevoked(device) {
  return Boolean(device?.revoked_at);
}

function isCleanupPending(migration) {
  const cleanupState = String(migration?.metadata?.staging_cleanup_state || "").toLowerCase();
  const terminal = new Set(["completed", "failed", "cancelled"]);
  return (
    terminal.has(migration?.state) &&
    (cleanupState === "pending" || cleanupState === "requested" || cleanupState === "failed")
  );
}

function isRetirementEligible(migration) {
  return (
    migration?.state === "completed" &&
    migration?.source_retirement_state === "active" &&
    !migration?.source_retired_at &&
    migration?.metadata?.source_retirement_eligible === true
  );
}

function isMigrationStalled(migration, nowMs) {
  const terminal = new Set(["completed", "failed", "cancelled"]);
  if (terminal.has(migration?.state)) {
    return false;
  }
  const updatedAt = parseTime(migration?.updated_at || migration?.created_at);
  return updatedAt != null && nowMs - updatedAt >= MIGRATION_STALLED_MS;
}

function migrationPairKey(migration) {
  return `${migration?.source_vault_device_id || ""}|${migration?.target_vault_device_id || ""}`;
}

function buildObservationWindows({
  documentStateEvents,
  devices,
  migrations,
  ownershipVerifications,
  nowMs,
}) {
  return {
    "1h": {
      document_events: countInWindow(documentStateEvents, (e) => e.created_at, nowMs, MS_HOUR),
      devices_registered: countInWindow(devices, (d) => d.created_at, nowMs, MS_HOUR),
      devices_revoked: countInWindow(devices, (d) => d.revoked_at, nowMs, MS_HOUR),
      migrations_started: countInWindow(migrations, (m) => m.created_at, nowMs, MS_HOUR),
      migrations_failed: countInWindow(
        migrations.filter((m) => m.state === "failed"),
        (m) => m.updated_at || m.created_at,
        nowMs,
        MS_HOUR
      ),
      ownership_verifications: countInWindow(
        ownershipVerifications,
        (v) => v.verified_at,
        nowMs,
        MS_HOUR
      ),
    },
    "24h": {
      document_events: countInWindow(documentStateEvents, (e) => e.created_at, nowMs, MS_DAY),
      devices_registered: countInWindow(devices, (d) => d.created_at, nowMs, MS_DAY),
      devices_revoked: countInWindow(devices, (d) => d.revoked_at, nowMs, MS_DAY),
      migrations_started: countInWindow(migrations, (m) => m.created_at, nowMs, MS_DAY),
      migrations_failed: countInWindow(
        migrations.filter((m) => m.state === "failed"),
        (m) => m.updated_at || m.created_at,
        nowMs,
        MS_DAY
      ),
      ownership_verifications: countInWindow(
        ownershipVerifications,
        (v) => v.verified_at,
        nowMs,
        MS_DAY
      ),
    },
    "7d": {
      document_events: countInWindow(documentStateEvents, (e) => e.created_at, nowMs, 7 * MS_DAY),
      devices_registered: countInWindow(devices, (d) => d.created_at, nowMs, 7 * MS_DAY),
      devices_revoked: countInWindow(devices, (d) => d.revoked_at, nowMs, 7 * MS_DAY),
      migrations_started: countInWindow(migrations, (m) => m.created_at, nowMs, 7 * MS_DAY),
      migrations_failed: countInWindow(
        migrations.filter((m) => m.state === "failed"),
        (m) => m.updated_at || m.created_at,
        nowMs,
        7 * MS_DAY
      ),
      ownership_verifications: countInWindow(
        ownershipVerifications,
        (v) => v.verified_at,
        nowMs,
        7 * MS_DAY
      ),
    },
  };
}

function detectAnomalies({
  documentStateEvents,
  devices,
  migrations,
  nowMs,
  windows,
}) {
  const anomalies = [];

  if (windows["1h"].document_events >= ACTIVITY_SPIKE_1H) {
    anomalies.push({
      kind: "custody.activity_spike",
      severity: "medium",
      reason_codes: ["document_event_rate_elevated_1h"],
      label: "Unusual document custody activity in the last hour",
    });
  }

  if (
    windows["24h"].devices_registered >= DEVICE_CHURN_24H ||
    windows["24h"].devices_revoked >= DEVICE_REVOCATION_24H
  ) {
    anomalies.push({
      kind: "device.churn_spike",
      severity: "medium",
      reason_codes: ["device_registration_or_revocation_elevated_24h"],
      label: "Unusual device registration or revocation activity",
    });
  }

  const unverifiedActive = devices.filter((device) => !isRevoked(device) && !device.verified).length;
  if (unverifiedActive > 0) {
    anomalies.push({
      kind: "ownership.verification_gap",
      severity: "high",
      reason_codes: ["active_device_ownership_unverified"],
      label: "One or more active devices require ownership verification",
    });
  }

  if (windows["7d"].migrations_failed >= MIGRATION_FAILURE_7D) {
    anomalies.push({
      kind: "migration.failure_spike",
      severity: "high",
      reason_codes: ["migration_failures_elevated_7d"],
      label: "Migration failures elevated in the last 7 days",
    });
  }

  const failedRecent = migrations.filter(
    (migration) =>
      migration.state === "failed" &&
      isWithinWindow(migration.updated_at || migration.created_at, nowMs, 7 * MS_DAY)
  );
  const pairCounts = new Map();
  for (const migration of failedRecent) {
    const key = migrationPairKey(migration);
    pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
  }
  if ([...pairCounts.values()].some((count) => count >= MIGRATION_RETRY_LOOP_7D)) {
    anomalies.push({
      kind: "migration.retry_loop",
      severity: "high",
      reason_codes: ["repeated_migration_failures_same_route"],
      label: "Repeated migration failures on the same device route",
    });
  }

  if (migrations.some((migration) => isMigrationStalled(migration, nowMs))) {
    anomalies.push({
      kind: "migration.stalled",
      severity: "medium",
      reason_codes: ["migration_in_progress_stalled"],
      label: "A migration appears stalled in progress",
    });
  }

  if (migrations.some(isCleanupPending)) {
    anomalies.push({
      kind: "cleanup.backlog",
      severity: "medium",
      reason_codes: ["staging_cleanup_pending"],
      label: "Migration staging cleanup is still pending",
    });
  }

  const staleRetirement = migrations.filter((migration) => {
    if (!isRetirementEligible(migration)) {
      return false;
    }
    const notBefore = parseTime(migration.metadata?.source_retirement_not_before);
    return notBefore != null && nowMs - notBefore >= RETIREMENT_STALE_MS;
  });
  if (staleRetirement.length > 0) {
    anomalies.push({
      kind: "retirement.stale_eligible_source",
      severity: "low",
      reason_codes: ["source_retirement_eligible_overdue"],
      label: "Source retirement has been eligible for an extended period",
    });
  }

  const compromisedRecent = documentStateEvents.filter(
    (event) =>
      event.event_type === "compromised" &&
      isWithinWindow(event.created_at, nowMs, 7 * MS_DAY)
  );
  if (compromisedRecent.length > 0) {
    anomalies.push({
      kind: "custody.compromised_active",
      severity: "critical",
      reason_codes: ["compromised_document_recent"],
      label: "Compromised document requires review",
    });
  }

  return anomalies;
}

function scoreFromAnomalies(anomalies, kinds, baseScore = 100) {
  let score = baseScore;
  const reasonCodes = [];
  for (const anomaly of anomalies) {
    if (!kinds.has(anomaly.kind)) {
      continue;
    }
    const deduction =
      ANOMALY_DEDUCTIONS[anomaly.severity === "critical" ? "critical" : anomaly.severity] ??
      ANOMALY_DEDUCTIONS.medium;
    score -= deduction;
    reasonCodes.push(...anomaly.reason_codes);
  }
  return buildSignal(score, [...new Set(reasonCodes)]);
}

function buildDomainSignals(anomalies) {
  const anomalyKinds = (kinds) => scoreFromAnomalies(anomalies, kinds);

  const ownership = anomalyKinds(
    new Set(["ownership.verification_gap"])
  );
  const deviceStability = anomalyKinds(
    new Set(["device.churn_spike"])
  );
  const migrationReliability = anomalyKinds(
    new Set(["migration.failure_spike", "migration.retry_loop", "migration.stalled"])
  );
  const cleanupHygiene = anomalyKinds(new Set(["cleanup.backlog"]));
  const retirementHygiene = anomalyKinds(new Set(["retirement.stale_eligible_source"]));
  const storageIntegrity = DEFERRED_VAULT_SCOPED_SIGNAL;
  const authIntegrity = DEFERRED_VAULT_SCOPED_SIGNAL;
  const identityTrust = DEFERRED_VAULT_SCOPED_SIGNAL;

  const custodyActivity = anomalyKinds(
    new Set(["custody.activity_spike", "custody.compromised_active"])
  );

  const overallScore = Math.round(
    (ownership.score +
      deviceStability.score +
      migrationReliability.score +
      cleanupHygiene.score +
      retirementHygiene.score +
      storageIntegrity.score +
      authIntegrity.score +
      identityTrust.score +
      custodyActivity.score) /
      9
  );

  const overallReasons = [
    ...new Set(
      anomalies.flatMap((anomaly) => anomaly.reason_codes).filter(Boolean)
    ),
  ];

  const overall_custody_health = applyCriticalAnomalyBandCap(
    buildSignal(overallScore, overallReasons),
    anomalies
  );

  return {
    overall_custody_health,
    ownership_confidence: ownership,
    device_stability: deviceStability,
    migration_reliability: migrationReliability,
    cleanup_hygiene: cleanupHygiene,
    retirement_hygiene: retirementHygiene,
    storage_integrity: storageIntegrity,
    auth_integrity: authIntegrity,
    identity_trust: identityTrust,
  };
}

export function buildVaultSentinelCustodyIntelligence({
  vaultId,
  devices = [],
  documents = [],
  migrations = [],
  documentStateEvents = [],
  ownershipVerifications = [],
  now = new Date(),
} = {}) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();

  const scopedDevices = devices.filter((device) => isSameVaultStrict(device, vaultId));
  const scopedMigrations = migrations.filter((migration) => isSameVaultStrict(migration, vaultId));
  const scopedVerifications = ownershipVerifications.filter((verification) =>
    isSameVaultStrict(verification, vaultId)
  );
  const scopedDocumentIds = new Set(
    documents.filter((document) => isSameVaultStrict(document, vaultId)).map((document) => document.id)
  );
  const scopedEvents = documentStateEvents.filter((event) =>
    scopedDocumentIds.has(event.document_id)
  );

  const observation_windows = buildObservationWindows({
    documentStateEvents: scopedEvents,
    devices: scopedDevices,
    migrations: scopedMigrations,
    ownershipVerifications: scopedVerifications,
    nowMs,
  });

  const anomalies = detectAnomalies({
    documentStateEvents: scopedEvents,
    devices: scopedDevices,
    migrations: scopedMigrations,
    nowMs,
    windows: observation_windows,
  }).sort((left, right) => {
    const severityRank = { critical: 0, high: 1, medium: 2, low: 3 };
    return (severityRank[left.severity] ?? 9) - (severityRank[right.severity] ?? 9);
  });

  const signals = buildDomainSignals(anomalies);

  return {
    sentinel_version: SENTINEL_CUSTODY_INTELLIGENCE_VERSION,
    health: signals.overall_custody_health,
    signals: {
      ownership_confidence: signals.ownership_confidence,
      device_stability: signals.device_stability,
      migration_reliability: signals.migration_reliability,
      cleanup_hygiene: signals.cleanup_hygiene,
      retirement_hygiene: signals.retirement_hygiene,
      storage_integrity: signals.storage_integrity,
      auth_integrity: signals.auth_integrity,
      identity_trust: signals.identity_trust,
    },
    anomalies: anomalies.slice(0, 10).map((anomaly) => ({
      kind: anomaly.kind,
      severity: anomaly.severity,
      reason_codes: anomaly.reason_codes,
      label: anomaly.label,
    })),
    observation_windows,
  };
}

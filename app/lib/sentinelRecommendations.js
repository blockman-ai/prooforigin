export const SENTINEL_RECOMMENDATIONS_VERSION = "s2";

const SEVERITY_RANK = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const CRITICAL_HEALTH_BLOCKERS = new Set([
  "missing_required_env",
  "dts_master_key_missing",
  "supabase_not_configured",
  "vault_tables_unreachable",
  "trust_pass_tables_unreachable",
  "voice_anchor_table_unreachable",
]);

function counterMap(counters = []) {
  const map = new Map();

  for (const row of counters || []) {
    if (!row?.counter_key) {
      continue;
    }

    map.set(String(row.counter_key), Number(row.count ?? 0));
  }

  return map;
}

function getCounter(map, key) {
  return map.get(key) ?? 0;
}

function sortRecommendations(recommendations) {
  return [...recommendations].sort((left, right) => {
    const rankDiff = SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity];
    if (rankDiff !== 0) {
      return rankDiff;
    }

    return String(left.id).localeCompare(String(right.id));
  });
}

function pushRecommendation(recommendations, seenIds, recommendation) {
  if (!recommendation?.id || seenIds.has(recommendation.id)) {
    return;
  }

  seenIds.add(recommendation.id);
  recommendations.push(recommendation);
}

function buildStorageRecommendations(snapshot, recommendations, seenIds) {
  const storage = snapshot?.storage || {};

  if (storage.bucket_public === true) {
    pushRecommendation(recommendations, seenIds, {
      id: "storage.bucket_public",
      severity: "critical",
      category: "storage",
      title: "Vault storage bucket is public",
      message:
        "The vault ciphertext bucket is configured as public. Encrypted objects must not be world-readable.",
      recommended_action:
        "Set the Supabase storage bucket to private and verify with audit_storage or sentinel_snapshot.",
      source: "snapshot.storage",
      evidence: {
        bucket_public: true,
      },
    });
  }

  const orphanCount = storage.orphan_count;
  if (typeof orphanCount === "number" && orphanCount > 0) {
    pushRecommendation(recommendations, seenIds, {
      id: "storage.orphan_objects",
      severity: "medium",
      category: "storage",
      title: "Orphan ciphertext objects detected",
      message: `${orphanCount} storage object(s) exist without a matching active vault document row.`,
      recommended_action:
        "Run audit_storage, identify orphan paths, and reconcile or remove unreferenced ciphertext.",
      source: "snapshot.storage",
      evidence: {
        orphan_count: orphanCount,
      },
    });
  }

  const missingCount = storage.missing_ciphertext_count;
  if (typeof missingCount === "number" && missingCount > 0) {
    pushRecommendation(recommendations, seenIds, {
      id: "storage.missing_ciphertext",
      severity: "high",
      category: "storage",
      title: "Documents missing ciphertext in storage",
      message: `${missingCount} active document row(s) reference ciphertext that is missing from storage.`,
      recommended_action:
        "Investigate upload/complete failures and restore missing objects before users lose access.",
      source: "snapshot.storage",
      evidence: {
        missing_ciphertext_count: missingCount,
      },
    });
  }
}

function buildReplayRecommendations(snapshot, recommendations, seenIds) {
  const expiredCount = snapshot?.replay?.expired_nonce_count;

  if (typeof expiredCount === "number" && expiredCount > 1000) {
    pushRecommendation(recommendations, seenIds, {
      id: "replay.expired_nonce_housekeeping",
      severity: expiredCount >= 10_000 ? "medium" : "low",
      category: "auth",
      title: "Expired vault request nonces need cleanup",
      message: `${expiredCount} expired replay-guard nonce row(s) are retained in storage.`,
      recommended_action:
        "Run cleanup_nonces on a schedule or verify automated nonce pruning is healthy.",
      source: "snapshot.replay",
      evidence: {
        expired_nonce_count: expiredCount,
      },
    });
  }
}

function buildGuideRecommendations(counterLookup, recommendations, seenIds) {
  const promptInjection = getCounter(counterLookup, "guide.refusal.prompt_injection");
  if (promptInjection > 0) {
    pushRecommendation(recommendations, seenIds, {
      id: "guide.prompt_injection",
      severity: "low",
      category: "guide",
      title: "Guide blocked prompt-injection attempts",
      message: `${promptInjection} guide request(s) matched prompt-injection abuse patterns.`,
      recommended_action:
        "Review guide refusal trends. No immediate action required unless volume spikes sharply.",
      source: "counters.guide",
      evidence: {
        prompt_injection_count: promptInjection,
      },
    });
  }

  const secretRequest = getCounter(counterLookup, "guide.refusal.secret_request");
  if (secretRequest > 0) {
    pushRecommendation(recommendations, seenIds, {
      id: "guide.secret_request",
      severity: "medium",
      category: "guide",
      title: "Users asked Guide for secrets or sensitive files",
      message: `${secretRequest} guide request(s) were refused for secret or file-exfiltration patterns.`,
      recommended_action:
        "Confirm Guide copy explains that secrets stay client-side. Consider help content on Recovery Kit and vault unlock.",
      source: "counters.guide",
      guide_topic: "vault-overview",
      evidence: {
        secret_request_count: secretRequest,
      },
    });
  }

  const outputFilterRejected = getCounter(counterLookup, "guide.output_filter.rejected");
  if (outputFilterRejected > 0) {
    pushRecommendation(recommendations, seenIds, {
      id: "guide.output_filter_rejected",
      severity: "medium",
      category: "guide",
      title: "Guide OpenAI output failed safety filter",
      message: `${outputFilterRejected} OpenAI guide answer(s) were rejected by the output safety filter.`,
      recommended_action:
        "Review guide help snippets and OpenAI prompt guardrails. Fallback answers should remain deterministic.",
      source: "counters.guide",
      evidence: {
        output_filter_rejected_count: outputFilterRejected,
      },
    });
  }
}

function buildTrustRecommendations(counterLookup, recommendations, seenIds) {
  const invalidCode = getCounter(counterLookup, "trust.verify.invalid_code");
  const success = getCounter(counterLookup, "trust.verify.success");

  if (invalidCode >= 5 && invalidCode > success * 3) {
    pushRecommendation(recommendations, seenIds, {
      id: "trust.invalid_code_ratio",
      severity: "medium",
      category: "trust",
      title: "Trust Pass invalid-code attempts are elevated",
      message:
        "Invalid verification codes exceed successful verifications by more than 3x with at least five failures.",
      recommended_action:
        "Check for brute-force probing, clock skew on rotating codes, or user confusion on the verify flow.",
      source: "counters.trust",
      evidence: {
        invalid_code_count: invalidCode,
        success_count: success,
        ratio_threshold_exceeded: true,
      },
    });
  }
}

function buildVaultAuthRecommendations(counterLookup, recommendations, seenIds) {
  const replayRejected = getCounter(counterLookup, "vault.auth.replay_rejected");
  if (replayRejected > 0) {
    pushRecommendation(recommendations, seenIds, {
      id: "vault.auth.replay_rejected",
      severity: "medium",
      category: "auth",
      title: "Vault auth replay rejections detected",
      message: `${replayRejected} vault request(s) reused a nonce and were rejected as replays.`,
      recommended_action:
        "Review client retry logic, proxy caching, and recent vault auth changes. Investigate if volume spikes.",
      source: "counters.vault.auth",
      evidence: {
        replay_rejected_count: replayRejected,
      },
    });
  }

  const signatureFailed = getCounter(counterLookup, "vault.auth.signature_failed");
  if (signatureFailed > 0) {
    pushRecommendation(recommendations, seenIds, {
      id: "vault.auth.signature_failed",
      severity: "medium",
      category: "auth",
      title: "Vault auth signature failures detected",
      message: `${signatureFailed} vault request(s) failed HMAC signature verification.`,
      recommended_action:
        "Check device registration secrets, clock skew, body-hash alignment, and whether a client build regressed.",
      source: "counters.vault.auth",
      evidence: {
        signature_failed_count: signatureFailed,
      },
    });
  }

  const deviceNotRegistered = getCounter(counterLookup, "vault.auth.device_not_registered");
  if (deviceNotRegistered > 0) {
    pushRecommendation(recommendations, seenIds, {
      id: "vault.auth.device_not_registered",
      severity: deviceNotRegistered >= 10 ? "medium" : "low",
      category: "auth",
      title: "Unregistered vault devices attempted auth",
      message: `${deviceNotRegistered} vault request(s) used a device id that is not registered.`,
      recommended_action:
        "Confirm register-device flow, revoked devices, and whether stale clients need re-registration.",
      source: "counters.vault.auth",
      evidence: {
        device_not_registered_count: deviceNotRegistered,
      },
    });
  }
}

function buildHealthRecommendation(snapshot, recommendations, seenIds) {
  const status = snapshot?.health?.status;
  if (!status || status === "ok") {
    return;
  }

  const blockers = snapshot?.health?.blockers || [];
  const hasCriticalBlocker = blockers.some((blocker) => CRITICAL_HEALTH_BLOCKERS.has(blocker));
  const severity =
    status === "error" || hasCriticalBlocker ? "critical" : "high";

  pushRecommendation(recommendations, seenIds, {
    id: "health.not_ok",
    severity,
    category: "ops",
    title: "ProofOrigin health is not OK",
    message: `Health status is "${status}" with ${blockers.length} active blocker(s).`,
    recommended_action:
      "Review /api/health/prooforigin and resolve environment, storage, and table blockers before production traffic.",
    source: "snapshot.health",
    evidence: {
      status,
      blocker_count: blockers.length,
      has_critical_blocker: hasCriticalBlocker,
      has_missing_required_env: blockers.includes("missing_required_env"),
      has_unreachable_tables: blockers.some((blocker) => blocker.endsWith("_unreachable")),
      has_storage_integrity_blocker:
        blockers.includes("vault_orphan_ciphertext") ||
        blockers.includes("vault_missing_ciphertext"),
      has_public_bucket_blocker: blockers.includes("vault_bucket_public"),
    },
  });
}

function attachTrendEvidence(recommendations, trend) {
  if (!trend || typeof trend !== "object") {
    return recommendations;
  }

  const trendEvidence = {
    baseline_label: trend.baseline?.label ?? null,
    has_baseline: Boolean(trend.baseline?.captured_at),
    flag_count: Array.isArray(trend.flags) ? trend.flags.length : 0,
  };

  if (trendEvidence.flag_count === 0) {
    return recommendations;
  }

  return recommendations.map((recommendation) => ({
    ...recommendation,
    evidence: {
      ...recommendation.evidence,
      trend: trendEvidence,
    },
  }));
}

export function buildSentinelRecommendations({
  snapshot = null,
  trend = null,
  counters = [],
  timestamp = new Date().toISOString(),
} = {}) {
  const recommendations = [];
  const seenIds = new Set();
  const counterLookup = counterMap(counters);

  if (snapshot) {
    buildStorageRecommendations(snapshot, recommendations, seenIds);
    buildReplayRecommendations(snapshot, recommendations, seenIds);
    buildHealthRecommendation(snapshot, recommendations, seenIds);
  }

  buildGuideRecommendations(counterLookup, recommendations, seenIds);
  buildTrustRecommendations(counterLookup, recommendations, seenIds);
  buildVaultAuthRecommendations(counterLookup, recommendations, seenIds);

  const sorted = sortRecommendations(recommendations);
  const withTrend = attachTrendEvidence(sorted, trend);

  return {
    service: "prooforigin-sentinel",
    version: SENTINEL_RECOMMENDATIONS_VERSION,
    timestamp,
    recommendation_count: withTrend.length,
    recommendations: withTrend,
  };
}

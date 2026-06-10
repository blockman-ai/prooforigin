function pick(obj, snakeKey, camelKey) {
  if (!obj || typeof obj !== "object") return undefined;
  return obj[camelKey] ?? obj[snakeKey];
}

function resolveSource(raw) {
  if (!raw || typeof raw !== "object") return {};

  if (raw.report && typeof raw.report === "object") {
    return raw.report;
  }

  if (raw.evidence && typeof raw.evidence === "object") {
    return raw.evidence;
  }

  return raw;
}

export function parsePublicReportResponse(data) {
  if (!data || typeof data !== "object") {
    return { ok: false, error: "Invalid report response." };
  }

  if (data.success === false) {
    return { ok: false, error: data.error || "Report not found." };
  }

  const record = data.report ?? data.evidence ?? data;
  const protocol = mapProofOriginProtocol(record);

  return {
    ok: true,
    protocol,
    record,
  };
}

function legacyPublicLabel(source) {
  return (
    pick(source, "public_label", "publicLabel") ??
    source.weightedConsensus?.label ??
    source.weighted_consensus?.label ??
    source.verdict ??
    source.prooforigin?.classification ??
    source.summary?.label ??
    "Protocol evaluation recorded"
  );
}

function legacyAiProbability(source) {
  const score =
    pick(source, "ai_probability", "aiProbability") ??
    source.weightedConsensus?.score ??
    source.weighted_consensus?.score ??
    source.percent ??
    source.prooforigin?.score ??
    source.summary?.ai_score ??
    source.engine_outputs?.openai_vision?.score;

  const numeric = Number(score);
  return Number.isFinite(numeric) ? Math.round(numeric) : null;
}

function legacyFileId(source) {
  return (
    pick(source, "file_id", "fileId") ??
    source.report_id ??
    source.reportId ??
    null
  );
}

const DEFAULT_VERIFICATION_NOTICE =
  "This evaluation does not verify absolute truth. It records protocol-scoped analysis only.";

const DEFAULT_CLAIM_BOUNDARY =
  "Claims are limited to the evaluated media file and the recorded analysis scope.";

export function buildProofMetadataFromAnalyze(raw) {
  const protocol = mapProofOriginProtocol(raw);
  const source = resolveSource(raw);

  return {
    file_id: protocol.fileId ?? null,
    public_label: protocol.publicLabel,
    decision_tier: protocol.decisionTier,
    verification_notice: protocol.verificationNotice,
    claim_boundary: protocol.claimBoundary,
    protocol_name: protocol.protocolName,
    protocol_version: protocol.protocolVersion,
    evidence_bundle_hash: protocol.evidenceBundleHash,
    verified_scope: protocol.verifiedScope,
    truth_verified: protocol.truthVerified === true,
    response_meta: pick(source, "response_meta", "responseMeta") ?? null,
    contract: pick(source, "contract", "contract") ?? null,
  };
}

export function mapProofOriginProtocol(raw) {
  const source = resolveSource(raw);
  const responseMeta = pick(source, "response_meta", "responseMeta") ?? {};
  const truthVerifiedRaw = pick(source, "truth_verified", "truthVerified");

  return {
    publicLabel: legacyPublicLabel(source),
    decisionTier:
      pick(source, "decision_tier", "decisionTier") ?? "unspecified",
    verificationNotice:
      pick(source, "verification_notice", "verificationNotice") ??
      DEFAULT_VERIFICATION_NOTICE,
    claimBoundary:
      pick(source, "claim_boundary", "claimBoundary") ?? DEFAULT_CLAIM_BOUNDARY,
    protocolName: pick(source, "protocol_name", "protocolName") ?? "Proof-of-Origin",
    protocolVersion:
      pick(source, "protocol_version", "protocolVersion") ??
      responseMeta.schema_version ??
      responseMeta.schemaVersion ??
      "unknown",
    evidenceBundleHash:
      pick(source, "evidence_bundle_hash", "evidenceBundleHash") ??
      source.integrity?.sha256 ??
      null,
    verifiedScope:
      pick(source, "verified_scope", "verifiedScope") ??
      "Single media file analysis",
    truthVerified: truthVerifiedRaw === true,
    aiProbability: legacyAiProbability(source),
    fileId: legacyFileId(source),
  };
}

export function buildProtocolShareText(protocol, reportUrl) {
  const parts = [
    `ProofOrigin Protocol Evaluation: ${protocol.publicLabel}`,
    protocol.decisionTier && protocol.decisionTier !== "unspecified"
      ? `Decision tier: ${protocol.decisionTier}`
      : null,
    protocol.aiProbability != null
      ? `Engine estimate: ${protocol.aiProbability}% (not verified truth)`
      : null,
    reportUrl ? `View record: ${reportUrl}` : null,
  ].filter(Boolean);

  return parts.join(". ");
}

export function getDecisionTierStatusClass(decisionTier, aiProbability) {
  const tier = String(decisionTier || "").toLowerCase();

  if (
    tier.includes("high") ||
    tier.includes("strong") ||
    tier.includes("synthetic")
  ) {
    return "status-ai";
  }

  if (
    tier.includes("mixed") ||
    tier.includes("assisted") ||
    tier.includes("edited") ||
    tier.includes("moderate")
  ) {
    return "status-edited";
  }

  if (tier.includes("human") || tier.includes("low")) {
    return "status-human";
  }

  const percent = Number(aiProbability) || 0;

  if (percent >= 65) return "status-ai";
  if (percent >= 40) return "status-edited";
  return "status-human";
}

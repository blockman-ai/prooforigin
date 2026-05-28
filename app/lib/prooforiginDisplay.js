export function getTrustScore(report = {}) {
  const ai = Number(report.percent ?? report.weightedConsensus?.score ?? report.weighted_consensus?.score ?? 0);
  const humanSignal = Number(report.visual_trust?.human_signal ?? 100 - ai);
  const antiTamper = Number(report.visual_trust?.anti_tamper ?? 85);
  const provenance = Number(report.visual_trust?.provenance ?? 20);

  const trust = Math.round(
    humanSignal * 0.45 +
    antiTamper * 0.25 +
    provenance * 0.15 +
    (100 - ai) * 0.15
  );

  return Math.max(0, Math.min(100, trust));
}

export function getPremiumVerdict(report = {}) {
  const ai = Number(report.percent ?? report.weightedConsensus?.score ?? report.weighted_consensus?.score ?? 0);
  const trust = getTrustScore(report);
  const label = String(report.verdict ?? report.weightedConsensus?.label ?? "").toLowerCase();

  if (label.includes("ai") && ai >= 75) {
    return {
      status: "STRONG AI CONSENSUS",
      tone: "danger",
      icon: "🔴",
      subtitle: "Synthetic content likely detected",
    };
  }

  if (ai >= 55) {
    return {
      status: "AI-ASSISTED / REVIEW RECOMMENDED",
      tone: "warning",
      icon: "🟠",
      subtitle: "Mixed or synthetic-like forensic signals detected",
    };
  }

  if (trust >= 75 && ai <= 35) {
    return {
      status: "LIKELY HUMAN-MADE",
      tone: "success",
      icon: "🟢",
      subtitle: "Evidence favors natural or human-created media",
    };
  }

  return {
    status: "MIXED FORENSIC SIGNALS",
    tone: "warning",
    icon: "🟡",
    subtitle: "Review recommended before relying on this record",
  };
}

export function getCertificateId(fileId = "") {
  const short = String(fileId).replace(/-/g, "").slice(0, 10).toUpperCase();
  const year = new Date().getFullYear();
  return `PO-${year}-${short}`;
}

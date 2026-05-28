"use client";

import {
  getTrustScore,
  getPremiumVerdict,
  getCertificateId,
} from "../lib/prooforiginDisplay";

export default function PremiumVerificationCard({ report }) {
  const trustScore = getTrustScore(report);
  const verdict = getPremiumVerdict(report);
  const fileId = report?.file_id || report?.id || report?.report_id || "";
  const certId = getCertificateId(fileId);

  return (
    <section className={`premium-verification-card ${verdict.tone}`}>
      <div className="premium-ribbon">
        <span>{verdict.icon}</span>
        <strong>{verdict.status}</strong>
      </div>

      <div className="premium-card-grid">
        <div>
          <p className="premium-kicker">ProofOrigin Verified Record</p>
          <h1>Digital Evidence Certificate</h1>
          <p className="premium-subtitle">{verdict.subtitle}</p>

          <div className="certificate-meta">
            <div>
              <span>Certificate ID</span>
              <strong>{certId}</strong>
            </div>
            <div>
              <span>Evidence ID</span>
              <strong>{fileId || "Pending"}</strong>
            </div>
          </div>
        </div>

        <div className="trust-score-orb">
          <span>{trustScore}%</span>
          <small>Trust Score</small>
        </div>
      </div>

      <div className="premium-pill-row">
        <div>
          <span>AI Probability</span>
          <strong>
            {Math.round(
              Number(
                report?.percent ??
                  report?.weightedConsensus?.score ??
                  report?.weighted_consensus?.score ??
                  0
              )
            )}
            %
          </strong>
        </div>

        <div>
          <span>Confidence</span>
          <strong>
            {report?.confidence ||
              report?.weightedConsensus?.confidence ||
              report?.weighted_consensus?.confidence ||
              "Moderate"}
          </strong>
        </div>

        <div>
          <span>Evidence Status</span>
          <strong>
            {report?.integrity?.verification_status || "hash_recorded"}
          </strong>
        </div>

        <div>
          <span>Bitcoin Status</span>
          <strong>
            {report?.bitcoin_lite_anchor?.status || "queued"}
          </strong>
        </div>
      </div>
    </section>
  );
}

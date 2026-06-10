"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import PremiumVerificationCard from "../../../components/PremiumVerificationCard";
import {
  getProofOriginAiBaseUrl,
  getProofOriginReportUrl,
} from "../../lib/prooforiginAiConfig";
import {
  getDecisionTierStatusClass,
  parsePublicReportResponse,
} from "../../lib/prooforiginProtocolMapper";

function ProtocolSection({ protocol }) {
  if (!protocol) return null;

  return (
    <div className="explanation-box">
      <p className="report-label">Proof-of-Origin Protocol</p>

      <p>
        <strong>Protocol:</strong> {protocol.protocolName}
      </p>
      <p>
        <strong>Protocol Version:</strong> {protocol.protocolVersion}
      </p>
      <p>
        <strong>Verified Scope:</strong> {protocol.verifiedScope}
      </p>
      <p style={{ wordBreak: "break-all" }}>
        <strong>Evidence Bundle Hash:</strong>{" "}
        {protocol.evidenceBundleHash || "Not recorded"}
      </p>
      <p>
        <strong>Truth Verified:</strong>{" "}
        {protocol.truthVerified ? "Yes" : "No — does not verify absolute truth"}
      </p>

      <p className="report-label" style={{ marginTop: 16 }}>
        Verification Notice
      </p>
      <p>{protocol.verificationNotice}</p>

      <p className="report-label" style={{ marginTop: 16 }}>
        Claim Boundary
      </p>
      <p>{protocol.claimBoundary}</p>
    </div>
  );
}

export default function EvidenceReportPage() {
  const params = useParams();
  const id = params?.id;

  const [record, setRecord] = useState(null);
  const [protocol, setProtocol] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadEvidence() {
      try {
        const res = await fetch(getProofOriginReportUrl(id));
        const data = await res.json();
        const parsed = parsePublicReportResponse(data);

        if (!res.ok || !parsed.ok) {
          setError(parsed.error || "Report not found.");
          return;
        }

        setRecord(parsed.record);
        setProtocol(parsed.protocol);
      } catch (err) {
        setError("Unable to load forensic evidence report.");
      } finally {
        setLoading(false);
      }
    }

    if (id) loadEvidence();
  }, [id]);

  async function submitFeedback(label) {
    try {
      const apiBase = getProofOriginAiBaseUrl();
      const res = await fetch(`${apiBase}/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          file_id: protocol?.fileId || record?.file_id || record?.report_id || id,
          user_label: label,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        alert("Feedback failed.");
        return;
      }

      const refreshed = await fetch(getProofOriginReportUrl(id));
      const refreshedData = await refreshed.json();
      const parsed = parsePublicReportResponse(refreshedData);

      if (parsed.ok) {
        setRecord(parsed.record);
        setProtocol(parsed.protocol);
      }

      alert(`Feedback recorded: ${label}`);
    } catch {
      alert("Unable to submit feedback.");
    }
  }

  if (loading) {
    return (
      <main className="page">
        <section className="hero">
          <h1>Loading Evidence Report...</h1>
        </section>
      </main>
    );
  }

  if (error || !record || !protocol) {
    return (
      <main className="page">
        <section className="hero">
          <div className="report-card">
            <h1>Evidence Report Not Found</h1>
            <p>{error}</p>
          </div>
        </section>
      </main>
    );
  }

  const percent = protocol.aiProbability ?? 0;
  const statusClass = getDecisionTierStatusClass(
    protocol.decisionTier,
    protocol.aiProbability
  );

  return (
    <main className="page">
      <section className="hero">
        <div className="badge">ProofOrigin Protocol Evaluation</div>

        <h1>Proof-of-Origin Evaluation Record</h1>

        <p>
          This is a public protocol evaluation record. It does not verify
          absolute truth.
        </p>

        <PremiumVerificationCard />

        <div className="report-card">
          <div className="report-header">
            <div>
              <p className="report-label">Public Evaluation Label</p>
              <h2 className={statusClass}>{protocol.publicLabel}</h2>
              {protocol.decisionTier &&
                protocol.decisionTier !== "unspecified" && (
                  <span className="badge" style={{ marginTop: 12 }}>
                    Decision tier: {protocol.decisionTier}
                  </span>
                )}
            </div>

            <div className="score-circle">
              <span>{Math.round(percent)}%</span>
              <small>Engine Estimate</small>
            </div>
          </div>

          <div className="score-bar">
            <div style={{ width: `${percent}%` }} />
          </div>

          <div className="explanation-box">
            <p className="report-label">Verification Notice</p>
            <p>{protocol.verificationNotice}</p>
          </div>

          <div className="explanation-box">
            <p className="report-label">Claim Boundary</p>
            <p>{protocol.claimBoundary}</p>
          </div>

          {!protocol.truthVerified && (
            <div className="explanation-box">
              <p className="report-label">Truth Verification Status</p>
              <p>
                This record does not verify absolute truth. It reflects
                protocol-scoped evaluation only.
              </p>
            </div>
          )}

          <ProtocolSection protocol={protocol} />

          <div className="report-grid">
            <div>
              <p className="report-label">Record ID</p>
              <h3 style={{ wordBreak: "break-all" }}>
                {protocol.fileId || record.file_id || record.report_id || id}
              </h3>
            </div>

            <div>
              <p className="report-label">Created At</p>
              <h3>{record.created_at || record.createdAt || "Unknown"}</h3>
            </div>

            <div>
              <p className="report-label">Record Type</p>
              <h3>Protocol Evaluation</h3>
            </div>

            <div>
              <p className="report-label">Evaluation Status</p>
              <h3>Complete</h3>
            </div>
          </div>

          {record?.signals?.length > 0 && (
            <div className="signals-box">
              <p className="report-label">Recorded Signals</p>
              <ul>
                {record.signals.map((signal, index) => (
                  <li key={index}>{String(signal)}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="explanation-box">
            <p className="report-label">Feedback</p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: "12px",
                marginTop: "16px",
              }}
            >
              <button onClick={() => submitFeedback("correct")}>
                Result Correct
              </button>
              <button onClick={() => submitFeedback("wrong")}>
                Result Wrong
              </button>
              <button onClick={() => submitFeedback("ai")}>This Is AI</button>
              <button onClick={() => submitFeedback("human")}>
                This Is Human
              </button>
              <button onClick={() => submitFeedback("edited")}>
                Edited / Screenshot
              </button>
              <button onClick={() => submitFeedback("disputed")}>
                Disputed
              </button>
            </div>
          </div>

          <div className="explanation-box">
            <p className="report-label">Disclaimer</p>
            <p>
              This record is a protocol-scoped evaluation. It is not absolute
              legal proof and does not verify absolute truth. Stronger
              provenance requires original files, verified capture records, and
              chain-of-custody validation.
            </p>
          </div>

          <div className="share-buttons">
            <button
              onClick={() => navigator.clipboard.writeText(window.location.href)}
            >
              Copy Report Link
            </button>

            <button onClick={() => window.print()}>Download PDF</button>
          </div>
        </div>
      </section>
    </main>
  );
}

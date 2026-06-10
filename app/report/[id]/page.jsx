"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import PremiumVerificationCard from "../../../components/PremiumVerificationCard";
import LoadingState from "../../../components/protocol/LoadingState";
import PageShell from "../../../components/protocol/PageShell";
import ProtocolBadge from "../../../components/protocol/ProtocolBadge";
import StatusCard from "../../../components/protocol/StatusCard";
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
  const [feedbackNotice, setFeedbackNotice] = useState("");
  const [feedbackError, setFeedbackError] = useState("");

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
    setFeedbackNotice("");
    setFeedbackError("");

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
        setFeedbackError("Feedback could not be recorded. Please try again.");
        return;
      }

      const refreshed = await fetch(getProofOriginReportUrl(id));
      const refreshedData = await refreshed.json();
      const parsed = parsePublicReportResponse(refreshedData);

      if (parsed.ok) {
        setRecord(parsed.record);
        setProtocol(parsed.protocol);
      }

      setFeedbackNotice(`Feedback recorded: ${label}`);
    } catch {
      setFeedbackError("Unable to submit feedback.");
    }
  }

  if (loading) {
    return (
      <PageShell badge="Protocol Report" title="Loading Report">
        <LoadingState
          title="Loading evaluation record"
          message="Fetching protocol-scoped report data from ProofOrigin AI."
        />
      </PageShell>
    );
  }

  if (error || !record || !protocol) {
    return (
      <PageShell
        badge="Protocol Report"
        title="Report Not Found"
        subtitle={error || "This evaluation record could not be loaded."}
      >
        <StatusCard variant="error" body={error} />
      </PageShell>
    );
  }

  const percent = protocol.aiProbability ?? 0;
  const statusClass = getDecisionTierStatusClass(
    protocol.decisionTier,
    protocol.aiProbability
  );

  return (
    <PageShell
      badge="ProofOrigin Protocol Evaluation"
      title="Proof-of-Origin Evaluation Record"
      subtitle="This is a public protocol evaluation record. It does not verify absolute truth."
    >
      <div className="record-header">
        <div className="record-header__badges">
          <ProtocolBadge variant="success">Evaluated</ProtocolBadge>
          {protocol.decisionTier && protocol.decisionTier !== "unspecified" && (
            <ProtocolBadge>{protocol.decisionTier}</ProtocolBadge>
          )}
        </div>
      </div>

      <PremiumVerificationCard />

      <div className="glass-panel">
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

            {feedbackNotice && (
              <div
                className="alert-banner alert-banner--success"
                role="status"
                style={{ marginTop: 16 }}
              >
                <strong>Feedback saved</strong>
                {feedbackNotice}
              </div>
            )}

            {feedbackError && (
              <div
                className="alert-banner alert-banner--error"
                role="alert"
                style={{ marginTop: 16 }}
              >
                <strong>Feedback failed</strong>
                {feedbackError}
              </div>
            )}
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
    </PageShell>
  );
}

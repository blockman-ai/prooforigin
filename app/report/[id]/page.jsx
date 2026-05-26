"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

const API_BASE = "https://prooforigin-ai-production-2983.up.railway.app";

function clamp(value) {
  return Math.min(100, Math.max(0, Number(value) || 0));
}

function EvidenceConfidenceTimeline({ evidence }) {
  const aiScore = clamp(evidence?.prooforigin?.score);
  const consensusScore = clamp(evidence?.consensus?.score);
  const provenanceConfidence =
    evidence?.provenance?.provenance_confidence || "Low";
  const trace = evidence?.trace || {};
  const adversarialRisk = clamp(evidence?.adversarial?.risk_score);

  const captureConfidence =
    provenanceConfidence === "High"
      ? 85
      : provenanceConfidence === "Moderate"
      ? 55
      : 25;

  const editRisk =
    trace.recompression_detected ||
    trace.screenshot_generation === "Likely Screenshot"
      ? 70
      : 30;

  const provenanceStrength =
    provenanceConfidence === "High"
      ? 90
      : provenanceConfidence === "Moderate"
      ? 55
      : 20;

  const items = [
    {
      label: "Original Capture Confidence",
      value: captureConfidence,
      note: "How strongly the record suggests original capture evidence.",
    },
    {
      label: "Editing / Screenshot Risk",
      value: editRisk,
      note: "Likelihood of screenshotting, recompression, or edit lineage.",
    },
    {
      label: "AI Synthesis Likelihood",
      value: aiScore,
      note: "Estimated synthetic or AI-generation probability.",
    },
    {
      label: "Provenance Strength",
      value: provenanceStrength,
      note: "Strength of reconstructed media origin evidence.",
    },
    {
      label: "Consensus Strength",
      value: consensusScore,
      note: "Strength of ProofOrigin consensus intelligence.",
    },
    {
      label: "Adversarial Risk",
      value: adversarialRisk,
      note: "Risk of manipulation designed to evade detection.",
    },
  ];

  return (
    <div className="explanation-box">
      <p className="report-label">Evidence Confidence Timeline</p>

      <div style={{ display: "grid", gap: "18px", marginTop: "18px" }}>
        {items.map((item) => (
          <div key={item.label}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                marginBottom: "8px",
              }}
            >
              <strong>{item.label}</strong>
              <strong>{Math.round(item.value)}%</strong>
            </div>

            <div
              style={{
                height: "12px",
                width: "100%",
                borderRadius: "999px",
                background: "rgba(255,255,255,0.12)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${clamp(item.value)}%`,
                  height: "100%",
                  borderRadius: "999px",
                  background: "linear-gradient(90deg, #00f5ff, #00ff88)",
                }}
              />
            </div>

            <p style={{ marginTop: "6px", opacity: 0.75, fontSize: "14px" }}>
              {item.note}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function VisualTrustGraph({ evidence }) {
  const aiScore = clamp(evidence?.prooforigin?.score);
  const consensusScore = clamp(evidence?.consensus?.score);
  const adversarialRisk = clamp(evidence?.adversarial?.risk_score);
  const provenanceConfidence =
    evidence?.provenance?.provenance_confidence || "Low";

  const provenanceScore =
    provenanceConfidence === "High"
      ? 90
      : provenanceConfidence === "Moderate"
      ? 55
      : 20;

  const humanScore = clamp(100 - aiScore);

  const trustScore = clamp(
    humanScore * 0.35 +
      provenanceScore * 0.25 +
      consensusScore * 0.25 +
      (100 - adversarialRisk) * 0.15
  );

  const items = [
    { label: "Human Signal", value: humanScore },
    { label: "Provenance", value: provenanceScore },
    { label: "Consensus", value: consensusScore },
    { label: "Anti-Tamper", value: 100 - adversarialRisk },
  ];

  return (
    <div className="explanation-box">
      <p className="report-label">Visual Trust Graph</p>

      <div
        style={{
          margin: "24px auto",
          width: "220px",
          height: "220px",
          borderRadius: "50%",
          background: `conic-gradient(#00ff88 ${trustScore}%, rgba(255,255,255,0.12) 0)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 0 40px rgba(0,255,200,0.25)",
        }}
      >
        <div
          style={{
            width: "150px",
            height: "150px",
            borderRadius: "50%",
            background: "#07111f",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          <strong style={{ fontSize: "42px" }}>{Math.round(trustScore)}%</strong>
          <span style={{ fontSize: "13px", opacity: 0.75 }}>Trust Score</span>
        </div>
      </div>

      <div style={{ display: "grid", gap: "14px" }}>
        {items.map((item) => (
          <div key={item.label}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>{item.label}</strong>
              <strong>{Math.round(item.value)}%</strong>
            </div>

            <div
              style={{
                marginTop: "8px",
                height: "10px",
                borderRadius: "999px",
                background: "rgba(255,255,255,0.12)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${clamp(item.value)}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, #00f5ff, #00ff88)",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConsensusEngineNetwork({ engines }) {
  return (
    <div className="explanation-box">
      <p className="report-label">Consensus Engine Network</p>

      <div
        style={{
          display: "grid",
          gap: "14px",
          marginTop: "18px",
        }}
      >
        {Object.entries(engines).map(([engineName, engineData]) => {
          const status = engineData?.status || "unknown";

          return (
            <div
              key={engineName}
              style={{
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "18px",
                padding: "18px",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "12px",
                  gap: "12px",
                }}
              >
                <strong
                  style={{
                    textTransform: "capitalize",
                    fontSize: "16px",
                  }}
                >
                  {engineName.replaceAll("_", " ")}
                </strong>

                <span
                  style={{
                    padding: "6px 10px",
                    borderRadius: "999px",
                    fontSize: "12px",
                    whiteSpace: "nowrap",
                    background:
                      status === "complete"
                        ? "rgba(0,255,120,0.15)"
                        : "rgba(255,255,255,0.08)",
                    color:
                      status === "complete"
                        ? "#00ff88"
                        : "rgba(255,255,255,0.75)",
                  }}
                >
                  {status.toUpperCase()}
                </span>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                }}
              >
                <div>
                  <p className="report-label">Score</p>
                  <strong>
                    {engineData?.score !== null &&
                    engineData?.score !== undefined
                      ? `${Math.round(engineData.score)}%`
                      : "Pending"}
                  </strong>
                </div>

                <div>
                  <p className="report-label">Classification</p>
                  <strong>{engineData?.label || "Pending"}</strong>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function EvidenceReportPage() {
  const params = useParams();
  const id = params?.id;

  const [evidence, setEvidence] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadEvidence() {
      try {
        const res = await fetch(`${API_BASE}/evidence/${id}`);
        const data = await res.json();

        if (!res.ok || !data.success) {
          setError(data.error || "Evidence report not found.");
          return;
        }

        setEvidence(data.evidence);
      } catch (err) {
        setError("Unable to load forensic evidence report.");
      } finally {
        setLoading(false);
      }
    }

    if (id) loadEvidence();
  }, [id]);

  if (loading) {
    return (
      <main className="page">
        <section className="hero">
          <h1>Loading Evidence Report...</h1>
        </section>
      </main>
    );
  }

  if (error || !evidence) {
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

  <div className="explanation-box">
  <p className="report-label">Cryptographic Integrity</p>

  <p>
    <strong>Verification Status:</strong>{" "}
    {integrity.verification_status || "Unknown"}
  </p>

  <p>
    <strong>Hash Algorithm:</strong>{" "}
    {integrity.hash_algorithm || "SHA-256"}
  </p>

  <p style={{ wordBreak: "break-all" }}>
    <strong>SHA-256:</strong>{" "}
    {integrity.sha256 || "Not recorded"}
  </p>

  <p>
    <strong>File Name:</strong>{" "}
    {integrity.file_name || "Unknown"}
  </p>

  <p>
    <strong>File Type:</strong>{" "}
    {integrity.file_type || "Unknown"}
  </p>

  <p>
    <strong>File Size:</strong>{" "}
    {integrity.file_size
      ? `${(integrity.file_size / 1024 / 1024).toFixed(2)} MB`
      : "Unknown"}
  </p>
</div>

  const score = clamp(evidence?.prooforigin?.score);
  const classification = evidence?.prooforigin?.classification || "Unknown";
  const consensusScore = evidence?.consensus?.score ?? "N/A";
  const consensusLabel = evidence?.consensus?.label || "Unknown";
  const provenance = evidence?.provenance || {};
  const metadata = evidence?.metadata || {};
  const adversarial = evidence?.adversarial || {};
  const trace = evidence?.trace || {};
  const engines = evidence?.engine_outputs || {};
  const feedback = evidence?.feedback || {};
  const integrity = evidence?.integrity || {};

  return (
    <main className="page">
      <section className="hero">
        <div className="badge">ProofOrigin Evidence Report</div>

        <h1>Forensic Authenticity Record</h1>

        <p>
          This is a public ProofOrigin evidence record generated from a media
          authenticity scan.
        </p>

        <div className="report-card">
          <div className="report-header">
            <div>
              <p className="report-label">Final Classification</p>
              <h2>{classification}</h2>
            </div>

            <div className="score-circle">
              <span>{Math.round(score)}%</span>
              <small>AI Probability</small>
            </div>
          </div>

          <div className="score-bar">
            <div style={{ width: `${score}%` }} />
          </div>

          <div className="report-grid">
            <div>
              <p className="report-label">Evidence ID</p>
              <h3 style={{ wordBreak: "break-all" }}>{evidence.report_id}</h3>
            </div>

            <div>
              <p className="report-label">Created At</p>
              <h3>{evidence.created_at}</h3>
            </div>

            <div>
              <p className="report-label">Training Status</p>
              <h3>{evidence.training_status || "Pending Review"}</h3>
            </div>

            <div>
              <p className="report-label">Record Type</p>
              <h3>Forensic Evidence</h3>
            </div>
          </div>

          <div className="explanation-box">
            <p className="report-label">Consensus Intelligence</p>
            <p>
              <strong>Score:</strong> {consensusScore}
            </p>
            <p>
              <strong>Label:</strong> {consensusLabel}
            </p>
          </div>

          <EvidenceConfidenceTimeline evidence={evidence} />

          <VisualTrustGraph evidence={evidence} />

          <div className="explanation-box">
            <p className="report-label">Provenance Chain</p>
            <pre>{JSON.stringify(provenance, null, 2)}</pre>
          </div>

          <div className="explanation-box">
            <p className="report-label">Metadata Analysis</p>
            <pre>{JSON.stringify(metadata, null, 2)}</pre>
          </div>

          <div className="explanation-box">
            <p className="report-label">Adversarial Risk</p>
            <pre>{JSON.stringify(adversarial, null, 2)}</pre>
          </div>

          <div className="explanation-box">
            <p className="report-label">Trace Analysis</p>
            <pre>{JSON.stringify(trace, null, 2)}</pre>
          </div>

          <ConsensusEngineNetwork engines={engines} />

          <div className="explanation-box">
            <p className="report-label">Feedback State</p>
            <pre>{JSON.stringify(feedback, null, 2)}</pre>
          </div>

          <div className="signals-box">
            <p className="report-label">Detected Signals</p>

            {evidence?.signals?.length > 0 ? (
              <ul>
                {evidence.signals.map((signal, index) => (
                  <li key={index}>{String(signal)}</li>
                ))}
              </ul>
            ) : (
              <p>No additional signals recorded.</p>
            )}
          </div>

          <div className="explanation-box">
            <p className="report-label">Disclaimer</p>
            <p>
              This report is a probabilistic forensic evidence record. It is not
              absolute legal proof. Stronger provenance requires original files,
              verified capture records, and chain-of-custody validation.
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

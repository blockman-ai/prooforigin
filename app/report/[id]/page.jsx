"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

const API_BASE = "https://prooforigin-ai-production-2983.up.railway.app";

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

  const score = evidence?.prooforigin?.score ?? 0;
  const classification = evidence?.prooforigin?.classification || "Unknown";
  const consensusScore = evidence?.consensus?.score ?? "N/A";
  const consensusLabel = evidence?.consensus?.label || "Unknown";
  const provenance = evidence?.provenance || {};
  const metadata = evidence?.metadata || {};
  const adversarial = evidence?.adversarial || {};
  const trace = evidence?.trace || {};
  const engines = evidence?.engine_outputs || {};
  const feedback = evidence?.feedback || {};

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
            <div style={{ width: `${Math.min(100, Math.max(0, score))}%` }} />
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

          <div className="explanation-box">
            <p className="report-label">Engine Outputs</p>
            <pre>{JSON.stringify(engines, null, 2)}</pre>
          </div>

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

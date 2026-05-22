"use client";

import { useEffect, useState } from "react";

function getAnalysisValues(percent) {
  let classification = "Human-Made";
  let manipulationRisk = "Low";

  if (percent <= 15) {
    classification = "Human-Made";
    manipulationRisk = "Low";
  } else if (percent > 15 && percent <= 40) {
    classification = "Human-Made with Minor Edits";
    manipulationRisk = "Moderate";
  } else if (percent > 40 && percent < 75) {
    classification = "Heavily Manipulated";
    manipulationRisk = "High";
  } else {
    classification = "Fully AI-Generated";
    manipulationRisk = "Very High";
  }

  let confidence = "Moderate";
  if (percent >= 85 || percent <= 15) confidence = "High";
  if (percent >= 40 && percent <= 60) confidence = "Low";

  return { classification, manipulationRisk, confidence };
}

export default function ReportPage({ params }) {
  const [report, setReport] = useState(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const id = params.id;
    const saved = localStorage.getItem(`prooforigin_report_${id}`);

    if (saved) {
      setReport(JSON.parse(saved));
    } else {
      setMissing(true);
    }
  }, [params.id]);

  if (missing) {
    return (
      <main className="page">
        <section className="hero">
          <div className="badge">Public Authenticity Report</div>
          <h1>Report Not Found</h1>
          <p>This report may only exist on the device that created it.</p>
          <a href="/detect" className="primary">
            Run New Detection
          </a>
        </section>
      </main>
    );
  }

  if (!report) {
    return (
      <main className="page">
        <section className="hero">
          <div className="badge">Loading Report</div>
          <h1>Loading...</h1>
        </section>
      </main>
    );
  }

  const percent = report.percent ?? 0;
  const humanPercent = Math.max(0, 100 - percent);
  const { classification, manipulationRisk, confidence } =
    getAnalysisValues(percent);

  return (
    <main className="page">
      <section className="hero">
        <div className="badge">Public Authenticity Report</div>

        <h1>ProofOrigin Report</h1>

        <div className="report-card">
          <h2>Report ID</h2>
          <p>{report.id}</p>

          <div className="game-stats compact-stats">
            <div>
              <span>AI Probability</span>
              <strong>{percent}%</strong>
            </div>

            <div>
              <span>Human Probability</span>
              <strong>{humanPercent}%</strong>
            </div>

            <div>
              <span>Status</span>
              <strong>{classification}</strong>
            </div>

            <div>
              <span>Risk</span>
              <strong>{manipulationRisk}</strong>
            </div>
          </div>

          <div className="explanation-box" style={{ marginTop: 24 }}>
            <p className="report-label">Confidence</p>
            <p>{confidence}</p>
          </div>

          <div className="explanation-box">
            <p className="report-label">Forensic Summary</p>
            <p>
              {report.forensicSummary ||
                "This media analysis is probabilistic and should not be treated as absolute certainty."}
            </p>
          </div>

          <p style={{ marginTop: 24 }}>
            Created: {new Date(report.createdAt).toLocaleString()}
          </p>
        </div>
      </section>
    </main>
  );
}

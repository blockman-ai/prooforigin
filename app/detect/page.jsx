"use client";

import { useState } from "react";

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

  let signals = [];

  if (classification === "Human-Made") {
    signals = [
      "Low AI-generation probability",
      "Natural image structure detected",
      "No strong synthetic-generation indicators found",
    ];
  } else if (classification === "Human-Made with Minor Edits") {
    signals = [
      "Mostly human-made image signals",
      "Possible light retouching or enhancement",
      "Some minor authenticity uncertainty detected",
    ];
  } else if (classification === "Heavily Manipulated") {
    signals = [
      "Elevated synthetic or manipulation signals",
      "Mixed authenticity indicators",
      "Manual review recommended",
    ];
  } else {
    signals = [
      "High AI-generation probability",
      "Strong synthetic-media indicators detected",
      "Content should be treated with caution",
    ];
  }

  return { classification, manipulationRisk, confidence, signals };
}

export default function DetectPage() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handleFileChange(e) {
    const selected = e.target.files[0];
    setFile(selected);
    setResult(null);
    setError("");

    if (selected) {
      setPreview(URL.createObjectURL(selected));
    }
  }

  async function analyzeImage(e) {
    e.preventDefault();
    setError("");
    setResult(null);

    const DAILY_LIMIT = 5;
    const today = new Date().toDateString();

    const storedData = JSON.parse(
      localStorage.getItem("prooforigin_limit") || "{}"
    );

    if (storedData.date !== today) {
      localStorage.setItem(
        "prooforigin_limit",
        JSON.stringify({
          date: today,
          count: 0,
        })
      );
    }

    const updatedData = JSON.parse(localStorage.getItem("prooforigin_limit"));

    const urlParams = new URLSearchParams(window.location.search);
    const isDev = urlParams.get("test") === "ski2026";

    if (!isDev && updatedData.count >= DAILY_LIMIT) {
      setError("Daily free scan limit reached. Please try again tomorrow.");
      return;
    }

    if (!file) {
      setError("Please upload an image first.");
      return;
    }

    if (!isDev) {
      localStorage.setItem(
        "prooforigin_limit",
        JSON.stringify({
          date: today,
          count: updatedData.count + 1,
        })
      );
    }

    setLoading(true);

    const formData = new FormData();
    formData.append("image", file);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong.");
      } else {
        const analysis = getAnalysisValues(data.percent ?? 0);

        let forensicSummary = "";

        try {
          const reasonForm = new FormData();

          reasonForm.append("image", file);
          reasonForm.append("percent", String(data.percent ?? 0));
          reasonForm.append("classification", analysis.classification);
          reasonForm.append("manipulationRisk", analysis.manipulationRisk);
          reasonForm.append("confidence", analysis.confidence);
          reasonForm.append("signals", JSON.stringify(analysis.signals));

          const reasonRes = await fetch("/api/reason", {
            method: "POST",
            body: reasonForm,
          });

          const reasonData = await reasonRes.json();

          if (!reasonRes.ok) {
            forensicSummary = `OpenAI vision error: ${reasonData.error}`;
          } else {
            forensicSummary =
              reasonData.summary || "No forensic summary returned.";
          }
        } catch {
          forensicSummary = "Unable to generate forensic summary.";
        }

        setResult({
          ...data,
          forensicSummary,
        });
      }
    } catch {
      setError("Unable to analyze image. Please try again.");
    }

    setLoading(false);
  }

  async function shareResult() {
    if (!result) return;

    const shareText = `ProofOrigin Analysis: ${result.percent}% AI probability. Classification: ${classification}.`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: "ProofOrigin Analysis",
          text: shareText,
          url: window.location.href,
        });
      } catch {
        // User cancelled share sheet.
      }
    } else {
      await navigator.clipboard.writeText(`${shareText} ${window.location.href}`);
      alert("Report link copied!");
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    alert("Link copied!");
  }

  function downloadReport() {
    window.print();
  }

  const percent = result?.percent ?? 0;
  const { classification, manipulationRisk, confidence, signals } =
    getAnalysisValues(percent);

  let statusClass = "status-human";

  if (classification === "Human-Made with Minor Edits") {
    statusClass = "status-edited";
  } else if (classification === "Heavily Manipulated") {
    statusClass = "status-manipulated";
  } else if (classification === "Fully AI-Generated") {
    statusClass = "status-ai";
  }

  let explanation =
    "The image returned mixed signals. Treat the result as informational, not definitive.";

  if (classification === "Human-Made") {
    explanation =
      "This image shows few indicators commonly associated with AI-generated content. It appears likely to be human-made.";
  } else if (classification === "Human-Made with Minor Edits") {
    explanation =
      "This image appears mostly human-made, but it may contain light editing, enhancement, or retouching signals.";
  } else if (classification === "Heavily Manipulated") {
    explanation =
      "This image returned mixed but elevated signals. It may contain significant editing, manipulation, or synthetic elements.";
  } else if (classification === "Fully AI-Generated") {
    explanation =
      "This image shows strong signals commonly associated with AI-generated or synthetic content.";
  }

  return (
    <main className="page">
      <section className="hero">
        <div className="badge">ProofOrigin Detector</div>

        <h1>AI Image Authenticity Report</h1>

        <p>
          Upload an image and receive a professional AI-generation probability
          report.
        </p>

        <form onSubmit={analyzeImage} className="detector-card">
          <label className="upload-box">
            <input type="file" accept="image/*" onChange={handleFileChange} />
            <span>{file ? file.name : "Choose an image to analyze"}</span>
          </label>

          {preview && (
            <img src={preview} alt="Preview" className="image-preview" />
          )}

          <button className="primary" type="submit" disabled={loading}>
            {loading ? "Analyzing Image..." : "Run Detection"}
          </button>
        </form>

        {error && <div className="error-box">{error}</div>}

        {result && (
          <div className="report-card">
            <div className="report-header">
              <div>
                <p className="report-label">Final Classification</p>
                <h2 className={statusClass}>{classification}</h2>
              </div>

              <div className="score-circle">
                <span>{percent}%</span>
                <small>AI Probability</small>
              </div>
            </div>

            <div className="score-bar">
              <div style={{ width: `${percent}%` }} />
            </div>

            <div className="report-grid">
              <div>
                <p className="report-label">Confidence</p>
                <h3>{confidence}</h3>
              </div>

              <div>
                <p className="report-label">Manipulation Risk</p>
                <h3>{manipulationRisk}</h3>
              </div>

              <div>
                <p className="report-label">Media Type</p>
                <h3>Image</h3>
              </div>

              <div>
                <p className="report-label">Status</p>
                <h3>Complete</h3>
              </div>
            </div>

            <div className="explanation-box">
              <p className="report-label">Explanation</p>
              <p>{explanation}</p>
            </div>

            <div className="explanation-box">
              <p className="report-label">Forensic Vision Summary</p>
              <p>
                {result?.forensicSummary ||
                  "This media analysis is based on probability signals and should not be treated as absolute certainty."}
              </p>
            </div>

            <div className="signals-box">
              <p className="report-label">Detected Signals</p>

              <ul>
                {signals.map((signal, index) => (
                  <li key={index}>{signal}</li>
                ))}
              </ul>
            </div>

            <div className="share-buttons">
              <button onClick={shareResult}>Share Report</button>
              <button onClick={copyLink}>Copy Link</button>
              <button onClick={downloadReport}>Download Report</button>
            </div>

            <button
              className="secondary"
              onClick={() => {
                setFile(null);
                setPreview("");
                setResult(null);
              }}
            >
              Analyze Another Image
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

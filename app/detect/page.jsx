"use client";

import { useState } from "react";

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

    if (!file) {
      setError("Please upload an image first.");
      return;
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
        setResult(data);
      }
    } catch {
      setError("Unable to analyze image. Please try again.");
    }

    setLoading(false);
  }

  const percent = result?.percent ?? 0;

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
                <h2>{classification}</h2>
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

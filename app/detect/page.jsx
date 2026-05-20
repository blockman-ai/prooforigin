"use client";

import { useState } from "react";

export default function DetectPage() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

    setLoading(false);
  }

  return (
    <main className="page">
      <section className="hero">
        <div className="badge">ProofOrigin Detector</div>

        <h1>Analyze an Image</h1>

        <p>
          Upload an image and receive an AI-generation probability report.
        </p>

        <form onSubmit={analyzeImage} className="card">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files[0])}
          />

          <button className="primary" type="submit" disabled={loading}>
            {loading ? "Analyzing..." : "Run Detection"}
          </button>
        </form>

        {error && <p>{error}</p>}

        {result && (
          <div className="card">
            <h2>{result.verdict}</h2>
            <p>AI Probability: {result.percent}%</p>
          </div>
        )}
      </section>
    </main>
  );
}

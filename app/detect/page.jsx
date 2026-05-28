"use client";

import { useState } from "react";

const heic2any =
  typeof window !== "undefined"
    ? require("heic2any")
    : null;

const PROOFORIGIN_API =
  "https://prooforigin-ai-production-2983.up.railway.app/analyze";

function getAnalysisValues(percent) {
  let classification = "Likely Human-Made";
  let manipulationRisk = "Low";

  if (percent >= 85) {
    classification = "Strong AI Consensus";
    manipulationRisk = "Very High";
  } else if (percent >= 65) {
    classification = "Likely AI-Generated";
    manipulationRisk = "High";
  } else if (percent >= 45) {
    classification = "AI-Assisted or Heavily Edited";
    manipulationRisk = "Elevated";
  } else if (percent >= 20) {
    classification = "Mixed / Suspicious";
    manipulationRisk = "Moderate";
  }

  let confidence = "Moderate";

  if (percent >= 80 || percent <= 15) {
    confidence = "High";
  }

  if (percent >= 40 && percent <= 60) {
    confidence = "Low";
  }

  const signals = [];

  if (percent >= 65) {
    signals.push("Strong AI-generation probability");
    signals.push("Multiple synthetic-media indicators detected");
    signals.push("Content should be treated with caution");
  } else if (percent >= 45) {
    signals.push("Editing or AI-assisted indicators detected");
    signals.push("Mixed forensic evidence");
    signals.push("Composite or social-media processing possible");
  } else if (percent >= 20) {
    signals.push("Some suspicious characteristics detected");
    signals.push("Image may contain edits, filters, compression, or composite traits");
  } else {
    signals.push("Low AI-generation probability");
    signals.push("Natural image structure detected");
    signals.push("No strong full-AI generation signal detected");
  }

  if (percent < 40) {
    signals.push("Composite risk should still be reviewed separately from AI probability");
  }

  return {
    classification,
    manipulationRisk,
    confidence,
    signals,
  };
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 4) {
  const words = String(text || "").split(" ");
  let line = "";
  let lines = 0;

  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i] + " ";
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && i > 0) {
      ctx.fillText(line, x, y);
      line = words[i] + " ";
      y += lineHeight;
      lines++;

      if (lines >= maxLines - 1) {
        ctx.fillText(line.trim() + "...", x, y);
        return;
      }
    } else {
      line = testLine;
    }
  }

  ctx.fillText(line, x, y);
}

export default function DetectPage() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function createReportId() {
    const now = Date.now();
    const text = String(now);
    const id = text.substring(5);
    return id;
  }

  function getReportUrl(reportId) {
    if (typeof window === "undefined") return "";
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    return baseUrl + "/report/" + reportId;
  }

  async function handleFileChange(e) {
  const selected = e.target.files?.[0];

  setFile(selected || null);
  setResult(null);
  setError("");
  setPreview("");

  if (!selected) return;

  const fileName = selected.name.toLowerCase();

  const isHeic =
    fileName.endsWith(".heic") ||
    fileName.endsWith(".heif") ||
    selected.type === "image/heic" ||
    selected.type === "image/heif";

  try {
    if (isHeic) {
      const convertedBlob = await heic2any({
        blob: selected,
        toType: "image/jpeg",
        quality: 0.9,
      });

      const previewUrl =
        URL.createObjectURL(convertedBlob);

      setPreview(previewUrl);

    } else {
      const imageUrl =
        URL.createObjectURL(selected);

      setPreview(imageUrl);
    }

  } catch (err) {
    console.error(err);

    setPreview("");

    setError(
      "Image selected, but HEIC preview could not be generated."
    );
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

    const updatedData = JSON.parse(
      localStorage.getItem("prooforigin_limit") || "{}"
    );

    const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
    const isDev = urlParams.get("test") === "ski2026";

    if (!isDev && updatedData.count >= DAILY_LIMIT) {
      setError("Daily free scan limit reached.");
      return;
    }

    if (!isDev) {
      localStorage.setItem(
        "prooforigin_limit",
        JSON.stringify({
          date: today,
          count: (updatedData.count || 0) + 1,
        })
      );
    }

    setLoading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(PROOFORIGIN_API, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      console.log("ProofOrigin API response:", data);

      if (!res.ok) {
        setError(data.error || "Analysis failed.");
        setLoading(false);
        return;
      }

      const finalScore =
        data.weightedConsensus?.score ??
        data.weighted_consensus?.score ??
        data.engine_outputs?.openai_vision?.score ??
        data.percent ??
        0;

      const livePercent = Math.round(Number(finalScore) || 0);

      const finalLabel =
        data.weightedConsensus?.label ??
        data.weighted_consensus?.label ??
        data.verdict ??
        getAnalysisValues(livePercent).classification;

      const reportId = data.file_id || data.report_id || createReportId();

      const forensicSummary =
        data?.engine_outputs?.openai_vision?.reasoning_summary ||
        data?.trace_analysis?.summary ||
        data?.origin_analysis?.explanation ||
        data?.verdict ||
        "ProofOrigin AI completed forensic analysis.";

      const savedReport = {
        id: reportId,
        percent: livePercent,
        forensicSummary,
        prooforiginAI: data,
        metadata: data.metadata || null,
        metadataSignals: data.metadata?.metadataSignals || [],
        exifSignals: data.metadata?.exifSignals || [],
        proofOriginScore:
          data.weightedConsensus?.score ??
          data.weighted_consensus?.score ??
          data.consensus_analysis?.consensus_score ??
          null,
        weightedConsensus:
          data.weightedConsensus || data.weighted_consensus || null,
        forensicContext:
          data.forensicContext || data.forensic_context || null,
        engineArbitration:
          data.engineArbitration || data.engine_arbitration || null,
        engine_outputs: data.engine_outputs || {},
        humanSummary:
  data.humanSummary ||
  data.human_summary ||
  null,
        confidenceEscalation:
  data.confidenceEscalation ||
  data.confidence_escalation ||
  null,

originalConsensus:
  data.originalConsensus ||
  data.original_consensus ||
  null,
        verdict: finalLabel,
        createdAt: new Date().toISOString(),
      };

      localStorage.setItem(
        "prooforigin_report_" + reportId,
        JSON.stringify(savedReport)
      );

      setResult({
        ...data,
        percent: livePercent,
        forensicSummary,
        reportId,
        classification: finalLabel,
        weightedConsensus:
          data.weightedConsensus || data.weighted_consensus || null,
        forensicContext:
          data.forensicContext || data.forensic_context || null,
        engineArbitration:
          data.engineArbitration || data.engine_arbitration || null,
        engine_outputs: data.engine_outputs || {},
        humanSummary:
  data.humanSummary ||
  data.human_summary ||
  null,
        confidenceEscalation:
  data.confidenceEscalation ||
  data.confidence_escalation ||
  null,

originalConsensus:
  data.originalConsensus ||
  data.original_consensus ||
  null,
      });
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to analyze image.");
    }

    setLoading(false);
  }

  async function shareResult() {
    if (!result) return;

    const reportUrl = getReportUrl(result.reportId);
    const percentValue = result?.percent ?? 0;
    const analysis = getAnalysisValues(percentValue);

    const shareText =
      "ProofOrigin Analysis: " +
      percentValue +
      "% AI probability. Classification: " +
      (result.classification || analysis.classification) +
      ". View report: " +
      reportUrl;

    if (navigator.share) {
      try {
        await navigator.share({
          title: "ProofOrigin Report",
          text: shareText,
          url: reportUrl,
        });
      } catch {}
    } else {
      await navigator.clipboard.writeText(shareText);
      alert("Report link copied!");
    }
  }

  async function copyLink() {
    if (!result) return;

    const reportUrl = getReportUrl(result.reportId);
    await navigator.clipboard.writeText(reportUrl);
    alert("Report link copied!");
  }

  function viewReport() {
    if (!result) return;
    if (typeof window !== "undefined") window.open(getReportUrl(result.reportId), "_blank");
  }

  function downloadReport() {
    if (typeof window !== "undefined") window.print();
  }

  async function createReportImageBlob() {
    if (!result) return null;

    const percentValue = result?.percent ?? 0;
    const analysis = getAnalysisValues(percentValue);
    const reportUrl = getReportUrl(result.reportId);

    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1350;

    const ctx = canvas.getContext("2d");

    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, "#063845");
    gradient.addColorStop(0.45, "#07111f");
    gradient.addColorStop(1, "#030712");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#00e5ff";
    ctx.font = "bold 42px Arial";
    ctx.fillText("ProofOrigin Authenticity Report", 70, 90);

    ctx.fillStyle = "white";
    ctx.font = "bold 78px Arial";
    ctx.fillText(percentValue + "% AI Probability", 70, 210);

    ctx.fillStyle = "#ffcc00";
    ctx.font = "bold 52px Arial";
    ctx.fillText(
      result.classification || analysis.classification,
      70,
      290
    );

    ctx.fillStyle = "#b8c2d6";
    ctx.font = "32px Arial";
    ctx.fillText("Confidence: " + analysis.confidence, 70, 370);
    ctx.fillText(
      "Manipulation Risk: " + analysis.manipulationRisk,
      70,
      420
    );
    ctx.fillText("Report ID: " + result.reportId, 70, 470);

    if (preview) {
      const img = new Image();
      img.src = preview;

      await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });

      ctx.save();
      ctx.beginPath();

      if (ctx.roundRect) {
        ctx.roundRect(70, 530, 940, 470, 28);
      } else {
        ctx.rect(70, 530, 940, 470);
      }

      ctx.clip();
      ctx.drawImage(img, 70, 530, 940, 470);
      ctx.restore();
    }

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();

    if (ctx.roundRect) {
      ctx.roundRect(70, 1040, 940, 180, 28);
    } else {
      ctx.rect(70, 1040, 940, 180);
    }

    ctx.fill();

    ctx.fillStyle = "#dbeafe";
    ctx.font = "30px Arial";

    const summary =
      result?.forensicSummary ||
      "This media analysis is probabilistic and should not be treated as absolute certainty.";

    wrapText(ctx, summary, 100, 1105, 860, 38, 4);

    ctx.fillStyle = "#00e5ff";
    ctx.font = "bold 30px Arial";
    ctx.fillText(reportUrl, 100, 1265);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/png");
    });
  }

  async function downloadReportImage() {
    const blob = await createReportImageBlob();

    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = "prooforigin-report-" + result.reportId + ".png";
    a.click();

    URL.revokeObjectURL(url);
  }

  async function shareReportImage() {
    const blob = await createReportImageBlob();

    if (!blob) return;

    const imageFile = new File(
      [blob],
      "prooforigin-report-" + result.reportId + ".png",
      {
        type: "image/png",
      }
    );

    if (
      navigator.canShare &&
      navigator.canShare({
        files: [imageFile],
      })
    ) {
      await navigator.share({
        title: "ProofOrigin Report",
        text:
          "ProofOrigin Analysis: " +
          (result?.percent ?? 0) +
          "% AI probability.",
        files: [imageFile],
      });
    } else {
      await downloadReportImage();
    }
  }

  const percent = result?.percent ?? 0;
  const fallbackAnalysis = getAnalysisValues(percent);

  const classification =
    result?.classification || fallbackAnalysis.classification;

  const manipulationRisk = fallbackAnalysis.manipulationRisk;
  const confidence = fallbackAnalysis.confidence;
  const signals = fallbackAnalysis.signals;

  let statusClass = "status-human";

  if (
    classification === "Mixed / Suspicious" ||
    classification === "AI-Assisted or Heavily Edited"
  ) {
    statusClass = "status-edited";
  } else if (
    classification === "Likely AI-Generated" ||
    classification === "Highly Likely AI-Generated" ||
    classification === "Strong AI Consensus"
  ) {
    statusClass = "status-ai";
  }

  const explanation =
    result?.engine_outputs?.openai_vision?.reasoning_summary ||
    result?.origin_analysis?.explanation ||
    "The image returned mixed signals. Treat the result as informational, not definitive.";

  return (
    <main className="page">
      <section className="hero">
        <div className="badge">ProofOrigin AI Live Detector</div>

        <h1>AI Image Authenticity Report</h1>

        <p>
          Upload an image and receive a live ProofOrigin AI forensic
          authenticity report.
        </p>

        <form onSubmit={analyzeImage} className="detector-card">
          <label className="upload-box">
            <input
              className="file-input-hidden"
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.heic,.heif"
              onChange={handleFileChange}
            />
            <span>{file ? file.name : "Choose an image to analyze"}</span>
          </label>

          {preview && (
            <div className="preview-wrap">
              <img src={preview} alt="Preview" className="image-preview" />
            </div>
          )}

          <button className="primary" type="submit" disabled={loading}>
            {loading ? "Analyzing With ProofOrigin AI..." : "Run Detection"}
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
              <div style={{ width: percent + "%" }} />
            </div>

            <div className="explanation-box">
  <p className="report-label">Human Summary</p>

  <p>
    {result.humanSummary?.summary ||
      result.human_summary?.summary ||
      "ProofOrigin completed a human-readable authenticity summary."}
  </p>
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
                <p className="report-label">Origin</p>
                <h3>{result.origin_analysis?.label || "Unknown"}</h3>
              </div>

              <div>
                <p className="report-label">Status</p>
                <h3>Complete</h3>
              </div>
            </div>

            <div className="explanation-box">
              <p className="report-label">Report ID</p>
              <p>{result.reportId}</p>
            </div>

            <div className="explanation-box">
              <p className="report-label">Explanation</p>
              <p>{explanation}</p>
            </div>

            <div className="explanation-box">
              <p className="report-label">ProofOrigin AI Forensic Summary</p>
              <p>{result.forensicSummary}</p>
            </div>

            <div className="explanation-box">
              <p className="report-label">Forensic Context Analysis</p>

              <p>
                <strong>Media Object Type:</strong>{" "}
                {result.forensicContext?.media_object_type || "Unknown"}
              </p>

              <p>
                <strong>Embedded AI Likelihood:</strong>{" "}
                {result.forensicContext?.embedded_ai_likelihood ?? "N/A"}%
              </p>

              <p>
                <strong>Final Media Authenticity:</strong>{" "}
                {result.forensicContext?.final_media_authenticity || "Unknown"}
              </p>

              <p>
                <strong>Context Explanation:</strong>{" "}
                {result.forensicContext?.forensic_context_explanation ||
                  "No forensic context available."}
              </p>
            </div>

            <div className="explanation-box">
              <p className="report-label">Sub-Detection Intelligence</p>

              <p>
                <strong>Screenshot / Re-Encoding:</strong>{" "}
                {result.forensicContext?.screenshot_or_reencoding_likely
                  ? "Detected"
                  : "Not Detected"}
              </p>

              <p>
                <strong>Embedded Synthetic Content:</strong>{" "}
                {result.forensicContext?.synthetic_content_likely
                  ? "Likely"
                  : "Not Strongly Detected"}
              </p>

              <p>
                <strong>Missing EXIF:</strong>{" "}
                {result.forensicContext?.transformation_layers?.missing_exif
                  ? "Yes"
                  : "No"}
              </p>

              <p>
                <strong>Screenshot Indicators:</strong>{" "}
                {result.forensicContext?.transformation_layers
                  ?.screenshot_indicators ?? "N/A"}
              </p>

              <p>
                <strong>Synthetic Indicators:</strong>{" "}
                {result.forensicContext?.transformation_layers
                  ?.synthetic_indicators ?? "N/A"}
              </p>
            </div>

            <div className="explanation-box">
              <p className="report-label">Engine Arbitration Analysis</p>

              <p>

                <div className="explanation-box">
  <p className="report-label">Confidence Escalation</p>

  <p>
    <strong>Escalation Triggered:</strong>{" "}
    {result.confidenceEscalation?.escalation_triggered ||
    result.confidence_escalation?.escalation_triggered
      ? "Yes"
      : "No"}
  </p>

  <p>
    <strong>Escalated Score:</strong>{" "}
    {result.confidenceEscalation?.score ??
      result.confidence_escalation?.score ??
      "N/A"}
    %
  </p>

  <p>
    <strong>Final Label:</strong>{" "}
    {result.confidenceEscalation?.label ||
      result.confidence_escalation?.label ||
      "Unknown"}
  </p>

  <p>
    <strong>Reason:</strong>{" "}
    {(result.confidenceEscalation?.escalation_reasons ||
      result.confidence_escalation?.escalation_reasons ||
      []).join(", ") || "No escalation applied."}
  </p>
</div>
              <strong>Confidence:</strong>{" "}
                {result.engineArbitration?.confidence ||
                  result.engine_arbitration?.confidence ||
                  "Unknown"}
              </p>

              <p>
                <strong>Score Spread:</strong>{" "}
                {result.engineArbitration?.score_spread ??
                  result.engine_arbitration?.score_spread ??
                  "N/A"}
              </p>

              <p>
                {result.engineArbitration?.explanation ||
                  result.engine_arbitration?.explanation ||
                  "No engine arbitration analysis available."}
              </p>
            </div>

            <div className="explanation-box">
              <p className="report-label">Consensus Intelligence</p>

              <p>
                <strong>Score:</strong>{" "}
                {result.weightedConsensus?.score ??
                  result.weighted_consensus?.score ??
                  result.consensus_analysis?.consensus_score ??
                  "N/A"}
              </p>

              <p>
                <strong>Label:</strong>{" "}
                {result.weightedConsensus?.label ??
                  result.weighted_consensus?.label ??
                  result.consensus_analysis?.consensus_label ??
                  "N/A"}
              </p>

              <p>
                <strong>Engines Used:</strong>{" "}
                {result.weightedConsensus?.engines_used?.join(", ") ||
                  result.weighted_consensus?.engines_used?.join(", ") ||
                  "N/A"}
              </p>
            </div>

            <div className="explanation-box">
              <p className="report-label">Adversarial Risk</p>

              <p>
                <strong>Risk Level:</strong>{" "}
                {result.adversarial_analysis?.risk_level ?? "N/A"}
              </p>

              <p>
                <strong>Risk Score:</strong>{" "}
                {result.adversarial_analysis?.risk_score ?? "N/A"}
              </p>
            </div>

            {result.provenance_analysis?.probable_chain?.length > 0 && (
              <div className="signals-box">
                <p className="report-label">Provenance Chain</p>

                <ul>
                  {result.provenance_analysis.probable_chain.map(
                    (item, index) => (
                      <li key={index}>{item}</li>
                    )
                  )}
                </ul>
              </div>
            )}

            <div className="signals-box">
              <p className="report-label">Detected Signals</p>

              <ul>
                {signals.map((signal, index) => (
                  <li key={index}>{signal}</li>
                ))}
              </ul>
            </div>

            <div className="share-buttons">
              <button onClick={shareResult}>Share Link</button>
              <button onClick={copyLink}>Copy Link</button>
              <button onClick={viewReport}>View Report</button>
              <button onClick={shareReportImage}>Share Image</button>
              <button onClick={downloadReportImage}>Download Image</button>
              <button onClick={downloadReport}>Download PDF</button>
            </div>

            <button
              className="secondary"
              onClick={() => {
                setFile(null);
                setPreview("");
                setResult(null);
                setError("");
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

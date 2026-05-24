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

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 4) {
const words = text.split(" ");
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
return Math.random().toString(36).substring(2, 10);
}

function getReportUrl(reportId) {
return `${window.location.origin}/report/${reportId}`;

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

    const reportId = createReportId();  

    const savedReport = {  
      id: reportId,  
      percent: data.percent ?? 0,  
      forensicSummary,  
      metadata: data.metadata || null,  
      proofOriginScore: data.proofOriginScore ?? null,  
      createdAt: new Date().toISOString(),  
    };  

    localStorage.setItem(  
      `prooforigin_report_${reportId}`,  
      JSON.stringify(savedReport)  
    );  

    setResult({  
      ...data,  
      forensicSummary,  
      reportId,  
    });  
  }  
} catch {  
  setError("Unable to analyze image. Please try again.");  
}  

setLoading(false);

}

async function shareResult() {
if (!result) return;

const reportUrl = getReportUrl(result.reportId);  
const percentValue = result?.percent ?? 0;  
const analysis = getAnalysisValues(percentValue);  

const shareText = `ProofOrigin Analysis: ${percentValue}% AI probability. Classification: ${analysis.classification}. View report: ${reportUrl}`;  

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

const reportUrl = getReportUrl(result.reportId);  
window.open(reportUrl, "_blank");

}

function downloadReport() {
window.print();
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
ctx.fillText(`${percentValue}% AI Probability`, 70, 210);  

ctx.fillStyle = "#ffcc00";  
ctx.font = "bold 52px Arial";  
ctx.fillText(analysis.classification, 70, 290);  

ctx.fillStyle = "#b8c2d6";  
ctx.font = "32px Arial";  
ctx.fillText(`Confidence: ${analysis.confidence}`, 70, 370);  
ctx.fillText(`Manipulation Risk: ${analysis.manipulationRisk}`, 70, 420);  
ctx.fillText(`Report ID: ${result.reportId}`, 70, 470);  

if (preview) {  
  const img = new Image();  
  img.src = preview;  

  await new Promise((resolve) => {  
    img.onload = resolve;  
    img.onerror = resolve;  
  });  

  ctx.save();  
  ctx.beginPath();  
  ctx.roundRect(70, 530, 940, 470, 28);  
  ctx.clip();  
  ctx.drawImage(img, 70, 530, 940, 470);  
  ctx.restore();  
}  

ctx.fillStyle = "rgba(255,255,255,0.08)";  
ctx.beginPath();  
ctx.roundRect(70, 1040, 940, 180, 28);  
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
a.download = `prooforigin-report-${result.reportId}.png`;  
a.click();  
URL.revokeObjectURL(url);

}

async function shareReportImage() {
const blob = await createReportImageBlob();
if (!blob) return;

const file = new File([blob], `prooforigin-report-${result.reportId}.png`, {  
  type: "image/png",  
});  

if (navigator.canShare && navigator.canShare({ files: [file] })) {  
  await navigator.share({  
    title: "ProofOrigin Report",  
    text: `ProofOrigin Analysis: ${percent}% AI probability.`,  
    files: [file],  
  });  
} else {  
  await downloadReportImage();  
}

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
            <p className="report-label">Integrity Score</p>  
            <h3>{result?.metadata?.integrityScore ?? "N/A"}/100</h3>  
          </div>  

          <div>  
            <p className="report-label">Metadata Status</p>  
            <h3>{result?.metadata?.metadataStatus || "N/A"}</h3>  
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
          <p className="report-label">Forensic Vision Summary</p>  
          <p>  
            {result?.forensicSummary ||  
              "This media analysis is based on probability signals and should not be treated as absolute certainty."}  
          </p>  
        </div>  

        {result?.metadata && (  
          <div className="explanation-box">  
            <p className="report-label">Metadata Forensics</p>  

            <p>  
              <strong>Status:</strong> {result.metadata.metadataStatus}  
            </p>  

            <p>  
              <strong>Integrity Score:</strong>{" "}  
              {result.metadata.integrityScore}/100  
            </p>  

            <p>  
              <strong>File Type:</strong> {result.metadata.fileType}  
            </p>  

            <p>  
              <strong>File Size:</strong>{" "}  
              {(result.metadata.fileSize / 1024 / 1024).toFixed(2)} MB  
            </p>  

            <p>  
              <strong>Camera:</strong>{" "}  
              {result.metadata.exif?.make || "Unknown"}{" "}  
              {result.metadata.exif?.model || ""}  
            </p>  

            <p>  
              <strong>Software:</strong>{" "}  
              {result.metadata.exif?.software || "Not detected"}  
            </p>  

            <p>  
              <strong>Date Taken:</strong>{" "}  
              {result.metadata.exif?.dateTimeOriginal || "Not detected"}  
            </p>  

            <p>  
              <strong>GPS Present:</strong>{" "}  
              {result.metadata.exif?.gpsPresent ? "Yes" : "No"}  
            </p>  

            <p>

<strong>Image Size:</strong>{" "}
{result.metadata.exif?.imageWidth || "Unknown"} x{" "}
{result.metadata.exif?.imageHeight || "Unknown"}

</p>  <p style={{ wordBreak: "break-all" }}>  
              <strong>SHA-256:</strong> {result.metadata.sha256}  
            </p>  
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

        {result?.metadata?.metadataSignals?.length > 0 && (  
          <div className="signals-box">  
            <p className="report-label">Metadata Signals</p>  

            <ul>  
              {result.metadata.metadataSignals.map((signal, index) => (  
                <li key={index}>{signal}</li>  
              ))}  
            </ul>  
          </div>  
        )}  

        {result?.metadata?.exifSignals?.length > 0 && (  
          <div className="signals-box">  
            <p className="report-label">EXIF Signals</p>  

            <ul>  
              {result.metadata.exifSignals.map((signal, index) => (  
                <li key={index}>{signal}</li>  
              ))}  
            </ul>  
          </div>  
        )}  

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

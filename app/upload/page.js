"use client";

import { useEffect, useState } from "react";
import GlassPanel from "../../components/protocol/GlassPanel";
import PageShell from "../../components/protocol/PageShell";
import ProtocolBadge from "../../components/protocol/ProtocolBadge";
import StatusCard from "../../components/protocol/StatusCard";
import { getProofOriginAnalyzeUrl } from "../lib/prooforiginAiConfig";
import { getSupabase } from "../lib/supabase";
import { buildProofMetadataFromAnalyze } from "../lib/prooforiginProtocolMapper";

const ANALYZE_WARNING =
  "Protocol evaluation unavailable. Basic proof record created without analysis metadata.";

const STEPS = [
  { key: "analyze", label: "Running protocol evaluation" },
  { key: "upload", label: "Uploading file to storage" },
  { key: "save", label: "Saving proof record" },
];

export default function UploadPage() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [uploading, setUploading] = useState(false);
  const [activeStep, setActiveStep] = useState("");
  const [completedSteps, setCompletedSteps] = useState([]);
  const [proof, setProof] = useState(null);
  const [evaluated, setEvaluated] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  useEffect(() => {
    if (!file) {
      setPreview("");
      return undefined;
    }

    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    }

    setPreview("");
    return undefined;
  }, [file]);

  async function runAnalyze(selectedFile) {
    const analyzeForm = new FormData();
    analyzeForm.append("file", selectedFile);

    const analyzeRes = await fetch(getProofOriginAnalyzeUrl(), {
      method: "POST",
      body: analyzeForm,
    });

    const analyzeData = await analyzeRes.json();

    if (!analyzeRes.ok || analyzeData.success === false) {
      return {
        metadata: null,
        warning: analyzeData.error || ANALYZE_WARNING,
      };
    }

    return {
      metadata: buildProofMetadataFromAnalyze(analyzeData),
      warning: "",
    };
  }

  function markStepDone(step) {
    setCompletedSteps((prev) => (prev.includes(step) ? prev : [...prev, step]));
  }

  async function handleUpload() {
    if (!file) return;

    setUploading(true);
    setError("");
    setWarning("");
    setProof(null);
    setEvaluated(false);
    setCompletedSteps([]);
    setActiveStep("analyze");

    let analyzeMetadata = null;
    let analyzeWarning = "";

    try {
      const analyzeResult = await runAnalyze(file);
      analyzeMetadata = analyzeResult.metadata;
      analyzeWarning = analyzeResult.warning;
      markStepDone("analyze");
    } catch {
      analyzeWarning = ANALYZE_WARNING;
      markStepDone("analyze");
    }

    if (analyzeWarning) {
      setWarning(analyzeWarning);
    }

    try {
      const supabase = getSupabase();
      const proofId = crypto.randomUUID();
      const storagePath = `uploads/${proofId}-${file.name}`;

      setActiveStep("upload");

      const { error: uploadError } = await supabase.storage
        .from("proofs")
        .upload(storagePath, file);

      if (uploadError) throw uploadError;
      markStepDone("upload");

      const { data: publicData } = supabase.storage
        .from("proofs")
        .getPublicUrl(storagePath);

      setActiveStep("save");

      const { error: insertError } = await supabase.from("proofs").insert({
        proof_id: proofId,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        storage_path: storagePath,
        public_url: publicData.publicUrl,
        status: analyzeMetadata ? "evaluated" : "uploaded",
        metadata: analyzeMetadata ?? {},
      });

      if (insertError) throw insertError;
      markStepDone("save");

      setEvaluated(Boolean(analyzeMetadata));
      setProof(proofId);
      setActiveStep("");
    } catch (err) {
      setError(err.message || "Upload failed");
      setActiveStep("");
    }

    setUploading(false);
  }

  return (
    <PageShell
      narrow
      badge="Protocol Upload"
      title="Create Proof Record"
      subtitle="Upload digital content for protocol-scoped evaluation. This does not verify absolute truth."
    >
      <GlassPanel>
        <label className="upload-dropzone">
          <input
            className="file-input-hidden"
            type="file"
            accept="image/*,video/*,.pdf,.doc,.docx"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <span className="upload-dropzone__icon" aria-hidden="true">
            ↑
          </span>
          <p className="upload-dropzone__title">
            {file ? file.name : "Drop a file or tap to browse"}
          </p>
          <p className="upload-dropzone__hint">
            Images, video, PDF, and documents supported
          </p>
        </label>

        {preview && (
          <div className="image-frame">
            <img src={preview} alt="Upload preview" />
          </div>
        )}

        {file && !preview && (
          <div className="file-preview-meta">
            <p className="file-preview-meta__name">
              <strong>Selected file:</strong> {file.name}
            </p>
            <p className="file-preview-meta__detail">
              {file.type || "Unknown type"} ·{" "}
              {Math.max(1, Math.round(file.size / 1024))} KB
            </p>
          </div>
        )}

        {uploading && (
          <div className="progress-steps" aria-live="polite">
            {STEPS.map((step) => {
              const done = completedSteps.includes(step.key);
              const active = activeStep === step.key;
              return (
                <div
                  key={step.key}
                  className={`progress-step ${done ? "progress-step--done" : ""} ${active ? "progress-step--active" : ""}`.trim()}
                >
                  <span className="progress-step__dot" />
                  <span>{step.label}</span>
                </div>
              );
            })}
          </div>
        )}

        <div className="protocol-actions">
          <button
            className="primary"
            onClick={handleUpload}
            disabled={uploading || !file}
            type="button"
          >
            {uploading ? "Processing..." : "Generate Proof Record"}
          </button>
        </div>
      </GlassPanel>

      {proof && (
        <StatusCard variant={evaluated ? "success" : "warning"}>
          <div className="record-header__badges" style={{ marginBottom: 12 }}>
            <ProtocolBadge variant={evaluated ? "success" : "pending"}>
              {evaluated ? "Evaluated" : "Uploaded — pending metadata"}
            </ProtocolBadge>
          </div>
          <div className="protocol-actions">
            <a className="primary" href={`/verify/${proof}`}>
              Open Protocol Record
            </a>
          </div>
        </StatusCard>
      )}

      {warning && (
        <div className="alert-banner alert-banner--warning" role="status">
          <strong>Protocol evaluation warning</strong>
          {warning}
        </div>
      )}

      {error && (
        <div className="alert-banner alert-banner--error" role="alert">
          <strong>Upload failed</strong>
          {error}
        </div>
      )}
    </PageShell>
  );
}

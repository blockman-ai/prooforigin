"use client";

import { useState } from "react";
import { getProofOriginAnalyzeUrl } from "../lib/prooforiginAiConfig";
import { getSupabase } from "../lib/supabase";
import { buildProofMetadataFromAnalyze } from "../lib/prooforiginProtocolMapper";

const ANALYZE_WARNING =
  "Protocol evaluation unavailable. Basic proof record created without analysis metadata.";

export default function UploadPage() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [proof, setProof] = useState(null);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [status, setStatus] = useState("");

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

  async function handleUpload() {
    if (!file) return;

    setUploading(true);
    setError("");
    setWarning("");
    setProof(null);
    setStatus("Running protocol evaluation...");

    let analyzeMetadata = null;
    let analyzeWarning = "";

    try {
      const analyzeResult = await runAnalyze(file);
      analyzeMetadata = analyzeResult.metadata;
      analyzeWarning = analyzeResult.warning;
    } catch {
      analyzeWarning = ANALYZE_WARNING;
    }

    if (analyzeWarning) {
      setWarning(analyzeWarning);
    }

    try {
      const supabase = getSupabase();
      const proofId = crypto.randomUUID();
      const storagePath = `uploads/${proofId}-${file.name}`;

      setStatus("Uploading file...");

      const { error: uploadError } = await supabase.storage
        .from("proofs")
        .upload(storagePath, file);

      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage
        .from("proofs")
        .getPublicUrl(storagePath);

      setStatus("Saving proof record...");

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

      setStatus(
        analyzeMetadata
          ? "Proof record complete."
          : "Proof record saved without protocol evaluation metadata."
      );
      setProof(proofId);
    } catch (err) {
      setError(err.message || "Upload failed");
      setStatus("");
    }

    setUploading(false);
  }

  return (
    <main style={{ padding: 24, maxWidth: 760, margin: "0 auto", fontFamily: "Arial, sans-serif" }}>
      <h1>ProofOrigin</h1>

      <p>
        Upload digital content to create a protocol evaluation record. This does
        not verify absolute truth.
      </p>

      <div style={{ border: "2px dashed #666", borderRadius: 16, padding: 30, marginTop: 20 }}>
        <input
          type="file"
          accept="image/*,video/*,.pdf,.doc,.docx"
          onChange={(e) => setFile(e.target.files?.[0])}
        />

        {file && <p style={{ marginTop: 10 }}>Selected: {file.name}</p>}

        <button
          onClick={handleUpload}
          disabled={uploading || !file}
          style={{
            marginTop: 20,
            padding: "12px 18px",
            borderRadius: 10,
            border: "none",
            cursor: uploading || !file ? "not-allowed" : "pointer",
          }}
        >
          {uploading ? "Processing..." : "Generate Proof Record"}
        </button>

        {status && (
          <p style={{ marginTop: 16 }}>
            <strong>Status:</strong> {status}
          </p>
        )}
      </div>

      {proof && (
        <div style={{ marginTop: 30 }}>
          <h2>Proof Record Created</h2>
          <a href={`/verify/${proof}`}>Open Protocol Record</a>
        </div>
      )}

      {warning && (
        <p style={{ color: "#b8860b", marginTop: 20 }}>
          <strong>Warning:</strong> {warning}
        </p>
      )}

      {error && <p style={{ color: "red", marginTop: 20 }}>{error}</p>}
    </main>
  );
}

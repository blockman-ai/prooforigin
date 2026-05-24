"use client";

import { useState } from "react";
import { supabase } from "../lib/supabase";
import { processProof } from "../lib/processProof";

export default function UploadPage() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [proof, setProof] = useState(null);
  const [error, setError] = useState("");
  const [analysisStatus, setAnalysisStatus] = useState("");

  async function handleUpload() {
    if (!file) return;

    setUploading(true);
    setError("");
    setProof(null);
    setAnalysisStatus("Preparing proof...");

    try {
      const proofId = crypto.randomUUID();
      const storagePath = `uploads/${proofId}-${file.name}`;

      setAnalysisStatus("Extracting metadata...");

      const localAnalysis = await processProof(file);

      setAnalysisStatus("Uploading file...");

      const { error: uploadError } = await supabase.storage
        .from("proofs")
        .upload(storagePath, file);

      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage
        .from("proofs")
        .getPublicUrl(storagePath);

      setAnalysisStatus("Creating proof record...");

      const { error: insertError } = await supabase.from("proofs").insert({
        proof_id: proofId,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        storage_path: storagePath,
        public_url: publicData.publicUrl,
        status: "uploaded",
        metadata: localAnalysis.metadata || {},
      });

      if (insertError) throw insertError;

      setAnalysisStatus("Running AI authenticity analysis...");

      const analyzeResponse = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          proofId,
          fileName: file.name,
          fileType: file.type,
          publicUrl: publicData.publicUrl,
          metadata: localAnalysis.metadata || {},
        }),
      });

      if (!analyzeResponse.ok) {
        console.warn("AI analysis failed, but proof was created.");
        setAnalysisStatus("Proof created. AI analysis pending.");
      } else {
        setAnalysisStatus("Proof analyzed successfully.");
      }

      setProof(proofId);
    } catch (err) {
      setError(err.message || "Upload failed");
      setAnalysisStatus("");
    }

    setUploading(false);
  }

  return (
    <main
      style={{
        padding: 24,
        maxWidth: 760,
        margin: "0 auto",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1>ProofOrigin</h1>

      <p>
        Upload digital content, extract forensic metadata, run AI authenticity
        analysis, and generate a public verification record.
      </p>

      <div
        style={{
          border: "2px dashed #666",
          borderRadius: 16,
          padding: 30,
          marginTop: 20,
        }}
      >
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
          {uploading ? "Processing Proof..." : "Generate Proof"}
        </button>

        {analysisStatus && (
          <p style={{ marginTop: 16 }}>
            <strong>Status:</strong> {analysisStatus}
          </p>
        )}
      </div>

      {proof && (
        <div
          style={{
            marginTop: 30,
            padding: 20,
            border: "1px solid #ddd",
            borderRadius: 14,
          }}
        >
          <h2>Proof Created</h2>

          <p>
            Your file has been uploaded, registered, and analyzed by
            ProofOrigin.
          </p>

          <a href={`/verify/${proof}`}>Open Verification Page</a>
        </div>
      )}

      {error && <p style={{ color: "red", marginTop: 20 }}>{error}</p>}
    </main>
  );
}

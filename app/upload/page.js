"use client";

import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function UploadPage() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [proof, setProof] = useState(null);
  const [error, setError] = useState("");

  async function handleUpload() {
    if (!file) return;

    setUploading(true);
    setError("");
    setProof(null);

    try {
      const proofId = crypto.randomUUID();
      const storagePath = `uploads/${proofId}-${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("proofs")
        .upload(storagePath, file);

      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage
        .from("proofs")
        .getPublicUrl(storagePath);

      const { error: insertError } = await supabase.from("proofs").insert({
        proof_id: proofId,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        storage_path: storagePath,
        public_url: publicData.publicUrl,
        status: "uploaded",
      });

      if (insertError) throw insertError;

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
        }),
      });

      if (!analyzeResponse.ok) {
        console.warn("AI analysis failed, but proof was created.");
      }

      setProof(proofId);
    } catch (err) {
      setError(err.message || "Upload failed");
    }

    setUploading(false);
  }

  return (
    <main
      style={{
        padding: 24,
        maxWidth: 700,
        margin: "0 auto",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1>ProofOrigin</h1>

      <p>
        Prove what's real. Upload digital content and generate a verification
        proof.
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
          {uploading ? "Uploading + Analyzing..." : "Generate Proof"}
        </button>
      </div>

      {proof && (
        <div style={{ marginTop: 30 }}>
          <h2>Proof Created</h2>

          <a href={`/verify/${proof}`}>Open Verification Page</a>
        </div>
      )}

      {error && <p style={{ color: "red", marginTop: 20 }}>{error}</p>}
    </main>
  );
}

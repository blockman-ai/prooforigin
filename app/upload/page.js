"use client";

import { useState } from "react";
import { supabase } from "../lib/supabase";
import { mapProofOriginProtocol } from "../lib/prooforiginProtocolMapper";

export default function UploadPage() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [proof, setProof] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  async function handleUpload() {
    if (!file) return;

    setUploading(true);
    setError("");
    setProof(null);
    setStatus("Creating proof record...");

    try {
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
        status: "uploaded",
        metadata: {},
      });

      if (insertError) throw insertError;

      setStatus("Running protocol evaluation...");

      const analyzeForm = new FormData();
      analyzeForm.append("file", file);
      analyzeForm.append("storage_path", storagePath);

      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        body: analyzeForm,
      });

      const analyzeData = await analyzeRes.json();

      if (!analyzeRes.ok || !analyzeData.success) {
        throw new Error(analyzeData.error || "Protocol evaluation failed.");
      }

      const protocol = mapProofOriginProtocol(analyzeData);

      setStatus("Updating proof record...");

      const { error: updateError } = await supabase
        .from("proofs")
        .update({
          status: "evaluated",
          metadata: {
            file_id: protocol.fileId ?? analyzeData.file_id ?? null,
            evidence_bundle_hash: protocol.evidenceBundleHash,
            public_label: protocol.publicLabel,
            decision_tier: protocol.decisionTier,
            protocol_version: protocol.protocolVersion,
            verification_notice: protocol.verificationNotice,
            claim_boundary: protocol.claimBoundary,
            truth_verified: protocol.truthVerified,
          },
        })
        .eq("proof_id", proofId);

      if (updateError) throw updateError;

      setStatus("Proof record complete.");
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

      {error && <p style={{ color: "red", marginTop: 20 }}>{error}</p>}
    </main>
  );
}

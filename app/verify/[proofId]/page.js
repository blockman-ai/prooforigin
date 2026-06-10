import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function getProtocolFields(proof) {
  const metadata =
    proof?.metadata && typeof proof.metadata === "object" ? proof.metadata : {};

  return {
    publicLabel: metadata.public_label || metadata.publicLabel || null,
    evidenceBundleHash:
      metadata.evidence_bundle_hash || metadata.evidenceBundleHash || null,
    decisionTier: metadata.decision_tier || metadata.decisionTier || null,
    protocolVersion:
      metadata.protocol_version || metadata.protocolVersion || null,
    fileId: metadata.file_id || metadata.fileId || null,
  };
}

export default async function VerifyPage({ params }) {
  const { proofId } = params;

  const { data: proof, error } = await supabase
    .from("proofs")
    .select("*")
    .eq("proof_id", proofId)
    .single();

  if (error || !proof) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Record Not Found</h1>
        <p>This protocol record does not exist.</p>
      </main>
    );
  }

  const protocol = getProtocolFields(proof);
  const isAnchored = Boolean(
    protocol.evidenceBundleHash && protocol.publicLabel
  );

  return (
    <main style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
      {isAnchored ? (
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            marginBottom: 24,
            border: "1px solid rgba(0,229,255,.35)",
            background: "rgba(0,229,255,.08)",
          }}
        >
          <h1 style={{ margin: 0, fontSize: 22 }}>
            Registered ProofOrigin Protocol Record Matched
          </h1>
          <p style={{ marginBottom: 0, marginTop: 8 }}>
            Structural protocol metadata is present for this upload record.
          </p>
        </div>
      ) : (
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            marginBottom: 24,
            border: "1px solid rgba(255,180,0,.35)",
            background: "rgba(255,180,0,.08)",
          }}
        >
          <h1 style={{ margin: 0, fontSize: 22 }}>
            Unanchored Protocol Record
          </h1>
          <p style={{ marginBottom: 0, marginTop: 8 }}>
            This upload is registered, but protocol anchoring fields are missing.
            No credential link should be inferred until evaluation metadata is
            complete.
          </p>
        </div>
      )}

      <p>
        <strong>Record ID:</strong> {proof.proof_id}
      </p>
      <p>
        <strong>File Name:</strong> {proof.file_name}
      </p>
      <p>
        <strong>File Type:</strong> {proof.file_type}
      </p>
      <p>
        <strong>Status:</strong> {proof.status}
      </p>
      <p>
        <strong>Created:</strong>{" "}
        {new Date(proof.created_at).toLocaleString()}
      </p>

      {isAnchored && (
        <>
          <p>
            <strong>Public Evaluation Label:</strong> {protocol.publicLabel}
          </p>
          {protocol.decisionTier && (
            <p>
              <strong>Decision Tier:</strong> {protocol.decisionTier}
            </p>
          )}
          <p style={{ wordBreak: "break-all" }}>
            <strong>Evidence Bundle Hash:</strong>{" "}
            {protocol.evidenceBundleHash}
          </p>
          {protocol.protocolVersion && (
            <p>
              <strong>Protocol Version:</strong> {protocol.protocolVersion}
            </p>
          )}
          {protocol.fileId && (
            <p>
              <strong>Backend File ID:</strong> {protocol.fileId}
            </p>
          )}
        </>
      )}

      {proof.public_url && proof.file_type?.startsWith("image/") && (
        <img
          src={proof.public_url}
          alt={proof.file_name}
          style={{ maxWidth: "100%", borderRadius: 16, marginTop: 20 }}
        />
      )}

      <hr style={{ margin: "30px 0" }} />

      <h2>Protocol Record Notice</h2>
      <p>
        This file has been uploaded and indexed under a ProofOrigin protocol
        record. This state does not verify absolute truth.
      </p>

      <p>
        <strong>Bitcoin anchoring:</strong> Coming soon
      </p>
      <p>
        <strong>Extended protocol evaluation:</strong>{" "}
        {proof.status === "evaluated" ? "Recorded in metadata" : "Pending"}
      </p>
    </main>
  );
}

import { getSupabase, isSupabaseConfigured } from "../../lib/supabase";

function getProtocolFields(proof) {
  const metadata =
    proof?.metadata && typeof proof.metadata === "object" ? proof.metadata : {};

  const publicLabel = metadata.public_label || metadata.publicLabel || null;
  const evidenceBundleHash =
    metadata.evidence_bundle_hash || metadata.evidenceBundleHash || null;
  const hasStoredProtocol = Boolean(publicLabel || evidenceBundleHash);

  return {
    hasStoredProtocol,
    publicLabel,
    evidenceBundleHash,
    decisionTier: metadata.decision_tier || metadata.decisionTier || null,
    protocolName: metadata.protocol_name || metadata.protocolName || null,
    protocolVersion: metadata.protocol_version || metadata.protocolVersion || null,
    fileId: metadata.file_id || metadata.fileId || null,
    verifiedScope: metadata.verified_scope || metadata.verifiedScope || null,
    truthVerified:
      metadata.truth_verified === true || metadata.truthVerified === true,
    verificationNotice:
      metadata.verification_notice || metadata.verificationNotice || null,
    claimBoundary: metadata.claim_boundary || metadata.claimBoundary || null,
  };
}

export default async function VerifyPage({ params }) {
  const { proofId } = params;

  if (!isSupabaseConfigured()) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Configuration Required</h1>
        <p>Supabase environment variables are not configured.</p>
      </main>
    );
  }

  const supabase = getSupabase();
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
    protocol.hasStoredProtocol &&
      protocol.evidenceBundleHash &&
      protocol.publicLabel
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

      {protocol.hasStoredProtocol && (
        <>
          <h2 style={{ marginTop: 24 }}>Protocol Evaluation Metadata</h2>
          <p style={{ marginTop: 0 }}>
            This section records protocol-scoped analysis metadata. It does not
            verify absolute truth.
          </p>

          {protocol.publicLabel && (
            <p>
              <strong>Public Evaluation Label:</strong> {protocol.publicLabel}
            </p>
          )}
          {protocol.decisionTier && (
            <p>
              <strong>Decision Tier:</strong> {protocol.decisionTier}
            </p>
          )}
          {protocol.evidenceBundleHash && (
            <p style={{ wordBreak: "break-all" }}>
              <strong>Evidence Bundle Hash:</strong>{" "}
              {protocol.evidenceBundleHash}
            </p>
          )}
          {protocol.verifiedScope && (
            <p>
              <strong>Verified Scope:</strong> {protocol.verifiedScope}
            </p>
          )}
          <p>
            <strong>Truth Verified:</strong>{" "}
            {protocol.truthVerified === true
              ? "Yes"
              : "No — does not verify absolute truth"}
          </p>
          {protocol.protocolName && (
            <p>
              <strong>Protocol Name:</strong> {protocol.protocolName}
            </p>
          )}
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
          {protocol.verificationNotice && (
            <p>
              <strong>Verification Notice:</strong> {protocol.verificationNotice}
            </p>
          )}
          {protocol.claimBoundary && (
            <p>
              <strong>Claim Boundary:</strong> {protocol.claimBoundary}
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

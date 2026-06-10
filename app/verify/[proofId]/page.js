import GlassPanel from "../../../components/protocol/GlassPanel";
import PageShell from "../../../components/protocol/PageShell";
import ProofField from "../../../components/protocol/ProofField";
import ProtocolBadge from "../../../components/protocol/ProtocolBadge";
import StatusCard from "../../../components/protocol/StatusCard";
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

function getStatusBadge(proof, isAnchored) {
  if (isAnchored) return { label: "Evaluated", variant: "success" };
  if (proof.status === "evaluated") return { label: "Evaluated", variant: "success" };
  if (proof.status === "uploaded") return { label: "Pending evaluation", variant: "pending" };
  return { label: "Unanchored", variant: "warning" };
}

export default async function VerifyPage({ params }) {
  const { proofId } = params;

  if (!isSupabaseConfigured()) {
    return (
      <PageShell
        narrow
        badge="Configuration"
        title="Configuration Required"
        subtitle="Supabase environment variables are not configured."
      />
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
      <PageShell
        narrow
        badge="Protocol Record"
        title="Record Not Found"
        subtitle="This protocol record does not exist."
      />
    );
  }

  const protocol = getProtocolFields(proof);
  const isAnchored = Boolean(
    protocol.hasStoredProtocol &&
      protocol.evidenceBundleHash &&
      protocol.publicLabel
  );
  const statusBadge = getStatusBadge(proof, isAnchored);

  return (
    <PageShell
      narrow
      heroAlign="left"
      badge="Protocol Record"
      title={proof.file_name || "Proof Record"}
      subtitle="A protocol-scoped upload record. This does not verify absolute truth."
    >
      <div className="record-header">
        <div className="record-header__badges">
          <ProtocolBadge variant={statusBadge.variant}>
            {statusBadge.label}
          </ProtocolBadge>
          {isAnchored ? (
            <ProtocolBadge variant="success">Anchored metadata</ProtocolBadge>
          ) : (
            <ProtocolBadge variant="warning">Unanchored</ProtocolBadge>
          )}
        </div>
      </div>

      <StatusCard variant={isAnchored ? "anchored" : "unanchored"} />

      {proof.public_url && proof.file_type?.startsWith("image/") && (
        <div className="image-frame">
          <img src={proof.public_url} alt={proof.file_name} />
        </div>
      )}

      <GlassPanel title="Record Details">
        <div className="proof-grid">
          <ProofField label="Record ID" value={proof.proof_id} mono />
          <ProofField label="File Name" value={proof.file_name} />
          <ProofField label="File Type" value={proof.file_type} />
          <ProofField label="Status" value={proof.status} />
          <ProofField
            label="Created"
            value={new Date(proof.created_at).toLocaleString()}
          />
          <ProofField label="Storage Path" value={proof.storage_path} mono />
        </div>
      </GlassPanel>

      {protocol.hasStoredProtocol && (
        <GlassPanel
          title="Protocol Evaluation Metadata"
          subtitle="Protocol-scoped analysis metadata. This does not verify absolute truth."
        >
          <div className="proof-grid">
            <ProofField label="Public Evaluation Label" value={protocol.publicLabel} />
            <ProofField label="Decision Tier" value={protocol.decisionTier} />
            <ProofField
              label="Evidence Bundle Hash"
              value={protocol.evidenceBundleHash}
              mono
            />
            <ProofField label="Verified Scope" value={protocol.verifiedScope} />
            <ProofField
              label="Truth Verified"
              value={
                protocol.truthVerified === true
                  ? "Yes"
                  : "No — does not verify absolute truth"
              }
            />
            <ProofField label="Protocol Name" value={protocol.protocolName} />
            <ProofField label="Protocol Version" value={protocol.protocolVersion} />
            <ProofField label="Backend File ID" value={protocol.fileId} mono />
            <ProofField
              label="Verification Notice"
              value={protocol.verificationNotice}
            />
            <ProofField label="Claim Boundary" value={protocol.claimBoundary} />
          </div>
        </GlassPanel>
      )}

      <GlassPanel title="Protocol Record Notice">
        <p style={{ margin: 0, color: "#c5d2e6", lineHeight: 1.55 }}>
          This file has been uploaded and indexed under a ProofOrigin protocol
          record. This state does not verify absolute truth.
        </p>
        <div className="proof-grid" style={{ marginTop: 18 }}>
          <ProofField label="Bitcoin anchoring" value="Coming soon" />
          <ProofField
            label="Extended protocol evaluation"
            value={
              proof.status === "evaluated"
                ? "Recorded in metadata"
                : "Pending"
            }
          />
        </div>
      </GlassPanel>
    </PageShell>
  );
}

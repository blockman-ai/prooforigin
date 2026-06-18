"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import GlassPanel from "../../../../components/protocol/GlassPanel";
import PageShell from "../../../../components/protocol/PageShell";
import ProofField from "../../../../components/protocol/ProofField";
import ProtocolBadge from "../../../../components/protocol/ProtocolBadge";
import StatusCard from "../../../../components/protocol/StatusCard";
import {
  describeAssetEvent,
  fetchPublicAssetVerification,
  formatAssetEventLabel,
  formatAssetStatusLabel,
  formatAssetTimestamp,
  formatAssetTypeLabel,
} from "../../../lib/assetRegistryClient";

function assetStatusBadgeVariant(status) {
  if (status === "registered" || status === "verified") return "success";
  if (status === "retired") return "warning";
  return "neutral";
}

export default function PublicAssetVerificationPage() {
  const params = useParams();
  const verificationSlug = String(params?.verification_slug || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadVerification() {
      setLoading(true);
      setError("");

      try {
        const result = await fetchPublicAssetVerification(verificationSlug);
        if (!result.ok || !result.data?.success) {
          throw new Error(
            result.data?.error || "This asset verification record could not be found."
          );
        }
        if (!cancelled) {
          setPayload(result.data);
        }
      } catch (err) {
        if (!cancelled) {
          setPayload(null);
          setError(err.message || "This asset verification record could not be found.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (verificationSlug) {
      loadVerification();
    }

    return () => {
      cancelled = true;
    };
  }, [verificationSlug]);

  const asset = payload?.asset || null;
  const provenance = payload?.provenance_record || null;
  const timeline = payload?.custody_timeline || [];
  const ownershipChain = payload?.ownership_chain || [];
  const verifiedTransferCount = Number(payload?.verified_transfer_count || 0);

  const statusCard = useMemo(() => {
    if (loading) return null;
    if (error) {
      return {
        title: "Verification unavailable",
        body: error,
        variant: "warning",
      };
    }
    if (asset?.asset_status === "retired") {
      return {
        title: "Asset retired",
        body: "This asset record exists, but the asset is marked retired.",
        variant: "warning",
      };
    }
    return {
      title: "Verification active",
      body: "This asset has a ProofOrigin registration record, provenance fingerprint, and custody timeline.",
      variant: "success",
    };
  }, [asset, error, loading]);

  return (
    <PageShell
      narrow
      badge="Asset Verification"
      title="ProofOrigin asset certificate"
      subtitle="A public proof page for a registered digital or physical asset."
    >
      {statusCard && (
        <StatusCard title={statusCard.title} variant={statusCard.variant}>
          {statusCard.body}
        </StatusCard>
      )}

      {loading && <GlassPanel title="Loading"><p>Loading asset verification…</p></GlassPanel>}

      {!loading && asset && (
        <>
          <GlassPanel title="Verified asset">
            <div className="asset-certificate">
              <div className="asset-certificate__image">
                {asset.primary_image_url ? (
                  <img src={asset.primary_image_url} alt={asset.display_name || "Verified asset"} />
                ) : (
                  <span>{formatAssetTypeLabel(asset.asset_type)}</span>
                )}
              </div>
              <div className="asset-certificate__body">
                <div className="asset-proof-hero__status">
                  <ProtocolBadge variant={assetStatusBadgeVariant(asset.asset_status)}>
                    {formatAssetStatusLabel(asset.asset_status)}
                  </ProtocolBadge>
                  <span>Protected since {formatAssetTimestamp(asset.created_at)}</span>
                </div>
                <h2>{asset.display_name || formatAssetTypeLabel(asset.asset_type)}</h2>
                <p>
                  {asset.public_summary ||
                    "This asset has a ProofOrigin provenance record and custody timeline."}
                </p>
                <div className="asset-certificate__facts">
                  <span>Type: {formatAssetTypeLabel(asset.asset_type)}</span>
                  <span>Status: {formatAssetStatusLabel(asset.asset_status)}</span>
                  <span>Verified at {formatAssetTimestamp(new Date().toISOString())}</span>
                </div>
              </div>
            </div>
          </GlassPanel>

          {ownershipChain.length > 0 && (
            <GlassPanel title="Ownership chain">
              <p className="asset-chain-summary">
                {verifiedTransferCount > 0
                  ? `${verifiedTransferCount} verified two-party custody transfer${
                      verifiedTransferCount === 1 ? "" : "s"
                    } recorded. Owners are shown as opaque labels — no identities are revealed.`
                  : "This asset has had a single recorded owner since registration. No transfers yet."}
              </p>
              <ol className="asset-chain-list">
                {ownershipChain.map((entry) => (
                  <li key={entry.claim_version} className={entry.is_current ? "is-current" : ""}>
                    <div className="asset-chain-node">
                      <strong>{entry.owner_label}</strong>
                      <code>{entry.owner_ref}</code>
                    </div>
                    <div className="asset-chain-meta">
                      <span>
                        {entry.verified_transfer ? "Verified transfer (2-party)" : "Registered owner"}
                      </span>
                      {entry.is_current && <span className="asset-chain-current">Current owner</span>}
                      <span>{formatAssetTimestamp(entry.created_at)}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </GlassPanel>
          )}

          <div className="asset-trust-grid">
            <GlassPanel title="What this proves">
              <ul className="asset-trust-list">
                <li>The asset was registered with ProofOrigin at the protected-since timestamp.</li>
                <li>The public image and claims are tied to a fingerprinted provenance record.</li>
                <li>The custody timeline shows lifecycle events recorded by ProofOrigin.</li>
                {verifiedTransferCount > 0 && (
                  <li>
                    Each ownership handoff was cryptographically co-signed by both parties (verified
                    transfer).
                  </li>
                )}
              </ul>
            </GlassPanel>
            <GlassPanel title="What this does not prove">
              <ul className="asset-trust-list">
                <li>It is not a legal title transfer, appraisal, or insurance valuation.</li>
                <li>It does not guarantee authenticity unless external appraiser evidence is added.</li>
                <li>Private serials and descriptors are not displayed on this public page.</li>
              </ul>
            </GlassPanel>
          </div>

          <GlassPanel title="Custody timeline">
            {timeline.length === 0 ? (
              <p>No custody events recorded yet.</p>
            ) : (
              <ol className="asset-timeline-list">
                {timeline.map((event) => (
                  <li key={event.event_id}>
                    <div>
                      <strong>{formatAssetEventLabel(event.event_type)}</strong>
                      <span>{formatAssetTimestamp(event.created_at)}</span>
                    </div>
                    <p>{describeAssetEvent(event.event_type)}</p>
                  </li>
                ))}
              </ol>
            )}
          </GlassPanel>

          <GlassPanel title="Technical details">
            <details className="asset-technical-details">
              <summary>Show fingerprints and hashes</summary>
              <div className="proof-grid">
                <ProofField label="Asset ID" value={asset.asset_id} />
                <ProofField label="Asset fingerprint" value={asset.asset_fingerprint} />
                <ProofField label="Provenance record hash" value={asset.provenance_record_hash} />
                <ProofField label="Evidence bundle hash" value={provenance?.evidence_bundle_hash || "—"} />
                <ProofField label="Provenance created" value={formatAssetTimestamp(provenance?.created_at)} />
              </div>
            </details>
          </GlassPanel>
        </>
      )}
    </PageShell>
  );
}

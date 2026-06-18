"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import GlassPanel from "../../../components/protocol/GlassPanel";
import PageShell from "../../../components/protocol/PageShell";
import ProofField from "../../../components/protocol/ProofField";
import ProtocolBadge from "../../../components/protocol/ProtocolBadge";
import {
  createAssetTransfer,
  describeAssetEvent,
  formatAssetEventLabel,
  formatAssetStatusLabel,
  formatAssetTimestamp,
  formatAssetTypeLabel,
  formatTransferStatusLabel,
  getRegisteredAsset,
  listAssetTransfers,
  revokeAssetTransfer,
  transferStatusBadgeVariant,
  transferTermsLabel,
} from "../../lib/assetRegistryClient";

function assetStatusBadgeVariant(status) {
  if (status === "registered" || status === "verified") return "success";
  if (status === "retired") return "warning";
  return "neutral";
}

function defaultTransferExpiry() {
  const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 16);
}

export default function AssetDetailPage() {
  const params = useParams();
  const assetId = String(params?.asset_id || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [asset, setAsset] = useState(null);
  const [provenance, setProvenance] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [ownershipChain, setOwnershipChain] = useState([]);
  const [transferForm, setTransferForm] = useState({
    recipient_challenge: "",
    transfer_terms: "custody_and_ownership",
    expires_at: defaultTransferExpiry(),
    transfer_message: "",
  });
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferError, setTransferError] = useState("");
  const [issuedHandle, setIssuedHandle] = useState(null);

  async function loadTransfers() {
    const result = await listAssetTransfers(assetId);
    if (result.ok && result.data?.success) {
      setTransfers(result.data.transfers || []);
      setOwnershipChain(result.data.ownership_chain || []);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadAsset() {
      setLoading(true);
      setError("");

      try {
        const result = await getRegisteredAsset(assetId);
        if (!result.ok) {
          throw new Error(result.data?.error || "Unable to load asset.");
        }
        if (!cancelled) {
          setAsset(result.data?.asset || null);
          setProvenance(result.data?.provenance_record || null);
          setTimeline(result.data?.custody_timeline || []);
        }
        await loadTransfers();
      } catch (err) {
        if (!cancelled) {
          setAsset(null);
          setProvenance(null);
          setTimeline([]);
          setError(err.message || "Unable to load asset.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (assetId) {
      loadAsset();
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId]);

  const pendingTransfer = transfers.find((transfer) => transfer.status === "pending") || null;

  async function onCreateTransfer(event) {
    event.preventDefault();
    setTransferBusy(true);
    setTransferError("");
    setIssuedHandle(null);

    try {
      const payload = {
        recipient_challenge: transferForm.recipient_challenge.trim(),
        transfer_terms: transferForm.transfer_terms,
      };
      if (transferForm.expires_at) {
        payload.expires_at = new Date(transferForm.expires_at).toISOString();
      }
      if (transferForm.transfer_message.trim()) {
        payload.transfer_message = transferForm.transfer_message.trim();
      }

      const result = await createAssetTransfer(assetId, payload);
      if (!result.ok || !result.data?.success) {
        throw new Error(result.data?.error || "Unable to create transfer offer.");
      }
      setIssuedHandle(result.data.transfer_handle || null);
      setTransferForm((prev) => ({ ...prev, recipient_challenge: "", transfer_message: "" }));
      await loadTransfers();
    } catch (err) {
      setTransferError(err.message || "Unable to create transfer offer.");
    } finally {
      setTransferBusy(false);
    }
  }

  async function onRevokeTransfer(transferId) {
    setTransferBusy(true);
    setTransferError("");
    try {
      const result = await revokeAssetTransfer(assetId, transferId);
      if (!result.ok || !result.data?.success) {
        throw new Error(result.data?.error || "Unable to revoke transfer.");
      }
      await loadTransfers();
    } catch (err) {
      setTransferError(err.message || "Unable to revoke transfer.");
    } finally {
      setTransferBusy(false);
    }
  }

  return (
    <PageShell
      narrow
      badge="Asset Registry"
      title={asset?.display_name || "Asset detail"}
      subtitle="Provenance record, custody timeline, and verification link."
    >
      {loading && <GlassPanel title="Loading"><p>Loading asset…</p></GlassPanel>}
      {!loading && error && (
        <GlassPanel title="Unable to load asset">
          <p className="form-error">{error}</p>
          <div className="protocol-actions">
            <Link href="/assets" className="secondary">Back to registry</Link>
          </div>
        </GlassPanel>
      )}

      {!loading && !error && asset && (
        <>
          <GlassPanel title="Asset proof">
            <div className="asset-proof-hero">
              <div className="asset-proof-hero__image">
                {asset.primary_image_url ? (
                  <img src={asset.primary_image_url} alt={asset.display_name || "Registered asset"} />
                ) : (
                  <span>{formatAssetTypeLabel(asset.asset_type)}</span>
                )}
              </div>
              <div className="asset-proof-hero__content">
                <div className="asset-proof-hero__status">
                  <ProtocolBadge variant={assetStatusBadgeVariant(asset.asset_status)}>
                    {formatAssetStatusLabel(asset.asset_status)}
                  </ProtocolBadge>
                  <span>Protected since {formatAssetTimestamp(asset.created_at)}</span>
                </div>
                <h2>{asset.display_name || formatAssetTypeLabel(asset.asset_type)}</h2>
                <p>{asset.public_summary || "This asset has a ProofOrigin provenance record and custody timeline."}</p>
                <div className="protocol-actions">
                  {asset.verification_url && (
                    <a href={asset.verification_url} className="primary" target="_blank" rel="noreferrer">
                      Open public proof page
                    </a>
                  )}
                  <Link href="/assets" className="secondary">Back to registry</Link>
                </div>
              </div>
            </div>
          </GlassPanel>

          <div className="asset-trust-grid">
            <GlassPanel title="What this proves">
              <ul className="asset-trust-list">
                <li>This asset was registered in ProofOrigin by a verified vault owner.</li>
                <li>The public image and claims are linked to a tamper-evident fingerprint.</li>
                <li>The custody timeline records lifecycle events from registration onward.</li>
              </ul>
            </GlassPanel>
            <GlassPanel title="What this does not prove">
              <ul className="asset-trust-list">
                <li>It is not an appraisal, insurance valuation, or government ownership record.</li>
                <li>It does not guarantee third-party authenticity unless external evidence is added.</li>
                <li>Private serials and descriptors are hashed, not shown publicly.</li>
              </ul>
            </GlassPanel>
          </div>

          <GlassPanel title="Transfer asset">
            <p className="asset-help">
              Offer this asset to another ProofOrigin owner. Share the one-time transfer link and the
              recipient secret separately. Custody moves only when the recipient accepts and signs.
            </p>

            {pendingTransfer ? (
              <div className="asset-transfer-pending">
                <div className="asset-transfer-pending__head">
                  <ProtocolBadge variant={transferStatusBadgeVariant(pendingTransfer.status)}>
                    {formatTransferStatusLabel(pendingTransfer.status)}
                  </ProtocolBadge>
                  <span>Expires {formatAssetTimestamp(pendingTransfer.expires_at)}</span>
                </div>
                <p>{transferTermsLabel(pendingTransfer.transfer_terms)}</p>
                <p className="asset-help">
                  A transfer is already pending for this asset. Revoke it to issue a new offer.
                </p>
                <div className="protocol-actions">
                  <button
                    type="button"
                    className="secondary"
                    disabled={transferBusy}
                    onClick={() => onRevokeTransfer(pendingTransfer.transfer_id)}
                  >
                    Revoke pending transfer
                  </button>
                </div>
              </div>
            ) : asset.retired_at ? (
              <p className="asset-help">Retired assets cannot be transferred.</p>
            ) : (
              <form className="asset-transfer-form" onSubmit={onCreateTransfer}>
                <label>
                  Recipient secret
                  <input
                    type="text"
                    value={transferForm.recipient_challenge}
                    minLength={16}
                    maxLength={256}
                    required
                    placeholder="A shared secret only the recipient knows (16+ chars)"
                    onChange={(e) =>
                      setTransferForm((prev) => ({ ...prev, recipient_challenge: e.target.value }))
                    }
                  />
                </label>
                <label>
                  What transfers
                  <select
                    value={transferForm.transfer_terms}
                    onChange={(e) =>
                      setTransferForm((prev) => ({ ...prev, transfer_terms: e.target.value }))
                    }
                  >
                    <option value="custody_and_ownership">Custody and ownership claim</option>
                    <option value="custody">Custody only</option>
                  </select>
                </label>
                <label>
                  Offer expires
                  <input
                    type="datetime-local"
                    value={transferForm.expires_at}
                    onChange={(e) =>
                      setTransferForm((prev) => ({ ...prev, expires_at: e.target.value }))
                    }
                  />
                </label>
                <label>
                  Note to recipient (optional)
                  <input
                    type="text"
                    value={transferForm.transfer_message}
                    maxLength={500}
                    placeholder="Stored as a hash only"
                    onChange={(e) =>
                      setTransferForm((prev) => ({ ...prev, transfer_message: e.target.value }))
                    }
                  />
                </label>
                <div className="protocol-actions">
                  <button type="submit" className="primary" disabled={transferBusy}>
                    {transferBusy ? "Creating offer…" : "Create transfer offer"}
                  </button>
                </div>
              </form>
            )}

            {transferError && <p className="form-error">{transferError}</p>}

            {issuedHandle && (
              <div className="asset-transfer-handle">
                <strong>Transfer link created</strong>
                <p className="asset-help">
                  Share this one-time link with the recipient (it is shown only once), then share the
                  recipient secret through a separate channel.
                </p>
                <code className="asset-transfer-handle__value">
                  {typeof window !== "undefined" ? `${window.location.origin}/assets/transfers?handle=${issuedHandle}` : issuedHandle}
                </code>
              </div>
            )}
          </GlassPanel>

          {ownershipChain.length > 0 && (
            <GlassPanel title="Ownership chain">
              <ol className="asset-chain-list">
                {ownershipChain.map((entry) => (
                  <li key={entry.claim_version} className={entry.is_current ? "is-current" : ""}>
                    <div className="asset-chain-node">
                      <strong>{entry.owner_label}</strong>
                      <code>{entry.owner_ref}</code>
                    </div>
                    <div className="asset-chain-meta">
                      <span>{entry.verified_transfer ? "Verified transfer (2-party)" : "Registered owner"}</span>
                      {entry.is_current && <span className="asset-chain-current">Current owner</span>}
                      <span>{formatAssetTimestamp(entry.created_at)}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </GlassPanel>
          )}

          {transfers.length > 0 && (
            <GlassPanel title="Transfer history">
              <ol className="asset-timeline-list">
                {transfers.map((transfer) => (
                  <li key={transfer.transfer_id}>
                    <div>
                      <strong>{formatTransferStatusLabel(transfer.status)}</strong>
                      <span>{formatAssetTimestamp(transfer.created_at)}</span>
                    </div>
                    <p>
                      {transferTermsLabel(transfer.transfer_terms)}
                      {transfer.transfer_receipt_id ? " · receipt issued" : ""}
                    </p>
                  </li>
                ))}
              </ol>
            </GlassPanel>
          )}

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
                <ProofField label="Image hash" value={asset.primary_image_hash || "—"} />
                <ProofField label="Verification URL" value={asset.verification_url} />
              </div>
            </details>
          </GlassPanel>

          <GlassPanel title="Provenance record">
            {provenance ? (
              <div className="proof-grid">
                <ProofField label="Provenance record ID" value={provenance.provenance_record_id} />
                <ProofField label="Provenance record hash" value={provenance.provenance_record_hash} />
                <ProofField label="Evidence bundle hash" value={provenance.evidence_bundle_hash || "—"} />
                <ProofField label="Owner claim hash" value={provenance.owner_claim_hash || "—"} />
                <ProofField label="Created" value={formatAssetTimestamp(provenance.created_at)} />
              </div>
            ) : (
              <p>No provenance record found.</p>
            )}
          </GlassPanel>
        </>
      )}
    </PageShell>
  );
}

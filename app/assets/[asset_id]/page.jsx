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

function timelineTone(eventType) {
  if (eventType === "registered") return "registered";
  if (eventType === "transfer_accepted" || eventType === "custody_transfer") return "transfer";
  if (eventType === "transfer_initiated") return "pending";
  if (
    eventType === "transfer_declined" ||
    eventType === "transfer_expired" ||
    eventType === "transfer_revoked" ||
    eventType === "retired"
  ) {
    return "warning";
  }
  return "neutral";
}

function timelineMarker(eventType) {
  if (eventType === "registered") return "R";
  if (eventType === "transfer_accepted" || eventType === "custody_transfer") return "T";
  if (eventType === "transfer_initiated") return "O";
  if (eventType === "verified") return "V";
  return "•";
}

function timelineLabel(eventType) {
  if (eventType === "registered") return "Registered";
  if (eventType === "transfer_accepted" || eventType === "custody_transfer") return "Transferred";
  if (eventType === "transfer_initiated") return "Transfer Offered";
  return formatAssetEventLabel(eventType);
}

function timelineDescription(eventType) {
  if (eventType === "registered") return "Certificate created and asset protected in ProofOrigin.";
  if (eventType === "transfer_initiated") return "Current custodian offered this asset to a recipient.";
  if (eventType === "transfer_accepted" || eventType === "custody_transfer") {
    return "Custody moved to a new owner and the ownership history was updated.";
  }
  if (eventType === "verified") return "Certificate status was confirmed.";
  return describeAssetEvent(eventType);
}

function ownershipLabel(entry, index) {
  if (entry.is_current) return "Current Custodian";
  return `Owner ${index + 1}`;
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
      badge="Collection"
      title={asset?.display_name || "Asset detail"}
      subtitle="Certificate, custody timeline, transfers, and provenance summary."
    >
      {loading && <GlassPanel title="Loading"><p>Loading asset…</p></GlassPanel>}
      {!loading && error && (
        <GlassPanel title="Unable to load asset">
          <p className="form-error">{error}</p>
          <div className="protocol-actions">
            <Link href="/assets" className="secondary">Back to Collection</Link>
          </div>
        </GlassPanel>
      )}

      {!loading && !error && asset && (
        <>
          <GlassPanel title="Asset certificate">
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
              </div>
            </div>
          </GlassPanel>

          <GlassPanel title="Custody Timeline" className="asset-flagship-panel">
            {timeline.length === 0 ? (
              <p>No custody events recorded yet.</p>
            ) : (
              <ol className="asset-timeline-stepper">
                {timeline.map((event) => (
                  <li
                    key={event.event_id}
                    className={`asset-timeline-stepper__item asset-timeline-stepper__item--${timelineTone(
                      event.event_type
                    )}`}
                  >
                    <span className="asset-timeline-stepper__marker" aria-hidden="true">
                      {timelineMarker(event.event_type)}
                    </span>
                    <div className="asset-timeline-stepper__content">
                      <div className="asset-timeline-stepper__head">
                        <strong>{timelineLabel(event.event_type)}</strong>
                        <span>{formatAssetTimestamp(event.created_at)}</span>
                      </div>
                      <p>{timelineDescription(event.event_type)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </GlassPanel>

          {ownershipChain.length > 0 && (
            <GlassPanel title="Ownership History">
              <ol className="asset-chain-list asset-chain-list--path">
                {ownershipChain.map((entry, index) => (
                  <li key={entry.claim_version} className={entry.is_current ? "is-current" : ""}>
                    <div className="asset-chain-node">
                      <strong>{ownershipLabel(entry, index)}</strong>
                    </div>
                    <div className="asset-chain-meta">
                      <span>{entry.verified_transfer ? "Transfer accepted" : "Registered owner"}</span>
                      {entry.is_current && <span className="asset-chain-current">Current Custodian</span>}
                      <span>{formatAssetTimestamp(entry.created_at)}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </GlassPanel>
          )}

          <GlassPanel title="Actions">
            <div className="protocol-actions">
              <a href="#transfer-asset" className="primary">
                Transfer
              </a>
              {asset.verification_url && (
                <>
                  <a href={asset.verification_url} className="secondary" target="_blank" rel="noreferrer">
                    View Certificate
                  </a>
                  <a href={asset.verification_url} className="secondary" target="_blank" rel="noreferrer">
                    Share Certificate
                  </a>
                </>
              )}
              <Link href="/assets" className="secondary">Back to Collection</Link>
            </div>
          </GlassPanel>

          <span id="transfer-asset" className="asset-section-anchor" aria-hidden="true" />
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
                    placeholder="Private note for the recipient"
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

          <GlassPanel title="Provenance summary">
            {provenance ? (
              <p className="asset-help">
                This certificate is backed by a private provenance record created on{" "}
                {formatAssetTimestamp(provenance.created_at)}.
              </p>
            ) : (
              <p>No provenance record found.</p>
            )}
          </GlassPanel>

          <GlassPanel title="Technical details">
            <details className="asset-technical-details">
              <summary>Show Technical Details</summary>
              <div className="proof-grid">
                <ProofField label="Asset ID" value={asset.asset_id} />
                <ProofField label="Asset fingerprint" value={asset.asset_fingerprint} />
                <ProofField label="Provenance record hash" value={asset.provenance_record_hash} />
                <ProofField label="Image hash" value={asset.primary_image_hash || "—"} />
                <ProofField label="Verification URL" value={asset.verification_url} />
                <ProofField label="Provenance record ID" value={provenance?.provenance_record_id || "—"} />
                <ProofField label="Evidence bundle hash" value={provenance?.evidence_bundle_hash || "—"} />
                <ProofField label="Owner claim hash" value={provenance?.owner_claim_hash || "—"} />
                <ProofField
                  label="Custody event hashes"
                  value={timeline.map((event) => event.event_hash).filter(Boolean).join("\n") || "—"}
                />
              </div>
            </details>
          </GlassPanel>
        </>
      )}
    </PageShell>
  );
}

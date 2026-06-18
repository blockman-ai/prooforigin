"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import GlassPanel from "../../../components/protocol/GlassPanel";
import PageShell from "../../../components/protocol/PageShell";
import ProtocolBadge from "../../../components/protocol/ProtocolBadge";
import StatusCard from "../../../components/protocol/StatusCard";
import AssetImage from "../../../components/assets/AssetImage";
import {
  acceptIncomingTransfer,
  declineIncomingTransfer,
  formatAssetTimestamp,
  formatTransferStatusLabel,
  listIncomingTransfers,
  previewIncomingTransfer,
  transferStatusBadgeVariant,
  transferTermsLabel,
} from "../../lib/assetRegistryClient";
import { getAssetCategoryIdentity } from "../../lib/assetVisualIdentity";

export default function IncomingTransfersPage() {
  const [handle, setHandle] = useState("");
  const [secret, setSecret] = useState("");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [received, setReceived] = useState([]);

  function extractHandle(raw) {
    const value = String(raw || "").trim();
    if (!value) return "";
    try {
      const url = new URL(value);
      return url.searchParams.get("handle") || value;
    } catch {
      return value;
    }
  }

  async function loadReceived() {
    const result = await listIncomingTransfers();
    if (result.ok && result.data?.success) {
      setReceived(result.data.transfers || []);
    }
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const queryHandle = params.get("handle");
      if (queryHandle) {
        setHandle(queryHandle);
      }
    }
    loadReceived();
  }, []);

  async function onPreview(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    setPreview(null);
    try {
      const result = await previewIncomingTransfer(extractHandle(handle), secret.trim());
      if (!result.ok || !result.data?.success) {
        throw new Error(result.data?.error || "Unable to load this transfer.");
      }
      setPreview(result.data);
    } catch (err) {
      setError(err.message || "Unable to load this transfer.");
    } finally {
      setBusy(false);
    }
  }

  async function onAccept() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await acceptIncomingTransfer(extractHandle(handle), secret.trim());
      if (!result.ok || !result.data?.success) {
        throw new Error(result.data?.error || "Unable to accept this transfer.");
      }
      setNotice("Transfer accepted. Custody now reflects your collection and a transfer receipt was issued.");
      setPreview(null);
      setHandle("");
      setSecret("");
      await loadReceived();
    } catch (err) {
      setError(err.message || "Unable to accept this transfer.");
    } finally {
      setBusy(false);
    }
  }

  async function onDecline() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await declineIncomingTransfer(extractHandle(handle), secret.trim());
      if (!result.ok || !result.data?.success) {
        throw new Error(result.data?.error || "Unable to decline this transfer.");
      }
      setNotice("Transfer declined.");
      setPreview(null);
    } catch (err) {
      setError(err.message || "Unable to decline this transfer.");
    } finally {
      setBusy(false);
    }
  }

  const previewAsset = preview?.asset || null;
  const previewTransfer = preview?.transfer || null;
  const previewIdentity = previewAsset
    ? getAssetCategoryIdentity(previewAsset.asset_type)
    : null;
  const previewExpired = Boolean(preview?.expired);
  const previewPending = previewTransfer?.status === "pending";

  return (
    <PageShell
      narrow
      badge="Transfers"
      title="Incoming Transfers"
      subtitle="Review assets offered to you and accept custody when you are ready."
    >
      {notice && (
        <StatusCard title="Done" variant="success">
          {notice}
        </StatusCard>
      )}

      <GlassPanel title="Review a transfer offer">
        <p className="asset-help">
          Paste the transfer link and recipient secret the sender shared with you.
        </p>
        <form className="asset-transfer-form" onSubmit={onPreview}>
          <label>
            Transfer link or handle
            <input
              type="text"
              value={handle}
              required
              placeholder="https://…/assets/transfers?handle=… or the handle"
              onChange={(e) => setHandle(e.target.value)}
            />
          </label>
          <label>
            Recipient secret
            <input
              type="text"
              value={secret}
              required
              placeholder="The secret the sender shared with you"
              onChange={(e) => setSecret(e.target.value)}
            />
          </label>
          <div className="protocol-actions">
            <button type="submit" className="primary" disabled={busy}>
              {busy ? "Loading…" : "Review transfer"}
            </button>
          </div>
        </form>
        {error && <p className="form-error">{error}</p>}
      </GlassPanel>

      {preview && previewTransfer && (
        <GlassPanel title="Asset offered to you">
          <div className="asset-proof-hero">
            <div className="asset-proof-hero__image">
              {previewAsset?.primary_image_url ? (
                <AssetImage
                  src={previewAsset.primary_image_url}
                  alt={previewAsset.display_name || "Asset"}
                  imageClassName="asset-proof-hero__photo"
                  fallbackIcon={previewIdentity?.icon || "ASSET"}
                  fallbackLabel={previewAsset?.asset_type_label || "Asset"}
                  fill
                />
              ) : (
                <span>{previewAsset?.asset_type_label || "Asset"}</span>
              )}
            </div>
            <div className="asset-proof-hero__content">
              <div className="asset-proof-hero__status">
                <ProtocolBadge variant={transferStatusBadgeVariant(previewTransfer.status)}>
                  {formatTransferStatusLabel(previewTransfer.status)}
                </ProtocolBadge>
                <span>Expires {formatAssetTimestamp(previewTransfer.expires_at)}</span>
              </div>
              <h2>{previewAsset?.display_name || previewAsset?.asset_type_label || "Registered asset"}</h2>
              <p>{previewAsset?.public_summary || "Someone is offering to transfer this asset to you."}</p>
              <p className="asset-help">{transferTermsLabel(previewTransfer.transfer_terms)}</p>
              {previewPending && !previewExpired ? (
                <div className="protocol-actions">
                  <button type="button" className="primary" disabled={busy} onClick={onAccept}>
                    {busy ? "Accepting…" : "Accept transfer"}
                  </button>
                  <button type="button" className="secondary" disabled={busy} onClick={onDecline}>
                    Decline
                  </button>
                </div>
              ) : (
                <p className="asset-help">
                  This offer is {previewExpired ? "expired" : formatTransferStatusLabel(previewTransfer.status).toLowerCase()} and can no longer be accepted.
                </p>
              )}
            </div>
          </div>
        </GlassPanel>
      )}

      <GlassPanel title="Received assets">
        {received.length === 0 ? (
          <p>No accepted transfers yet.</p>
        ) : (
          <ol className="asset-timeline-list">
            {received.map((transfer) => (
              <li key={transfer.transfer_id}>
                <div>
                  <strong>{transfer.asset?.display_name || transfer.asset?.asset_type_label || "Asset"}</strong>
                  <span>{formatAssetTimestamp(transfer.accepted_at || transfer.created_at)}</span>
                </div>
                <p>
                  {formatTransferStatusLabel(transfer.status)}
                  {transfer.asset?.verification_url ? (
                    <>
                      {" · "}
                      <a href={transfer.asset.verification_url} target="_blank" rel="noreferrer">
                        certificate
                      </a>
                    </>
                  ) : null}
                </p>
              </li>
            ))}
          </ol>
        )}
        <div className="protocol-actions">
          <Link href="/assets" className="secondary">Back to Collection</Link>
        </div>
      </GlassPanel>
    </PageShell>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import GlassPanel from "../../components/protocol/GlassPanel";
import PageShell from "../../components/protocol/PageShell";
import ProtocolBadge from "../../components/protocol/ProtocolBadge";
import {
  formatAssetStatusLabel,
  formatAssetTimestamp,
  formatAssetTypeLabel,
  listRegisteredAssets,
  truncateAssetHash,
} from "../lib/assetRegistryClient";

function assetStatusBadgeVariant(status) {
  if (status === "registered" || status === "verified") return "success";
  if (status === "retired") return "warning";
  return "neutral";
}

export default function AssetRegistryPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [assets, setAssets] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function loadAssets() {
      setLoading(true);
      setError("");

      try {
        const result = await listRegisteredAssets();
        if (!result.ok) {
          throw new Error(result.data?.error || "Unable to load registered assets.");
        }
        if (!cancelled) {
          setAssets(result.data?.assets || []);
        }
      } catch (err) {
        if (!cancelled) {
          setAssets([]);
          setError(err.message || "Unable to load registered assets.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadAssets();
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(() => {
    const counts = assets.reduce((acc, asset) => {
      acc[asset.asset_type] = (acc[asset.asset_type] || 0) + 1;
      return acc;
    }, {});
    return {
      total: assets.length,
      types: Object.keys(counts).length,
    };
  }, [assets]);

  return (
    <PageShell
      badge="Asset Registry"
      title="Prove what you own. Share proof in one link."
      subtitle="Register PSA cards, photos, art, watches, documents, and memorabilia with a public verification page backed by provenance and custody history."
    >
      <div className="protocol-actions">
        <Link href="/assets/register" className="primary">
          Register asset
        </Link>
        <Link href="/assets/transfers" className="secondary">
          Incoming transfers
        </Link>
      </div>

      <GlassPanel title="Your collection">
        {loading && <p>Loading registered assets…</p>}
        {!loading && error && <p className="form-error">{error}</p>}
        {!loading && !error && (
          <>
            <div className="custody-summary-row">
              <span className="custody-pill custody-pill--neutral">Total: {summary.total}</span>
              <span className="custody-pill custody-pill--neutral">Types: {summary.types}</span>
            </div>

            {assets.length === 0 ? (
              <div className="asset-empty-state">
                <h3>Start with one asset</h3>
                <p>
                  Register a PSA card, document, photo, watch, or artwork. ProofOrigin creates a
                  protected-since timestamp, fingerprint, custody event, and verification page.
                </p>
                <Link href="/assets/register" className="primary">
                  Register your first asset
                </Link>
              </div>
            ) : (
              <div className="asset-collection-grid">
                {assets.map((asset) => (
                  <article key={asset.asset_id} className="asset-card">
                    <div className="asset-card__image">
                      {asset.primary_image_url ? (
                        <img src={asset.primary_image_url} alt={asset.display_name || "Registered asset"} />
                      ) : (
                        <span>{formatAssetTypeLabel(asset.asset_type)}</span>
                      )}
                    </div>
                    <div className="asset-card__body">
                      <div className="asset-card__header">
                        <div>
                          <h3>{asset.display_name || formatAssetTypeLabel(asset.asset_type)}</h3>
                          <p>{formatAssetTypeLabel(asset.asset_type)}</p>
                        </div>
                        <ProtocolBadge variant={assetStatusBadgeVariant(asset.asset_status)}>
                          {formatAssetStatusLabel(asset.asset_status)}
                        </ProtocolBadge>
                      </div>
                      <p className="asset-card__proof">
                        Protected since {formatAssetTimestamp(asset.created_at)}
                      </p>
                      <p className="asset-card__hash">
                        Fingerprint {truncateAssetHash(asset.asset_fingerprint)}
                      </p>
                    </div>
                    <div className="asset-card__actions">
                      <Link href={`/assets/${asset.asset_id}`} className="secondary">
                        View asset
                      </Link>
                      {asset.verification_url && (
                        <a href={asset.verification_url} className="secondary" target="_blank" rel="noreferrer">
                          Verification page
                        </a>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </GlassPanel>
    </PageShell>
  );
}

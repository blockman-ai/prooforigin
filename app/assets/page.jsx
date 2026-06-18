"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import GlassPanel from "../../components/protocol/GlassPanel";
import PageShell from "../../components/protocol/PageShell";
import ProtocolBadge from "../../components/protocol/ProtocolBadge";
import AssetImage from "../../components/assets/AssetImage";
import {
  formatAssetStatusLabel,
  formatAssetTimestamp,
  formatAssetTypeLabel,
  listRegisteredAssets,
} from "../lib/assetRegistryClient";
import {
  assetCategoryClass,
  COLLECTION_ONBOARDING_TYPES,
  getAssetCategoryIdentity,
} from "../lib/assetVisualIdentity";

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
      badge="Collection"
      title="My Collection"
      subtitle="Your protected assets, certificates, and custody history in one premium vault view."
    >
      <div className="collection-toolbar">
        <div className="collection-toolbar__stats">
          <div className="collection-stat">
            <span className="collection-stat__value">{summary.total}</span>
            <span className="collection-stat__label">Assets protected</span>
          </div>
          <div className="collection-stat">
            <span className="collection-stat__value">{summary.types}</span>
            <span className="collection-stat__label">Categories</span>
          </div>
        </div>
        <div className="protocol-actions collection-toolbar__actions">
          <Link href="/assets/register" className="primary">
            Register Asset
          </Link>
          <Link href="/assets/transfers" className="secondary">
            Transfers
          </Link>
        </div>
      </div>

      <GlassPanel title="Registered assets" className="glass-panel--premium">
        {loading && <p className="collection-loading">Loading your collection…</p>}
        {!loading && error && <p className="form-error">{error}</p>}
        {!loading && !error && (
          <>
            {assets.length === 0 ? (
              <div className="collection-empty collection-empty--premium">
                <div className="collection-empty__hero">
                  <p className="collection-empty__eyebrow">Your vault is ready</p>
                  <h3>Protect your first valuable asset</h3>
                  <p>
                    Register a graded card, artwork, memorabilia, or document. ProofOrigin creates a
                    certificate with provenance, protected-since history, and a custody timeline you
                    can share in one link.
                  </p>
                  <Link href="/assets/register" className="primary">
                    Register your first asset
                  </Link>
                </div>
                <div className="collection-empty__categories" aria-label="Suggested asset categories">
                  {COLLECTION_ONBOARDING_TYPES.map((type) => {
                    const identity = getAssetCategoryIdentity(type);
                    return (
                      <Link
                        key={type}
                        href="/assets/register"
                        className={`collection-empty__category ${assetCategoryClass(type)}`}
                        style={{
                          "--asset-accent": identity.accent,
                          "--asset-glow": identity.glow,
                        }}
                      >
                        <span className="collection-empty__category-icon">{identity.icon}</span>
                        <strong>{formatAssetTypeLabel(type)}</strong>
                        <small>{identity.shortLabel}</small>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="asset-collection-grid asset-collection-grid--premium">
                {assets.map((asset, index) => {
                  const identity = getAssetCategoryIdentity(asset.asset_type);
                  return (
                    <article
                      key={asset.asset_id}
                      className={`asset-card asset-card--premium ${assetCategoryClass(asset.asset_type)}`}
                      style={{
                        "--asset-accent": identity.accent,
                        "--asset-glow": identity.glow,
                        "--card-delay": `${Math.min(index, 8) * 60}ms`,
                      }}
                    >
                      <Link href={`/assets/${asset.asset_id}`} className="asset-card__link">
                        <div className="asset-card__media">
                          {asset.primary_image_url ? (
                            <AssetImage
                              src={asset.primary_image_url}
                              alt={asset.display_name || "Registered asset"}
                              imageClassName="asset-card__photo"
                              fallbackIcon={identity.icon}
                              fallbackLabel={formatAssetTypeLabel(asset.asset_type)}
                              fill
                            />
                          ) : (
                            <div className="asset-card__placeholder">
                              <span className="asset-card__placeholder-icon">{identity.icon}</span>
                              <span>{formatAssetTypeLabel(asset.asset_type)}</span>
                            </div>
                          )}
                          <div className="asset-card__overlay" aria-hidden="true" />
                          <span className="asset-category-pill asset-card__category">
                            {identity.shortLabel}
                          </span>
                          <ProtocolBadge
                            className="asset-card__status"
                            variant={assetStatusBadgeVariant(asset.asset_status)}
                          >
                            {formatAssetStatusLabel(asset.asset_status)}
                          </ProtocolBadge>
                        </div>
                        <div className="asset-card__body">
                          <h3>{asset.display_name || formatAssetTypeLabel(asset.asset_type)}</h3>
                          <p className="asset-card__meta">
                            Protected since {formatAssetTimestamp(asset.created_at)}
                          </p>
                        </div>
                      </Link>
                      <div className="asset-card__actions">
                        <Link href={`/assets/${asset.asset_id}`} className="secondary">
                          View asset
                        </Link>
                        {asset.verification_url && (
                          <a
                            href={asset.verification_url}
                            className="secondary"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Certificate
                          </a>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </GlassPanel>
    </PageShell>
  );
}

"use client";

import ProtocolBadge from "../protocol/ProtocolBadge";
import AssetImage from "./AssetImage";
import {
  assetCategoryClass,
  getAssetCategoryIdentity,
} from "../../app/lib/assetVisualIdentity";
import {
  formatAssetStatusLabel,
  formatAssetTimestamp,
  formatAssetTypeLabel,
} from "../../app/lib/assetRegistryClient";

export default function AssetCertificateHero({
  asset,
  statusBadgeVariant = "success",
  statusLabel,
  verificationLabel = "Verification active",
  className = "",
}) {
  const identity = getAssetCategoryIdentity(asset.asset_type);
  const categoryClass = assetCategoryClass(asset.asset_type);

  return (
    <div
      className={`asset-certificate asset-certificate--museum asset-certificate--flagship ${categoryClass} ${className}`.trim()}
      style={{
        "--asset-accent": identity.accent,
        "--asset-glow": identity.glow,
      }}
    >
      <div className="asset-certificate__frame">
        <div className="asset-certificate__mat">
          <div className="asset-certificate__image">
            {asset.primary_image_url ? (
              <AssetImage
                src={asset.primary_image_url}
                alt={asset.display_name || "Verified asset"}
                imageClassName="asset-certificate__photo"
                fallbackIcon={identity.icon}
                fallbackLabel={formatAssetTypeLabel(asset.asset_type)}
                fill
              />
            ) : (
              <div className="asset-certificate__placeholder">
                <span className="asset-certificate__placeholder-icon">{identity.icon}</span>
                <span>{formatAssetTypeLabel(asset.asset_type)}</span>
              </div>
            )}
          </div>
        </div>
        <p className="asset-certificate__frame-label">ProofOrigin Certificate</p>
      </div>

      <div className="asset-certificate__placard">
        <div className="asset-certificate__placard-eyebrow">
          <span className="asset-category-pill">{identity.shortLabel}</span>
          <ProtocolBadge variant="success">ProofOrigin Certificate</ProtocolBadge>
          <ProtocolBadge variant={statusBadgeVariant}>
            {statusLabel || formatAssetStatusLabel(asset.asset_status)}
          </ProtocolBadge>
        </div>
        <h2>{asset.display_name || formatAssetTypeLabel(asset.asset_type)}</h2>
        <p>
          {asset.public_summary ||
            "This asset has a ProofOrigin provenance record and custody timeline."}
        </p>
        <div className="asset-certificate__facts">
          <span>Type: {formatAssetTypeLabel(asset.asset_type)}</span>
          <span>Status: {formatAssetStatusLabel(asset.asset_status)}</span>
          <span>Protected since {formatAssetTimestamp(asset.created_at)}</span>
          <span>{verificationLabel}</span>
        </div>
      </div>
    </div>
  );
}

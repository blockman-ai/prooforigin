/** Presentation-only category identities for asset UI surfaces. */

export const ASSET_CATEGORY_IDENTITY = {
  psa_card: {
    slug: "psa",
    shortLabel: "Graded Card",
    icon: "PSA",
    accent: "#c9a227",
    glow: "rgba(201, 162, 39, 0.24)",
  },
  memorabilia: {
    slug: "memorabilia",
    shortLabel: "Memorabilia",
    icon: "MEM",
    accent: "#d4846a",
    glow: "rgba(212, 132, 106, 0.22)",
  },
  artwork: {
    slug: "artwork",
    shortLabel: "Artwork",
    icon: "ART",
    accent: "#a78bcc",
    glow: "rgba(167, 139, 204, 0.22)",
  },
  document: {
    slug: "document",
    shortLabel: "Document",
    icon: "DOC",
    accent: "#7eb8d4",
    glow: "rgba(126, 184, 212, 0.2)",
  },
  photo: {
    slug: "photo",
    shortLabel: "Photo",
    icon: "IMG",
    accent: "#6ea8e8",
    glow: "rgba(110, 168, 232, 0.2)",
  },
  video: {
    slug: "video",
    shortLabel: "Video",
    icon: "VID",
    accent: "#8b9fd4",
    glow: "rgba(139, 159, 212, 0.2)",
  },
  audio: {
    slug: "audio",
    shortLabel: "Audio",
    icon: "AUD",
    accent: "#7dc4b5",
    glow: "rgba(125, 196, 181, 0.2)",
  },
  certificate: {
    slug: "certificate",
    shortLabel: "Certificate",
    icon: "CERT",
    accent: "#c9a227",
    glow: "rgba(201, 162, 39, 0.2)",
  },
  watch: {
    slug: "watch",
    shortLabel: "Timepiece",
    icon: "TIME",
    accent: "#b8a088",
    glow: "rgba(184, 160, 136, 0.2)",
  },
  collectible: {
    slug: "collectible",
    shortLabel: "Collectible",
    icon: "COL",
    accent: "#9b87c4",
    glow: "rgba(155, 135, 196, 0.2)",
  },
  other: {
    slug: "other",
    shortLabel: "Asset",
    icon: "ASSET",
    accent: "#94a3b8",
    glow: "rgba(148, 163, 184, 0.16)",
  },
};

export const COLLECTION_ONBOARDING_TYPES = ["psa_card", "memorabilia", "artwork", "document"];

export function getAssetCategoryIdentity(assetType) {
  return ASSET_CATEGORY_IDENTITY[assetType] || ASSET_CATEGORY_IDENTITY.other;
}

export function assetCategoryClass(assetType) {
  return `asset-identity--${getAssetCategoryIdentity(assetType).slug}`;
}

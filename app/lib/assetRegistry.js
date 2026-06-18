import crypto from "crypto";
import { generateDisclosureToken } from "./vaultDisclosureGrant.js";

export const ASSET_REGISTRY_PROTOCOL_VERSION = "prooforigin-asset-registry-v1";

export const ASSET_TYPE_DOCUMENT = "document";
export const ASSET_TYPE_PHOTO = "photo";
export const ASSET_TYPE_VIDEO = "video";
export const ASSET_TYPE_AUDIO = "audio";
export const ASSET_TYPE_ARTWORK = "artwork";
export const ASSET_TYPE_COLLECTIBLE = "collectible";
export const ASSET_TYPE_PSA_CARD = "psa_card";
export const ASSET_TYPE_MEMORABILIA = "memorabilia";
export const ASSET_TYPE_WATCH = "watch";
export const ASSET_TYPE_CERTIFICATE = "certificate";
export const ASSET_TYPE_OTHER = "other";

export const ASSET_TYPES = Object.freeze([
  ASSET_TYPE_DOCUMENT,
  ASSET_TYPE_PHOTO,
  ASSET_TYPE_VIDEO,
  ASSET_TYPE_AUDIO,
  ASSET_TYPE_ARTWORK,
  ASSET_TYPE_COLLECTIBLE,
  ASSET_TYPE_PSA_CARD,
  ASSET_TYPE_MEMORABILIA,
  ASSET_TYPE_WATCH,
  ASSET_TYPE_CERTIFICATE,
  ASSET_TYPE_OTHER,
]);

export const ASSET_STATUS_REGISTERED = "registered";
export const ASSET_STATUS_VERIFIED = "verified";
export const ASSET_STATUS_DISCLOSED = "disclosed";
export const ASSET_STATUS_CUSTODY_TRANSFER = "custody_transfer";
export const ASSET_STATUS_OWNERSHIP_CLAIM_UPDATE = "ownership_claim_update";
export const ASSET_STATUS_RETIRED = "retired";

export const ASSET_VISIBILITY_PRIVATE = "private";
export const ASSET_VISIBILITY_VERIFICATION_PUBLIC = "verification_public";
export const ASSET_VISIBILITY_DISCLOSURE_ONLY = "disclosure_only";

export const ASSET_CUSTODY_EVENT_REGISTERED = "registered";
export const ASSET_CUSTODY_EVENT_VERIFIED = "verified";
export const ASSET_CUSTODY_EVENT_DISCLOSED = "disclosed";
export const ASSET_CUSTODY_EVENT_CUSTODY_TRANSFER = "custody_transfer";
export const ASSET_CUSTODY_EVENT_OWNERSHIP_CLAIM_UPDATE = "ownership_claim_update";
export const ASSET_CUSTODY_EVENT_RETIRED = "retired";

export const ASSET_CUSTODY_ACTOR_OWNER = "owner";
export const ASSET_CUSTODY_ACTOR_SYSTEM = "system";
export const ASSET_CUSTODY_ACTOR_RECIPIENT = "recipient";

export const ASSET_CUSTODY_RESULT_SUCCESS = "success";
export const ASSET_CUSTODY_RESULT_DENIED = "denied";

export const ASSET_EVENT_GENESIS_HASH = "0".repeat(64);

export const ASSET_VERIFICATION_PATH_PREFIX = "/verify/asset";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const IMAGE_DATA_URL_PATTERN = /^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=]+$/i;
const HTTPS_IMAGE_URL_PATTERN = /^https:\/\/[^\s]+$/i;
const MAX_PRIMARY_IMAGE_URL_LENGTH = 750_000;

const PHYSICAL_ASSET_TYPES = new Set([
  ASSET_TYPE_PSA_CARD,
  ASSET_TYPE_MEMORABILIA,
  ASSET_TYPE_WATCH,
  ASSET_TYPE_ARTWORK,
  ASSET_TYPE_COLLECTIBLE,
  ASSET_TYPE_OTHER,
]);

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

function normalizeRequiredString(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

function normalizeOptionalHash(value, name) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const normalized = String(value).trim().toLowerCase();
  if (!HASH_PATTERN.test(normalized)) {
    throw new Error(`${name} must be a 64-character hex hash.`);
  }
  return normalized;
}

function computeHash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function normalizePrimaryImageUrl(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const normalized = String(value).trim();
  if (normalized.length > MAX_PRIMARY_IMAGE_URL_LENGTH) {
    throw new Error("primary_image_url is too large.");
  }
  if (!IMAGE_DATA_URL_PATTERN.test(normalized) && !HTTPS_IMAGE_URL_PATTERN.test(normalized)) {
    throw new Error("primary_image_url must be an HTTPS image URL or data image URL.");
  }

  return normalized;
}

function parseJsonObject(bodyText) {
  const body = bodyText ? JSON.parse(bodyText) : {};
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Request body must be a JSON object.");
  }
  return body;
}

export function normalizeAssetType(value) {
  const normalized = normalizeRequiredString(value, "asset_type").toLowerCase();
  if (!ASSET_TYPES.includes(normalized)) {
    throw new Error(`asset_type must be one of: ${ASSET_TYPES.join(", ")}.`);
  }
  return normalized;
}

export function isPhysicalAssetType(assetType) {
  return PHYSICAL_ASSET_TYPES.has(assetType);
}

export function generateAssetId() {
  return crypto.randomUUID();
}

export function generateVerificationSlug() {
  return generateDisclosureToken(24);
}

export function buildAssetVerificationUrl(verificationSlug, origin = "") {
  const base = String(origin || "").replace(/\/$/, "");
  return `${base}${ASSET_VERIFICATION_PATH_PREFIX}/${verificationSlug}`;
}

export function computeOwnerClaimHash({ displayName = "", publicSummary = "" }) {
  const payload = [
    ASSET_REGISTRY_PROTOCOL_VERSION,
    String(displayName || ""),
    String(publicSummary || ""),
  ].join("\n");
  return computeHash(payload);
}

export function computeEvidenceBundleHash({
  vaultDocumentId = null,
  primaryEvidenceHash = null,
  primaryImageHash = null,
  serialOrCertHash = null,
  physicalDescriptorHash = null,
  metadataHash = null,
}) {
  const payload = [
    ASSET_REGISTRY_PROTOCOL_VERSION,
    "evidence-bundle",
    String(vaultDocumentId || ""),
    String(primaryEvidenceHash || ""),
    String(primaryImageHash || ""),
    String(serialOrCertHash || ""),
    String(physicalDescriptorHash || ""),
    String(metadataHash || ""),
  ].join("\n");
  return computeHash(payload);
}

export function buildAssetProvenanceRecord({
  assetId,
  assetType,
  vaultRefHash,
  createdByDeviceRef,
  evidenceBundleHash,
  ownerClaimHash,
  publicClaims = {},
  createdAt,
}) {
  const provenanceRecordHash = computeProvenanceRecordHash({
    assetId,
    assetType,
    vaultRefHash,
    createdByDeviceRef,
    evidenceBundleHash,
    ownerClaimHash,
    publicClaims,
    createdAt,
  });

  return {
    asset_id: assetId,
    provenance_version: 1,
    vault_ref_hash: vaultRefHash,
    created_by_device_ref: createdByDeviceRef,
    asset_type: assetType,
    evidence_bundle_hash: evidenceBundleHash,
    owner_claim_hash: ownerClaimHash,
    public_claims: publicClaims,
    provenance_record_hash: provenanceRecordHash,
    created_at: createdAt,
  };
}

export function computeProvenanceRecordHash({
  assetId,
  assetType,
  vaultRefHash,
  createdByDeviceRef,
  evidenceBundleHash,
  ownerClaimHash,
  publicClaims = {},
  createdAt,
}) {
  const payload = [
    ASSET_REGISTRY_PROTOCOL_VERSION,
    "provenance-record",
    String(assetId || ""),
    String(assetType || ""),
    String(vaultRefHash || ""),
    String(createdByDeviceRef || ""),
    String(evidenceBundleHash || ""),
    String(ownerClaimHash || ""),
    stableStringify(publicClaims || {}),
    String(createdAt || ""),
  ].join("\n");

  return computeHash(payload);
}

export function computeAssetFingerprint({
  assetId,
  assetType,
  vaultRefHash,
  createdByDeviceRef,
  provenanceRecordHash,
  evidenceBundleHash,
  verificationSlug,
  visibility,
  createdAt,
}) {
  const payload = [
    ASSET_REGISTRY_PROTOCOL_VERSION,
    "asset-fingerprint",
    String(assetId || ""),
    String(assetType || ""),
    String(vaultRefHash || ""),
    String(createdByDeviceRef || ""),
    String(provenanceRecordHash || ""),
    String(evidenceBundleHash || ""),
    String(verificationSlug || ""),
    String(visibility || ASSET_VISIBILITY_VERIFICATION_PUBLIC),
    String(createdAt || ""),
  ].join("\n");

  return computeHash(payload);
}

export function computeAssetCustodyEventHash({
  assetId,
  eventType,
  actorType,
  result,
  vaultRefHash,
  deviceRefHash = "",
  previousEventHash = ASSET_EVENT_GENESIS_HASH,
  metadata = {},
  createdAt,
}) {
  const payload = [
    ASSET_REGISTRY_PROTOCOL_VERSION,
    "asset-custody-event",
    String(assetId || ""),
    String(eventType || ""),
    String(actorType || ""),
    String(result || ""),
    String(vaultRefHash || ""),
    String(deviceRefHash || ""),
    String(previousEventHash || ASSET_EVENT_GENESIS_HASH),
    stableStringify(metadata || {}),
    String(createdAt || ""),
  ].join("\n");

  return computeHash(payload);
}

export function buildAssetCustodyEventRecord({
  assetId,
  eventType,
  actorType,
  vaultRefHash,
  deviceRefHash = null,
  result = ASSET_CUSTODY_RESULT_SUCCESS,
  previousEventHash = ASSET_EVENT_GENESIS_HASH,
  metadata = {},
  relatedVaultDocumentId = null,
  relatedDisclosureGrantId = null,
  relatedReceiptId = null,
  relatedTransferId = null,
  createdAt = new Date().toISOString(),
}) {
  const eventHash = computeAssetCustodyEventHash({
    assetId,
    eventType,
    actorType,
    result,
    vaultRefHash,
    deviceRefHash: deviceRefHash || "",
    previousEventHash,
    metadata,
    createdAt,
  });

  return {
    asset_id: assetId,
    event_type: eventType,
    event_result: result,
    actor_type: actorType,
    vault_ref_hash: vaultRefHash,
    device_ref_hash: deviceRefHash,
    related_vault_document_id: relatedVaultDocumentId,
    related_disclosure_grant_id: relatedDisclosureGrantId,
    related_receipt_id: relatedReceiptId,
    related_transfer_id: relatedTransferId,
    previous_event_hash: previousEventHash,
    event_hash: eventHash,
    metadata_hash: metadata?.metadata_hash || null,
    metadata,
    created_at: createdAt,
  };
}

export function validateRegisterAssetInput(bodyText) {
  const body = parseJsonObject(bodyText);
  const assetType = normalizeAssetType(body.asset_type);
  const displayName =
    typeof body.display_name === "string" && body.display_name.trim()
      ? body.display_name.trim().slice(0, 120)
      : null;
  const publicSummary =
    typeof body.public_summary === "string" && body.public_summary.trim()
      ? body.public_summary.trim().slice(0, 500)
      : null;
  const visibility = String(body.visibility || ASSET_VISIBILITY_VERIFICATION_PUBLIC).trim();
  if (
    visibility !== ASSET_VISIBILITY_PRIVATE &&
    visibility !== ASSET_VISIBILITY_VERIFICATION_PUBLIC &&
    visibility !== ASSET_VISIBILITY_DISCLOSURE_ONLY
  ) {
    throw new Error("visibility must be private, verification_public, or disclosure_only.");
  }

  let vaultDocumentId = null;
  if (body.vault_document_id) {
    vaultDocumentId = normalizeRequiredString(body.vault_document_id, "vault_document_id").toLowerCase();
    if (!UUID_PATTERN.test(vaultDocumentId)) {
      throw new Error("vault_document_id must be a valid UUID.");
    }
  }

  const primaryEvidenceHash = normalizeOptionalHash(body.primary_evidence_hash, "primary_evidence_hash");
  const primaryImageUrl = normalizePrimaryImageUrl(body.primary_image_url);
  const primaryImageHash =
    normalizeOptionalHash(body.primary_image_hash, "primary_image_hash") ||
    (primaryImageUrl ? computeHash(primaryImageUrl) : null);
  const metadataHash = normalizeOptionalHash(body.metadata_hash, "metadata_hash");
  const physicalDescriptorHash = normalizeOptionalHash(
    body.physical_descriptor_hash,
    "physical_descriptor_hash"
  );
  const serialOrCertHash = normalizeOptionalHash(body.serial_or_cert_hash, "serial_or_cert_hash");

  if (
    isPhysicalAssetType(assetType) &&
    !physicalDescriptorHash &&
    !serialOrCertHash &&
    !primaryEvidenceHash &&
    !primaryImageHash
  ) {
    throw new Error(
      "Physical assets require at least one evidence hash or image: physical_descriptor_hash, serial_or_cert_hash, primary_image_url, or primary_evidence_hash."
    );
  }

  return {
    assetType,
    displayName,
    publicSummary,
    visibility,
    vaultDocumentId,
    primaryEvidenceHash,
    primaryImageUrl,
    primaryImageHash,
    metadataHash,
    physicalDescriptorHash,
    serialOrCertHash,
    publicClaims:
      publicSummary || displayName
        ? {
            ...(displayName ? { display_name: displayName } : {}),
            ...(publicSummary ? { public_summary: publicSummary } : {}),
          }
        : {},
  };
}

export function serializeOwnerAsset(asset) {
  if (!asset) return null;
  return {
    asset_id: asset.asset_id,
    asset_type: asset.asset_type,
    asset_status: asset.asset_status,
    display_name: asset.display_name,
    public_summary: asset.public_summary,
    primary_image_url: asset.primary_image_url,
    primary_image_hash: asset.primary_image_hash,
    asset_fingerprint: asset.asset_fingerprint,
    provenance_record_hash: asset.provenance_record_hash,
    verification_slug: asset.verification_slug,
    verification_url: asset.verification_url,
    visibility: asset.visibility,
    vault_document_id: asset.vault_document_id,
    created_at: asset.created_at,
    updated_at: asset.updated_at,
    retired_at: asset.retired_at,
  };
}

export function serializePublicAsset(asset) {
  if (!asset) return null;
  return {
    asset_id: asset.asset_id,
    asset_type: asset.asset_type,
    asset_status: asset.asset_status,
    display_name: asset.display_name,
    public_summary: asset.public_summary,
    primary_image_url: asset.primary_image_url,
    asset_fingerprint: asset.asset_fingerprint,
    provenance_record_hash: asset.provenance_record_hash,
    verification_url: asset.verification_url,
    created_at: asset.created_at,
    retired_at: asset.retired_at,
    public_claims: asset.public_claims || {},
  };
}

export function serializeAssetCustodyEvent(event) {
  if (!event) return null;
  return {
    event_id: event.event_id,
    event_type: event.event_type,
    event_result: event.event_result,
    actor_type: event.actor_type,
    event_hash: event.event_hash,
    previous_event_hash: event.previous_event_hash,
    created_at: event.created_at,
  };
}

export function formatAssetTypeLabel(assetType) {
  const labels = {
    document: "Document",
    photo: "Photo",
    video: "Video",
    audio: "Audio",
    artwork: "Artwork",
    collectible: "Collectible",
    psa_card: "PSA Card",
    memorabilia: "Memorabilia",
    watch: "Watch",
    certificate: "Certificate",
    other: "Other",
  };
  return labels[assetType] || assetType || "Asset";
}

export function formatAssetStatusLabel(status) {
  const labels = {
    registered: "Protected",
    verified: "Verified",
    disclosed: "Disclosed",
    custody_transfer: "Custody transfer",
    ownership_claim_update: "Ownership claim update",
    retired: "Retired",
  };
  return labels[status] || status || "Unknown";
}

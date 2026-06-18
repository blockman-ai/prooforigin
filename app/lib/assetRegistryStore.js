import crypto from "crypto";
import { createVaultAdminClient } from "./vaultAdmin.js";
import {
  ASSET_CUSTODY_ACTOR_OWNER,
  ASSET_CUSTODY_EVENT_REGISTERED,
  ASSET_CUSTODY_RESULT_SUCCESS,
  ASSET_EVENT_GENESIS_HASH,
  ASSET_STATUS_REGISTERED,
  ASSET_VISIBILITY_VERIFICATION_PUBLIC,
  buildAssetCustodyEventRecord,
  buildAssetProvenanceRecord,
  buildAssetVerificationUrl,
  computeAssetFingerprint,
  computeEvidenceBundleHash,
  computeOwnerClaimHash,
  generateAssetId,
  generateVerificationSlug,
} from "./assetRegistry.js";

export const REGISTERED_ASSETS_TABLE = "registered_assets";
export const ASSET_PROVENANCE_RECORDS_TABLE = "asset_provenance_records";
export const ASSET_CUSTODY_EVENTS_TABLE = "asset_custody_events";

function mapAsset(row, { origin = "" } = {}) {
  if (!row) return null;
  return {
    asset_id: row.asset_id,
    asset_type: row.asset_type,
    asset_status: row.asset_status,
    vault_ref_hash: row.vault_ref_hash,
    created_by_device_ref: row.created_by_device_ref,
    asset_fingerprint: row.asset_fingerprint,
    provenance_record_hash: row.provenance_record_hash,
    verification_slug: row.verification_slug,
    verification_url: buildAssetVerificationUrl(row.verification_slug, origin),
    visibility: row.visibility,
    display_name: row.display_name,
    public_summary: row.public_summary,
    primary_image_url: row.primary_image_url,
    primary_image_hash: row.primary_image_hash,
    vault_document_id: row.vault_document_id,
    primary_evidence_hash: row.primary_evidence_hash,
    metadata_hash: row.metadata_hash,
    physical_descriptor_hash: row.physical_descriptor_hash,
    serial_or_cert_hash: row.serial_or_cert_hash,
    created_at: row.created_at,
    updated_at: row.updated_at,
    retired_at: row.retired_at,
  };
}

function mapProvenance(row) {
  if (!row) return null;
  return {
    provenance_record_id: row.provenance_record_id,
    asset_id: row.asset_id,
    provenance_version: Number(row.provenance_version || 1),
    vault_ref_hash: row.vault_ref_hash,
    created_by_device_ref: row.created_by_device_ref,
    asset_type: row.asset_type,
    evidence_bundle_hash: row.evidence_bundle_hash,
    owner_claim_hash: row.owner_claim_hash,
    public_claims: row.public_claims || {},
    provenance_record_hash: row.provenance_record_hash,
    created_at: row.created_at,
  };
}

function mapCustodyEvent(row) {
  if (!row) return null;
  return {
    event_id: row.event_id,
    asset_id: row.asset_id,
    event_type: row.event_type,
    event_result: row.event_result,
    actor_type: row.actor_type,
    vault_ref_hash: row.vault_ref_hash,
    device_ref_hash: row.device_ref_hash,
    related_vault_document_id: row.related_vault_document_id,
    related_disclosure_grant_id: row.related_disclosure_grant_id,
    related_receipt_id: row.related_receipt_id,
    related_transfer_id: row.related_transfer_id,
    previous_event_hash: row.previous_event_hash,
    event_hash: row.event_hash,
    metadata_hash: row.metadata_hash,
    metadata: row.metadata || {},
    created_at: row.created_at,
  };
}

const ASSET_SELECT =
  "asset_id, asset_type, asset_status, vault_ref_hash, created_by_device_ref, asset_fingerprint, provenance_record_hash, verification_slug, visibility, display_name, public_summary, primary_image_url, primary_image_hash, vault_document_id, primary_evidence_hash, metadata_hash, physical_descriptor_hash, serial_or_cert_hash, created_at, updated_at, retired_at";

export async function getLatestAssetCustodyEventHash(assetId, { supabase = null } = {}) {
  const client = supabase ?? createVaultAdminClient();
  const { data, error } = await client
    .from(ASSET_CUSTODY_EVENTS_TABLE)
    .select("event_hash, created_at, event_id")
    .eq("asset_id", assetId)
    .order("created_at", { ascending: false })
    .order("event_id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { previousEventHash: ASSET_EVENT_GENESIS_HASH, error };
  }

  return {
    previousEventHash: data?.event_hash || ASSET_EVENT_GENESIS_HASH,
    error: null,
  };
}

export async function appendAssetCustodyEvent(eventRecord, { supabase = null } = {}) {
  const client = supabase ?? createVaultAdminClient();
  const { data, error } = await client
    .from(ASSET_CUSTODY_EVENTS_TABLE)
    .insert({
      asset_id: eventRecord.asset_id,
      event_type: eventRecord.event_type,
      event_result: eventRecord.event_result,
      actor_type: eventRecord.actor_type,
      vault_ref_hash: eventRecord.vault_ref_hash,
      device_ref_hash: eventRecord.device_ref_hash,
      related_vault_document_id: eventRecord.related_vault_document_id,
      related_disclosure_grant_id: eventRecord.related_disclosure_grant_id,
      related_receipt_id: eventRecord.related_receipt_id,
      related_transfer_id: eventRecord.related_transfer_id,
      previous_event_hash: eventRecord.previous_event_hash,
      event_hash: eventRecord.event_hash,
      metadata_hash: eventRecord.metadata_hash,
      metadata: eventRecord.metadata || {},
      created_at: eventRecord.created_at,
    })
    .select(
      "event_id, asset_id, event_type, event_result, actor_type, vault_ref_hash, device_ref_hash, related_vault_document_id, related_disclosure_grant_id, related_receipt_id, related_transfer_id, previous_event_hash, event_hash, metadata_hash, metadata, created_at"
    )
    .single();

  return { event: mapCustodyEvent(data), error };
}

export async function registerAssetRecord(
  {
    assetType,
    vaultRefHash,
    deviceRefHash,
    displayName = null,
    publicSummary = null,
    primaryImageUrl = null,
    primaryImageHash = null,
    visibility = ASSET_VISIBILITY_VERIFICATION_PUBLIC,
    vaultDocumentId = null,
    primaryEvidenceHash = null,
    metadataHash = null,
    physicalDescriptorHash = null,
    serialOrCertHash = null,
    publicClaims = {},
    origin = "",
  },
  { supabase = null } = {}
) {
  const client = supabase ?? createVaultAdminClient();
  const assetId = generateAssetId();
  const verificationSlug = generateVerificationSlug();
  const createdAt = new Date().toISOString();
  const ownerClaimHash = computeOwnerClaimHash({
    displayName: displayName || "",
    publicSummary: publicSummary || "",
  });
  const evidenceBundleHash = computeEvidenceBundleHash({
    vaultDocumentId,
    primaryEvidenceHash,
    primaryImageHash,
    serialOrCertHash,
    physicalDescriptorHash,
    metadataHash,
  });
  const provenanceDraft = buildAssetProvenanceRecord({
    assetId,
    assetType,
    vaultRefHash,
    createdByDeviceRef: deviceRefHash,
    evidenceBundleHash,
    ownerClaimHash,
    publicClaims,
    createdAt,
  });
  const assetFingerprint = computeAssetFingerprint({
    assetId,
    assetType,
    vaultRefHash,
    createdByDeviceRef: deviceRefHash,
    provenanceRecordHash: provenanceDraft.provenance_record_hash,
    evidenceBundleHash,
    verificationSlug,
    visibility,
    createdAt,
  });
  const custodyEvent = buildAssetCustodyEventRecord({
    assetId,
    eventType: ASSET_CUSTODY_EVENT_REGISTERED,
    actorType: ASSET_CUSTODY_ACTOR_OWNER,
    vaultRefHash,
    deviceRefHash,
    result: ASSET_CUSTODY_RESULT_SUCCESS,
    previousEventHash: ASSET_EVENT_GENESIS_HASH,
    relatedVaultDocumentId: vaultDocumentId,
    metadata: {
      asset_type: assetType,
      asset_fingerprint: assetFingerprint,
      provenance_record_hash: provenanceDraft.provenance_record_hash,
    },
    createdAt,
  });

  const assetInsert = {
    asset_id: assetId,
    asset_type: assetType,
    asset_status: ASSET_STATUS_REGISTERED,
    vault_ref_hash: vaultRefHash,
    created_by_device_ref: deviceRefHash,
    asset_fingerprint: assetFingerprint,
    provenance_record_hash: provenanceDraft.provenance_record_hash,
    verification_slug: verificationSlug,
    visibility,
    display_name: displayName,
    public_summary: publicSummary,
    primary_image_url: primaryImageUrl,
    primary_image_hash: primaryImageHash,
    vault_document_id: vaultDocumentId,
    primary_evidence_hash: primaryEvidenceHash,
    metadata_hash: metadataHash,
    physical_descriptor_hash: physicalDescriptorHash,
    serial_or_cert_hash: serialOrCertHash,
    created_at: createdAt,
    updated_at: createdAt,
    retired_at: null,
  };

  const { data: assetRow, error: assetError } = await client
    .from(REGISTERED_ASSETS_TABLE)
    .insert(assetInsert)
    .select(ASSET_SELECT)
    .single();

  if (assetError) {
    return { asset: null, provenance: null, event: null, error: assetError };
  }

  const { data: provenanceRow, error: provenanceError } = await client
    .from(ASSET_PROVENANCE_RECORDS_TABLE)
    .insert({
      asset_id: assetId,
      provenance_version: provenanceDraft.provenance_version,
      vault_ref_hash: vaultRefHash,
      created_by_device_ref: deviceRefHash,
      asset_type: assetType,
      evidence_bundle_hash: evidenceBundleHash,
      owner_claim_hash: ownerClaimHash,
      public_claims: publicClaims,
      provenance_record_hash: provenanceDraft.provenance_record_hash,
      created_at: createdAt,
    })
    .select(
      "provenance_record_id, asset_id, provenance_version, vault_ref_hash, created_by_device_ref, asset_type, evidence_bundle_hash, owner_claim_hash, public_claims, provenance_record_hash, created_at"
    )
    .single();

  if (provenanceError) {
    await client.from(REGISTERED_ASSETS_TABLE).delete().eq("asset_id", assetId);
    return { asset: null, provenance: null, event: null, error: provenanceError };
  }

  const { event, error: eventError } = await appendAssetCustodyEvent(custodyEvent, { supabase: client });
  if (eventError) {
    await client.from(ASSET_PROVENANCE_RECORDS_TABLE).delete().eq("asset_id", assetId);
    await client.from(REGISTERED_ASSETS_TABLE).delete().eq("asset_id", assetId);
    return { asset: null, provenance: null, event: null, error: eventError };
  }

  return {
    asset: mapAsset(assetRow, { origin }),
    provenance: mapProvenance(provenanceRow),
    event,
    error: null,
  };
}

export async function updateRegisteredAssetOwner(
  { assetId, vaultRefHash, assetStatus, updatedAt = new Date().toISOString() },
  { supabase = null } = {}
) {
  const client = supabase ?? createVaultAdminClient();
  const patch = { vault_ref_hash: vaultRefHash, updated_at: updatedAt };
  if (assetStatus) {
    patch.asset_status = assetStatus;
  }
  const { data, error } = await client
    .from(REGISTERED_ASSETS_TABLE)
    .update(patch)
    .eq("asset_id", assetId)
    .select(ASSET_SELECT)
    .maybeSingle();

  return { asset: mapAsset(data), error };
}

export async function listAssetRecordsByVaultRef(vaultRefHash, { origin = "", supabase = null } = {}) {
  const client = supabase ?? createVaultAdminClient();
  const { data, error } = await client
    .from(REGISTERED_ASSETS_TABLE)
    .select(ASSET_SELECT)
    .eq("vault_ref_hash", vaultRefHash)
    .order("created_at", { ascending: false });

  return {
    assets: (data || []).map((row) => mapAsset(row, { origin })),
    error,
  };
}

export async function getAssetRecordByIdForVault({
  assetId,
  vaultRefHash,
  origin = "",
  supabase = null,
}) {
  const client = supabase ?? createVaultAdminClient();
  const { data, error } = await client
    .from(REGISTERED_ASSETS_TABLE)
    .select(ASSET_SELECT)
    .eq("asset_id", assetId)
    .eq("vault_ref_hash", vaultRefHash)
    .maybeSingle();

  return { asset: mapAsset(data, { origin }), error };
}

export async function getAssetRecordById({ assetId, origin = "", supabase = null }) {
  const client = supabase ?? createVaultAdminClient();
  const { data, error } = await client
    .from(REGISTERED_ASSETS_TABLE)
    .select(ASSET_SELECT)
    .eq("asset_id", assetId)
    .maybeSingle();

  return { asset: mapAsset(data, { origin }), error };
}

export async function getAssetRecordByVerificationSlug(verificationSlug, { origin = "", supabase = null } = {}) {
  const client = supabase ?? createVaultAdminClient();
  const { data, error } = await client
    .from(REGISTERED_ASSETS_TABLE)
    .select(ASSET_SELECT)
    .eq("verification_slug", verificationSlug)
    .maybeSingle();

  if (error || !data) {
    return { asset: null, provenance: null, error };
  }

  const { data: provenanceRow, error: provenanceError } = await client
    .from(ASSET_PROVENANCE_RECORDS_TABLE)
    .select(
      "provenance_record_id, asset_id, provenance_version, vault_ref_hash, created_by_device_ref, asset_type, evidence_bundle_hash, owner_claim_hash, public_claims, provenance_record_hash, created_at"
    )
    .eq("asset_id", data.asset_id)
    .order("provenance_version", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    asset: mapAsset(data, { origin }),
    provenance: mapProvenance(provenanceRow),
    error: provenanceError,
  };
}

export async function listAssetCustodyEvents(assetId, { supabase = null } = {}) {
  const client = supabase ?? createVaultAdminClient();
  const { data, error } = await client
    .from(ASSET_CUSTODY_EVENTS_TABLE)
    .select(
      "event_id, asset_id, event_type, event_result, actor_type, vault_ref_hash, device_ref_hash, related_vault_document_id, related_disclosure_grant_id, related_receipt_id, related_transfer_id, previous_event_hash, event_hash, metadata_hash, metadata, created_at"
    )
    .eq("asset_id", assetId)
    .order("created_at", { ascending: true })
    .order("event_id", { ascending: true });

  return {
    events: (data || []).map(mapCustodyEvent),
    error,
  };
}

export async function getAssetProvenanceRecord(assetId, { supabase = null } = {}) {
  const client = supabase ?? createVaultAdminClient();
  const { data, error } = await client
    .from(ASSET_PROVENANCE_RECORDS_TABLE)
    .select(
      "provenance_record_id, asset_id, provenance_version, vault_ref_hash, created_by_device_ref, asset_type, evidence_bundle_hash, owner_claim_hash, public_claims, provenance_record_hash, created_at"
    )
    .eq("asset_id", assetId)
    .order("provenance_version", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { provenance: mapProvenance(data), error };
}

export function hashAssetMetadata(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

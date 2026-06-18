import crypto from "crypto";
import { createVaultAdminClient } from "./vaultAdmin.js";
import {
  ASSET_CUSTODY_ACTOR_OWNER,
  ASSET_CUSTODY_ACTOR_RECIPIENT,
  ASSET_CUSTODY_RESULT_SUCCESS,
  ASSET_STATUS_CUSTODY_TRANSFER,
  buildAssetCustodyEventRecord,
} from "./assetRegistry.js";
import {
  appendAssetCustodyEvent,
  getLatestAssetCustodyEventHash,
} from "./assetRegistryStore.js";
import {
  ASSET_OWNERSHIP_CLAIM_SOURCE_REGISTRATION,
  ASSET_OWNERSHIP_CLAIM_SOURCE_TRANSFER_ACCEPT,
  ASSET_OWNERSHIP_CLAIM_STATUS_CURRENT,
  ASSET_TRANSFER_EVENT_ACCEPTED,
  ASSET_TRANSFER_EVENT_DECLINED,
  ASSET_TRANSFER_EVENT_INITIATED,
  ASSET_TRANSFER_EVENT_REVOKED,
  ASSET_TRANSFER_STATUS_DECLINED,
  ASSET_TRANSFER_STATUS_PENDING,
  ASSET_TRANSFER_STATUS_REVOKED,
  buildTransferReceiptRecord,
  computeOwnershipClaimHash,
  generateTransferId,
} from "./assetTransfer.js";

export const ASSET_TRANSFERS_TABLE = "asset_transfers";
export const ASSET_OWNERSHIP_CLAIMS_TABLE = "asset_ownership_claims";

const ASSET_TRANSFER_ACCEPT_MAX_ATTEMPTS = 3;
const ASSET_TRANSFER_CHAIN_RETRY_DELAY_MS = 15;

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const TRANSFER_SELECT =
  "transfer_id, asset_id, from_vault_ref_hash, from_device_ref_hash, public_handle_hash, recipient_binding_hash, transfer_terms, transfer_terms_hash, status, expires_at, to_vault_ref_hash, to_device_ref_hash, previous_claim_id, new_claim_id, transfer_message_hash, acceptance_signature_hash, transfer_receipt_id, transfer_receipt_hash, custody_event_hash, provenance_record_hash, created_at, updated_at, accepted_at, declined_at, revoked_at";

const CLAIM_SELECT =
  "claim_id, asset_id, claim_version, claimant_vault_ref_hash, claim_source, transfer_ref, previous_claim_id, status, claim_hash, created_at";

function mapTransfer(row) {
  if (!row) return null;
  return {
    transfer_id: row.transfer_id,
    asset_id: row.asset_id,
    from_vault_ref_hash: row.from_vault_ref_hash,
    from_device_ref_hash: row.from_device_ref_hash,
    public_handle_hash: row.public_handle_hash,
    recipient_binding_hash: row.recipient_binding_hash,
    transfer_terms: row.transfer_terms,
    transfer_terms_hash: row.transfer_terms_hash,
    status: row.status,
    expires_at: row.expires_at,
    to_vault_ref_hash: row.to_vault_ref_hash || null,
    to_device_ref_hash: row.to_device_ref_hash || null,
    previous_claim_id: row.previous_claim_id || null,
    new_claim_id: row.new_claim_id || null,
    transfer_message_hash: row.transfer_message_hash || null,
    acceptance_signature_hash: row.acceptance_signature_hash || null,
    transfer_receipt_id: row.transfer_receipt_id || null,
    transfer_receipt_hash: row.transfer_receipt_hash || null,
    custody_event_hash: row.custody_event_hash || null,
    provenance_record_hash: row.provenance_record_hash || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    accepted_at: row.accepted_at || null,
    declined_at: row.declined_at || null,
    revoked_at: row.revoked_at || null,
  };
}

function mapClaim(row) {
  if (!row) return null;
  return {
    claim_id: row.claim_id,
    asset_id: row.asset_id,
    claim_version: Number(row.claim_version || 1),
    claimant_vault_ref_hash: row.claimant_vault_ref_hash,
    claim_source: row.claim_source,
    transfer_ref: row.transfer_ref || null,
    previous_claim_id: row.previous_claim_id || null,
    status: row.status,
    claim_hash: row.claim_hash,
    created_at: row.created_at,
  };
}

function mapEvent(row) {
  if (!row) return null;
  return {
    event_id: row.event_id,
    asset_id: row.asset_id,
    event_type: row.event_type,
    event_result: row.event_result,
    actor_type: row.actor_type,
    related_transfer_id: row.related_transfer_id || null,
    related_receipt_id: row.related_receipt_id || null,
    previous_event_hash: row.previous_event_hash,
    event_hash: row.event_hash,
    created_at: row.created_at,
  };
}

function isUniqueViolation(error) {
  if (!error) return false;
  return (
    error.code === "23505" ||
    String(error.message || error.details || "").toLowerCase().includes("duplicate key")
  );
}

export async function getTransferRecordByHandleHash(publicHandleHash, { supabase = null } = {}) {
  const client = supabase ?? createVaultAdminClient();
  const { data, error } = await client
    .from(ASSET_TRANSFERS_TABLE)
    .select(TRANSFER_SELECT)
    .eq("public_handle_hash", publicHandleHash)
    .maybeSingle();
  return { transfer: mapTransfer(data), error };
}

export async function getTransferRecordByIdForVault(
  { transferId, fromVaultRefHash },
  { supabase = null } = {}
) {
  const client = supabase ?? createVaultAdminClient();
  const { data, error } = await client
    .from(ASSET_TRANSFERS_TABLE)
    .select(TRANSFER_SELECT)
    .eq("transfer_id", transferId)
    .eq("from_vault_ref_hash", fromVaultRefHash)
    .maybeSingle();
  return { transfer: mapTransfer(data), error };
}

export async function getTransferRecordByReceiptId(receiptId, { supabase = null } = {}) {
  const client = supabase ?? createVaultAdminClient();
  const { data, error } = await client
    .from(ASSET_TRANSFERS_TABLE)
    .select(TRANSFER_SELECT)
    .eq("transfer_receipt_id", receiptId)
    .maybeSingle();
  return { transfer: mapTransfer(data), error };
}

export async function getPendingTransferForAsset(assetId, { supabase = null } = {}) {
  const client = supabase ?? createVaultAdminClient();
  const { data, error } = await client
    .from(ASSET_TRANSFERS_TABLE)
    .select(TRANSFER_SELECT)
    .eq("asset_id", assetId)
    .eq("status", ASSET_TRANSFER_STATUS_PENDING)
    .maybeSingle();
  return { transfer: mapTransfer(data), error };
}

export async function listTransfersForAsset(assetId, { supabase = null } = {}) {
  const client = supabase ?? createVaultAdminClient();
  const { data, error } = await client
    .from(ASSET_TRANSFERS_TABLE)
    .select(TRANSFER_SELECT)
    .eq("asset_id", assetId)
    .order("created_at", { ascending: false });
  return { transfers: (data || []).map(mapTransfer), error };
}

export async function listIncomingTransfersForVault(toVaultRefHash, { supabase = null } = {}) {
  const client = supabase ?? createVaultAdminClient();
  const { data, error } = await client
    .from(ASSET_TRANSFERS_TABLE)
    .select(TRANSFER_SELECT)
    .eq("to_vault_ref_hash", toVaultRefHash)
    .order("created_at", { ascending: false });
  return { transfers: (data || []).map(mapTransfer), error };
}

export async function listOwnershipClaimsForAsset(assetId, { supabase = null } = {}) {
  const client = supabase ?? createVaultAdminClient();
  const { data, error } = await client
    .from(ASSET_OWNERSHIP_CLAIMS_TABLE)
    .select(CLAIM_SELECT)
    .eq("asset_id", assetId)
    .order("claim_version", { ascending: true });
  return { claims: (data || []).map(mapClaim), error };
}

export async function getCurrentOwnershipClaim(assetId, { supabase = null } = {}) {
  const client = supabase ?? createVaultAdminClient();
  const { data, error } = await client
    .from(ASSET_OWNERSHIP_CLAIMS_TABLE)
    .select(CLAIM_SELECT)
    .eq("asset_id", assetId)
    .eq("status", ASSET_OWNERSHIP_CLAIM_STATUS_CURRENT)
    .maybeSingle();
  return { claim: mapClaim(data), error };
}

// Lazily anchors claim_version 1 (the registrant) so pre-transfer assets have a
// current ownership claim. Idempotent: races resolve to the existing current claim.
export async function ensureRegistrationClaim(asset, { supabase = null } = {}) {
  const client = supabase ?? createVaultAdminClient();
  const existing = await getCurrentOwnershipClaim(asset.asset_id, { supabase: client });
  if (existing.error) {
    return { claim: null, error: existing.error };
  }
  if (existing.claim) {
    return { claim: existing.claim, error: null };
  }

  const createdAt = asset.created_at || new Date().toISOString();
  const claimHash = computeOwnershipClaimHash({
    assetId: asset.asset_id,
    claimVersion: 1,
    claimantVaultRefHash: asset.vault_ref_hash,
    claimSource: ASSET_OWNERSHIP_CLAIM_SOURCE_REGISTRATION,
    transferRef: null,
    previousClaimId: null,
    createdAt,
  });

  const { data, error } = await client
    .from(ASSET_OWNERSHIP_CLAIMS_TABLE)
    .insert({
      asset_id: asset.asset_id,
      claim_version: 1,
      claimant_vault_ref_hash: asset.vault_ref_hash,
      claim_source: ASSET_OWNERSHIP_CLAIM_SOURCE_REGISTRATION,
      transfer_ref: null,
      previous_claim_id: null,
      status: ASSET_OWNERSHIP_CLAIM_STATUS_CURRENT,
      claim_hash: claimHash,
      created_at: createdAt,
    })
    .select(CLAIM_SELECT)
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      return getCurrentOwnershipClaim(asset.asset_id, { supabase: client });
    }
    return { claim: null, error };
  }

  return { claim: mapClaim(data), error: null };
}

export async function createAssetTransferOffer(
  {
    asset,
    fromVaultRefHash,
    fromDeviceRefHash,
    publicHandleHash,
    recipientBindingHash,
    transferTerms,
    transferTermsHash,
    transferMessageHash = null,
    expiresAt,
    createdAt = new Date().toISOString(),
  },
  { supabase = null } = {}
) {
  const client = supabase ?? createVaultAdminClient();

  const registrationClaim = await ensureRegistrationClaim(asset, { supabase: client });
  if (registrationClaim.error) {
    return { transfer: null, event: null, error: registrationClaim.error };
  }

  const transferId = generateTransferId();
  const { data: transferRow, error: transferError } = await client
    .from(ASSET_TRANSFERS_TABLE)
    .insert({
      transfer_id: transferId,
      asset_id: asset.asset_id,
      from_vault_ref_hash: fromVaultRefHash,
      from_device_ref_hash: fromDeviceRefHash,
      public_handle_hash: publicHandleHash,
      recipient_binding_hash: recipientBindingHash,
      transfer_terms: transferTerms,
      transfer_terms_hash: transferTermsHash,
      status: ASSET_TRANSFER_STATUS_PENDING,
      expires_at: expiresAt,
      transfer_message_hash: transferMessageHash,
      provenance_record_hash: asset.provenance_record_hash,
      created_at: createdAt,
      updated_at: createdAt,
    })
    .select(TRANSFER_SELECT)
    .single();

  if (transferError) {
    if (isUniqueViolation(transferError)) {
      return {
        transfer: null,
        event: null,
        error: { code: "TRANSFER_ALREADY_PENDING", message: "A pending transfer already exists for this asset." },
      };
    }
    return { transfer: null, event: null, error: transferError };
  }

  const { previousEventHash, error: hashError } = await getLatestAssetCustodyEventHash(
    asset.asset_id,
    { supabase: client }
  );
  if (hashError) {
    return { transfer: mapTransfer(transferRow), event: null, error: hashError };
  }

  const eventRecord = buildAssetCustodyEventRecord({
    assetId: asset.asset_id,
    eventType: ASSET_TRANSFER_EVENT_INITIATED,
    actorType: ASSET_CUSTODY_ACTOR_OWNER,
    vaultRefHash: fromVaultRefHash,
    deviceRefHash: fromDeviceRefHash,
    result: ASSET_CUSTODY_RESULT_SUCCESS,
    previousEventHash,
    relatedTransferId: transferId,
    metadata: {
      transfer_phase: ASSET_TRANSFER_EVENT_INITIATED,
      transfer_terms: transferTerms,
    },
    createdAt,
  });

  const { event, error: eventError } = await appendAssetCustodyEvent(eventRecord, {
    supabase: client,
  });
  if (eventError) {
    return { transfer: mapTransfer(transferRow), event: null, error: eventError };
  }

  return { transfer: mapTransfer(transferRow), event, error: null };
}

function classifyAcceptRpcError(error) {
  const message = String(error?.message || error?.details || error?.hint || "").toLowerCase();
  if (message.includes("transfer_not_pending") || message.includes("transfer_not_found")) {
    return { code: "TRANSFER_NOT_PENDING", message: "Transfer is no longer pending.", retryable: false };
  }
  if (
    message.includes("source_owner_mismatch") ||
    message.includes("source_claim_mismatch") ||
    message.includes("current_claim_missing")
  ) {
    return {
      code: "SOURCE_OWNERSHIP_MISMATCH",
      message: "Transfer source no longer matches the current asset owner.",
      retryable: false,
    };
  }
  if (message.includes("asset_retired")) {
    return { code: "ASSET_RETIRED", message: "Retired assets cannot be transferred.", retryable: false };
  }
  if (message.includes("event_chain_desync")) {
    return { code: "EVENT_CHAIN_DESYNC", message: "Custody chain advanced concurrently.", retryable: true };
  }
  return {
    code: "TRANSFER_ACCEPT_FAILED",
    message: error?.message || "Unable to accept transfer.",
    retryable: false,
  };
}

// Two-party custody handoff executed as a single atomic DB function. Source ownership
// is asserted both here (defense-in-depth, M1) and authoritatively inside the RPC, which
// validates pending state + source-owns-asset + source-holds-current-claim and then
// supersedes/inserts the claim, reassigns custody, appends the event, and writes the
// receipt all-or-nothing (H1).
export async function acceptAssetTransfer(
  {
    transfer,
    asset,
    toVaultRefHash,
    toDeviceRefHash,
    acceptanceSignatureHash = null,
    acceptedAt = new Date().toISOString(),
  },
  { supabase = null } = {}
) {
  const client = supabase ?? createVaultAdminClient();

  // Offer creation guarantees claim_version 1 exists; this is a safety net only.
  const currentClaimResult = await ensureRegistrationClaim(asset, { supabase: client });
  if (currentClaimResult.error || !currentClaimResult.claim) {
    return {
      error:
        currentClaimResult.error || {
          code: "CLAIM_LOOKUP_FAILED",
          message: "Unable to resolve the current ownership claim.",
        },
    };
  }
  const previousClaim = currentClaimResult.claim;

  // M1: explicit source ownership assertion before attempting the handoff.
  if (
    previousClaim.claimant_vault_ref_hash !== transfer.from_vault_ref_hash ||
    asset.vault_ref_hash !== transfer.from_vault_ref_hash
  ) {
    return {
      error: {
        code: "SOURCE_OWNERSHIP_MISMATCH",
        message: "Transfer source no longer matches the current asset owner.",
      },
    };
  }

  const newClaimVersion = previousClaim.claim_version + 1;
  const newClaimId = crypto.randomUUID();
  const receiptId = crypto.randomUUID();
  const newClaimHash = computeOwnershipClaimHash({
    assetId: asset.asset_id,
    claimVersion: newClaimVersion,
    claimantVaultRefHash: toVaultRefHash,
    claimSource: ASSET_OWNERSHIP_CLAIM_SOURCE_TRANSFER_ACCEPT,
    transferRef: transfer.transfer_id,
    previousClaimId: previousClaim.claim_id,
    createdAt: acceptedAt,
  });

  for (let attempt = 0; attempt < ASSET_TRANSFER_ACCEPT_MAX_ATTEMPTS; attempt += 1) {
    const { previousEventHash, error: hashError } = await getLatestAssetCustodyEventHash(
      asset.asset_id,
      { supabase: client }
    );
    if (hashError) {
      return { error: hashError };
    }

    const custodyEvent = buildAssetCustodyEventRecord({
      assetId: asset.asset_id,
      eventType: ASSET_TRANSFER_EVENT_ACCEPTED,
      actorType: ASSET_CUSTODY_ACTOR_RECIPIENT,
      vaultRefHash: toVaultRefHash,
      deviceRefHash: toDeviceRefHash,
      result: ASSET_CUSTODY_RESULT_SUCCESS,
      previousEventHash,
      relatedTransferId: transfer.transfer_id,
      relatedReceiptId: receiptId,
      metadata: {
        transfer_phase: ASSET_TRANSFER_EVENT_ACCEPTED,
        transfer_terms: transfer.transfer_terms,
      },
      createdAt: acceptedAt,
    });

    const receipt = buildTransferReceiptRecord({
      receiptId,
      transferId: transfer.transfer_id,
      assetId: asset.asset_id,
      fromVaultRefHash: transfer.from_vault_ref_hash,
      toVaultRefHash,
      transferTermsHash: transfer.transfer_terms_hash,
      previousClaimId: previousClaim.claim_id,
      newClaimId,
      custodyEventHash: custodyEvent.event_hash,
      provenanceRecordHash: asset.provenance_record_hash,
      createdAt: acceptedAt,
    });

    const { data, error } = await client.rpc("asset_transfer_accept_atomic", {
      p_transfer_id: transfer.transfer_id,
      p_asset_id: asset.asset_id,
      p_from_vault_ref_hash: transfer.from_vault_ref_hash,
      p_to_vault_ref_hash: toVaultRefHash,
      p_to_device_ref_hash: toDeviceRefHash,
      p_acceptance_signature_hash: acceptanceSignatureHash,
      p_previous_claim_id: previousClaim.claim_id,
      p_new_claim_id: newClaimId,
      p_new_claim_version: newClaimVersion,
      p_new_claim_hash: newClaimHash,
      p_claim_source: ASSET_OWNERSHIP_CLAIM_SOURCE_TRANSFER_ACCEPT,
      p_event_type: custodyEvent.event_type,
      p_event_actor_type: custodyEvent.actor_type,
      p_event_result: custodyEvent.event_result,
      p_event_previous_hash: custodyEvent.previous_event_hash,
      p_event_hash: custodyEvent.event_hash,
      p_event_metadata: custodyEvent.metadata,
      p_receipt_id: receipt.receipt_id,
      p_receipt_hash: receipt.receipt_hash,
      p_provenance_record_hash: asset.provenance_record_hash,
      p_asset_status: ASSET_STATUS_CUSTODY_TRANSFER,
      p_accepted_at: acceptedAt,
    });

    if (!error) {
      return {
        transfer: mapTransfer(data?.transfer),
        claim: mapClaim(data?.claim),
        previousClaim: mapClaim(data?.previous_claim) || previousClaim,
        event: data?.event ? mapEvent(data.event) : null,
        receipt,
        error: null,
      };
    }

    const classified = classifyAcceptRpcError(error);
    if (!classified.retryable || attempt === ASSET_TRANSFER_ACCEPT_MAX_ATTEMPTS - 1) {
      return { error: classified };
    }
    await delay(ASSET_TRANSFER_CHAIN_RETRY_DELAY_MS);
  }

  return { error: { code: "EVENT_CHAIN_DESYNC", message: "Custody chain advanced concurrently." } };
}

async function terminateTransfer(
  { transfer, status, eventType, actorType, timestampField, reasonCode, timestamp = new Date().toISOString() },
  { supabase = null } = {}
) {
  const client = supabase ?? createVaultAdminClient();

  const patch = { status, updated_at: timestamp };
  patch[timestampField] = timestamp;

  const { data: row, error: updateError } = await client
    .from(ASSET_TRANSFERS_TABLE)
    .update(patch)
    .eq("transfer_id", transfer.transfer_id)
    .eq("status", ASSET_TRANSFER_STATUS_PENDING)
    .select(TRANSFER_SELECT)
    .maybeSingle();

  if (updateError) {
    return { transfer: null, event: null, error: updateError };
  }
  if (!row) {
    return {
      transfer: null,
      event: null,
      error: { code: "TRANSFER_NOT_PENDING", message: "Transfer is no longer pending." },
    };
  }

  const { previousEventHash, error: hashError } = await getLatestAssetCustodyEventHash(
    transfer.asset_id,
    { supabase: client }
  );
  if (hashError) {
    return { transfer: mapTransfer(row), event: null, error: hashError };
  }

  const eventRecord = buildAssetCustodyEventRecord({
    assetId: transfer.asset_id,
    eventType,
    actorType,
    vaultRefHash: transfer.from_vault_ref_hash,
    deviceRefHash: transfer.from_device_ref_hash,
    result: ASSET_CUSTODY_RESULT_SUCCESS,
    previousEventHash,
    relatedTransferId: transfer.transfer_id,
    metadata: {
      transfer_phase: eventType,
      reason_code: reasonCode || null,
    },
    createdAt: timestamp,
  });

  const { event, error: eventError } = await appendAssetCustodyEvent(eventRecord, {
    supabase: client,
  });
  if (eventError) {
    return { transfer: mapTransfer(row), event: null, error: eventError };
  }

  return { transfer: mapTransfer(row), event, error: null };
}

export async function declineAssetTransfer({ transfer, timestamp }, { supabase = null } = {}) {
  return terminateTransfer(
    {
      transfer,
      status: ASSET_TRANSFER_STATUS_DECLINED,
      eventType: ASSET_TRANSFER_EVENT_DECLINED,
      actorType: ASSET_CUSTODY_ACTOR_RECIPIENT,
      timestampField: "declined_at",
      reasonCode: "recipient_declined",
      timestamp,
    },
    { supabase }
  );
}

export async function revokeAssetTransfer({ transfer, timestamp }, { supabase = null } = {}) {
  return terminateTransfer(
    {
      transfer,
      status: ASSET_TRANSFER_STATUS_REVOKED,
      eventType: ASSET_TRANSFER_EVENT_REVOKED,
      actorType: ASSET_CUSTODY_ACTOR_OWNER,
      timestampField: "revoked_at",
      reasonCode: "owner_revoked",
      timestamp,
    },
    { supabase }
  );
}

export { mapTransfer, mapClaim };

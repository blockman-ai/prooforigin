import crypto from "crypto";
import { createVaultAdminClient } from "./vaultAdmin.js";
import {
  DISCLOSURE_POLICY_STATUS_ACTIVE,
  DISCLOSURE_POLICY_STATUS_REVOKED,
} from "./vaultDisclosurePolicy.js";

export const DISCLOSURE_POLICIES_TABLE = "disclosure_policies";
export const DISCLOSURE_RECEIPTS_TABLE = "disclosure_receipts";

function mapPolicy(row) {
  if (!row) return null;
  return {
    policy_id: row.policy_id || row.id,
    policy_version: Number(row.policy_version || 1),
    vault_ref_hash: row.vault_ref_hash,
    created_by_device_ref: row.created_by_device_ref,
    scope_type: row.scope_type,
    scope_ref_hash: row.scope_ref_hash,
    grant_type: row.grant_type,
    recipient_binding_mode: row.recipient_binding_mode,
    recipient_binding_hash: row.recipient_binding_hash,
    purpose_label: row.purpose_label,
    condition_profile: row.condition_profile || {},
    condition_profile_hash: row.condition_profile_hash,
    policy_snapshot_hash: row.policy_snapshot_hash,
    status: row.status,
    expires_at: row.expires_at,
    created_at: row.created_at,
    revoked_at: row.revoked_at || null,
  };
}

function mapReceipt(row) {
  if (!row) return null;
  return {
    receipt_id: row.receipt_id || row.id,
    grant_ref: row.grant_ref,
    policy_ref: row.policy_ref,
    session_ref: row.session_ref,
    event_ref: row.event_ref,
    scope_type: row.scope_type,
    scope_ref_hash: row.scope_ref_hash,
    recipient_binding_hash: row.recipient_binding_hash,
    policy_snapshot_hash: row.policy_snapshot_hash,
    condition_profile_hash: row.condition_profile_hash,
    custody_snapshot_hash: row.custody_snapshot_hash,
    disclosure_digest: row.disclosure_digest,
    result: row.result,
    receipt_hash: row.receipt_hash,
    created_at: row.created_at,
  };
}

export async function createDisclosurePolicyRecord(record, { supabase = null } = {}) {
  const client = supabase ?? createVaultAdminClient();
  const { data, error } = await client
    .from(DISCLOSURE_POLICIES_TABLE)
    .insert(record)
    .select(
      "policy_id, policy_version, vault_ref_hash, created_by_device_ref, scope_type, scope_ref_hash, grant_type, recipient_binding_mode, recipient_binding_hash, purpose_label, condition_profile, condition_profile_hash, policy_snapshot_hash, status, expires_at, created_at, revoked_at"
    )
    .single();

  return { policy: mapPolicy(data), error };
}

export async function listDisclosurePolicyRecordsByVaultRef(vaultRefHash, { supabase = null } = {}) {
  const client = supabase ?? createVaultAdminClient();
  const { data, error } = await client
    .from(DISCLOSURE_POLICIES_TABLE)
    .select(
      "policy_id, policy_version, vault_ref_hash, created_by_device_ref, scope_type, scope_ref_hash, grant_type, recipient_binding_mode, recipient_binding_hash, purpose_label, condition_profile, condition_profile_hash, policy_snapshot_hash, status, expires_at, created_at, revoked_at"
    )
    .eq("vault_ref_hash", vaultRefHash)
    .order("created_at", { ascending: false });

  return { policies: (data || []).map(mapPolicy), error };
}

export async function getDisclosurePolicyRecordById(policyId, { supabase = null } = {}) {
  const client = supabase ?? createVaultAdminClient();
  const { data, error } = await client
    .from(DISCLOSURE_POLICIES_TABLE)
    .select(
      "policy_id, policy_version, vault_ref_hash, created_by_device_ref, scope_type, scope_ref_hash, grant_type, recipient_binding_mode, recipient_binding_hash, purpose_label, condition_profile, condition_profile_hash, policy_snapshot_hash, status, expires_at, created_at, revoked_at"
    )
    .eq("policy_id", policyId)
    .maybeSingle();

  return { policy: mapPolicy(data), error };
}

export async function getDisclosurePolicyRecordByIdForVault({
  policyId,
  vaultRefHash,
  supabase = null,
}) {
  const client = supabase ?? createVaultAdminClient();
  const { data, error } = await client
    .from(DISCLOSURE_POLICIES_TABLE)
    .select(
      "policy_id, policy_version, vault_ref_hash, created_by_device_ref, scope_type, scope_ref_hash, grant_type, recipient_binding_mode, recipient_binding_hash, purpose_label, condition_profile, condition_profile_hash, policy_snapshot_hash, status, expires_at, created_at, revoked_at"
    )
    .eq("policy_id", policyId)
    .eq("vault_ref_hash", vaultRefHash)
    .maybeSingle();

  return { policy: mapPolicy(data), error };
}

export async function revokeDisclosurePolicyRecord(policyId, { supabase = null } = {}) {
  const client = supabase ?? createVaultAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await client
    .from(DISCLOSURE_POLICIES_TABLE)
    .update({
      status: DISCLOSURE_POLICY_STATUS_REVOKED,
      revoked_at: now,
    })
    .eq("policy_id", policyId)
    .select(
      "policy_id, policy_version, vault_ref_hash, created_by_device_ref, scope_type, scope_ref_hash, grant_type, recipient_binding_mode, recipient_binding_hash, purpose_label, condition_profile, condition_profile_hash, policy_snapshot_hash, status, expires_at, created_at, revoked_at"
    )
    .single();

  return { policy: mapPolicy(data), error };
}

export async function listDisclosureReceiptsByGrantRef(grantRef, { supabase = null } = {}) {
  const client = supabase ?? createVaultAdminClient();
  const { data, error } = await client
    .from(DISCLOSURE_RECEIPTS_TABLE)
    .select(
      "receipt_id, grant_ref, policy_ref, session_ref, event_ref, scope_type, scope_ref_hash, recipient_binding_hash, policy_snapshot_hash, condition_profile_hash, custody_snapshot_hash, disclosure_digest, result, receipt_hash, created_at"
    )
    .eq("grant_ref", grantRef)
    .order("created_at", { ascending: false });

  return { receipts: (data || []).map(mapReceipt), error };
}

export async function getDisclosureReceiptById(receiptId, { supabase = null } = {}) {
  const client = supabase ?? createVaultAdminClient();
  const { data, error } = await client
    .from(DISCLOSURE_RECEIPTS_TABLE)
    .select(
      "receipt_id, grant_ref, policy_ref, session_ref, event_ref, scope_type, scope_ref_hash, recipient_binding_hash, policy_snapshot_hash, condition_profile_hash, custody_snapshot_hash, disclosure_digest, result, receipt_hash, created_at"
    )
    .eq("receipt_id", receiptId)
    .maybeSingle();

  return { receipt: mapReceipt(data), error };
}

export async function getLatestDisclosureReceiptForSession({
  grantRef,
  sessionRef,
  supabase = null,
}) {
  const client = supabase ?? createVaultAdminClient();
  const { data, error } = await client
    .from(DISCLOSURE_RECEIPTS_TABLE)
    .select(
      "receipt_id, grant_ref, policy_ref, session_ref, event_ref, scope_type, scope_ref_hash, recipient_binding_hash, policy_snapshot_hash, condition_profile_hash, custody_snapshot_hash, disclosure_digest, result, receipt_hash, created_at"
    )
    .eq("grant_ref", grantRef)
    .eq("session_ref", sessionRef)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { receipt: mapReceipt(data), error };
}

export function generateDisclosurePolicyId() {
  return crypto.randomUUID();
}

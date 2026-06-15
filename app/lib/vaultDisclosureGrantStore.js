import { createVaultAdminClient } from "./vaultAdmin.js";
import {
  buildDisclosureGrantEventRecord,
  DISCLOSURE_ACCESS_SESSION_STATUS_REVOKED,
  DISCLOSURE_EVENT_GENESIS_HASH,
  DISCLOSURE_GRANT_STATUS_EXPIRED,
  DISCLOSURE_GRANT_STATUS_REVOKED,
} from "./vaultDisclosureGrant.js";

export const DISCLOSURE_GRANTS_TABLE = "disclosure_grants";
export const DISCLOSURE_GRANT_EVENTS_TABLE = "disclosure_grant_events";
export const DISCLOSURE_ACCESS_SESSIONS_TABLE = "disclosure_access_sessions";

function mapGrant(row) {
  if (!row) return null;
  return {
    grant_id: row.grant_id || row.id,
    public_handle_hash: row.public_handle_hash,
    vault_ref_hash: row.vault_ref_hash,
    scope_ref_hash: row.scope_ref_hash || null,
    grant_type: row.grant_type,
    status: row.status,
    purpose_label: row.purpose_label,
    recipient_binding_hash: row.recipient_binding_hash,
    expires_at: row.expires_at,
    access_count: Number(row.access_count || 0),
    max_access_count: Number(row.max_access_count || 0),
    created_by_device_ref: row.created_by_device_ref,
    created_at: row.created_at,
    updated_at: row.updated_at,
    revoked_at: row.revoked_at || null,
  };
}

function mapEvent(row) {
  if (!row) return null;
  return {
    event_id: row.event_id || row.id,
    grant_ref: row.grant_ref,
    event_type: row.event_type,
    actor_type: row.actor_type,
    result: row.result,
    reason_code: row.reason_code || null,
    timestamp: row.timestamp,
    previous_event_hash: row.previous_event_hash,
    event_hash: row.event_hash,
    metadata: row.metadata || {},
  };
}

function mapSession(row) {
  if (!row) return null;
  return {
    session_id: row.session_id || row.id,
    grant_ref: row.grant_ref,
    recipient_binding_hash: row.recipient_binding_hash,
    session_token_hash: row.session_token_hash,
    status: row.status,
    expires_at: row.expires_at,
    last_accessed_at: row.last_accessed_at || null,
    access_count: Number(row.access_count || 0),
    created_at: row.created_at,
    revoked_at: row.revoked_at || null,
  };
}

export async function createDisclosureGrantRecord(record, { supabase = null } = {}) {
  const client = supabase ?? createVaultAdminClient();
  const { data, error } = await client
    .from(DISCLOSURE_GRANTS_TABLE)
    .insert(record)
    .select(
      "grant_id, public_handle_hash, vault_ref_hash, scope_ref_hash, grant_type, status, purpose_label, recipient_binding_hash, expires_at, access_count, max_access_count, created_by_device_ref, created_at, updated_at, revoked_at"
    )
    .single();

  return { grant: mapGrant(data), error };
}

export async function listDisclosureGrantRecordsByVaultRef(vaultRefHash, { supabase = null } = {}) {
  const client = supabase ?? createVaultAdminClient();
  const { data, error } = await client
    .from(DISCLOSURE_GRANTS_TABLE)
    .select(
      "grant_id, public_handle_hash, vault_ref_hash, scope_ref_hash, grant_type, status, purpose_label, recipient_binding_hash, expires_at, access_count, max_access_count, created_by_device_ref, created_at, updated_at, revoked_at"
    )
    .eq("vault_ref_hash", vaultRefHash)
    .order("created_at", { ascending: false });

  return { grants: (data || []).map(mapGrant), error };
}

export async function getDisclosureGrantRecordByIdForVault({
  grantId,
  vaultRefHash,
  supabase = null,
}) {
  const client = supabase ?? createVaultAdminClient();
  const { data, error } = await client
    .from(DISCLOSURE_GRANTS_TABLE)
    .select(
      "grant_id, public_handle_hash, vault_ref_hash, scope_ref_hash, grant_type, status, purpose_label, recipient_binding_hash, expires_at, access_count, max_access_count, created_by_device_ref, created_at, updated_at, revoked_at"
    )
    .eq("grant_id", grantId)
    .eq("vault_ref_hash", vaultRefHash)
    .maybeSingle();

  return { grant: mapGrant(data), error };
}

export async function getDisclosureGrantRecordByHandleHash(publicHandleHash, { supabase = null } = {}) {
  const client = supabase ?? createVaultAdminClient();
  const { data, error } = await client
    .from(DISCLOSURE_GRANTS_TABLE)
    .select(
      "grant_id, public_handle_hash, vault_ref_hash, scope_ref_hash, grant_type, status, purpose_label, recipient_binding_hash, expires_at, access_count, max_access_count, created_by_device_ref, created_at, updated_at, revoked_at"
    )
    .eq("public_handle_hash", publicHandleHash)
    .maybeSingle();

  return { grant: mapGrant(data), error };
}

export async function revokeDisclosureGrantRecord(grantId, { supabase = null } = {}) {
  const client = supabase ?? createVaultAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await client
    .from(DISCLOSURE_GRANTS_TABLE)
    .update({
      status: DISCLOSURE_GRANT_STATUS_REVOKED,
      revoked_at: now,
      updated_at: now,
    })
    .eq("grant_id", grantId)
    .select(
      "grant_id, public_handle_hash, vault_ref_hash, scope_ref_hash, grant_type, status, purpose_label, recipient_binding_hash, expires_at, access_count, max_access_count, created_by_device_ref, created_at, updated_at, revoked_at"
    )
    .single();

  return { grant: mapGrant(data), error };
}

export async function markDisclosureGrantExpiredRecord(grantId, { supabase = null } = {}) {
  const client = supabase ?? createVaultAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await client
    .from(DISCLOSURE_GRANTS_TABLE)
    .update({
      status: DISCLOSURE_GRANT_STATUS_EXPIRED,
      updated_at: now,
    })
    .eq("grant_id", grantId)
    .select(
      "grant_id, public_handle_hash, vault_ref_hash, scope_ref_hash, grant_type, status, purpose_label, recipient_binding_hash, expires_at, access_count, max_access_count, created_by_device_ref, created_at, updated_at, revoked_at"
    )
    .single();

  return { grant: mapGrant(data), error };
}

export async function incrementDisclosureGrantAccessCount(grantId, { supabase = null } = {}) {
  const client = supabase ?? createVaultAdminClient();
  const now = new Date().toISOString();
  const { data: current, error: lookupError } = await client
    .from(DISCLOSURE_GRANTS_TABLE)
    .select("access_count")
    .eq("grant_id", grantId)
    .maybeSingle();

  if (lookupError) {
    return { grant: null, error: lookupError };
  }

  const { data, error } = await client
    .from(DISCLOSURE_GRANTS_TABLE)
    .update({
      access_count: Number(current?.access_count || 0) + 1,
      updated_at: now,
    })
    .eq("grant_id", grantId)
    .select(
      "grant_id, public_handle_hash, vault_ref_hash, scope_ref_hash, grant_type, status, purpose_label, recipient_binding_hash, expires_at, access_count, max_access_count, created_by_device_ref, created_at, updated_at, revoked_at"
    )
    .single();

  return { grant: mapGrant(data), error };
}

export async function getLatestDisclosureGrantEventHash(grantRef, { supabase = null } = {}) {
  const client = supabase ?? createVaultAdminClient();
  const { data, error } = await client
    .from(DISCLOSURE_GRANT_EVENTS_TABLE)
    .select("event_hash")
    .eq("grant_ref", grantRef)
    .order("timestamp", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.event_hash || DISCLOSURE_EVENT_GENESIS_HASH;
}

export async function appendDisclosureGrantEvent({
  grantRef,
  eventType,
  actorType,
  result,
  reasonCode = "",
  metadata = {},
  supabase = null,
}) {
  const client = supabase ?? createVaultAdminClient();
  const previousEventHash = await getLatestDisclosureGrantEventHash(grantRef, { supabase: client });
  const eventRecord = buildDisclosureGrantEventRecord({
    grantRef,
    eventType,
    actorType,
    result,
    reasonCode,
    previousEventHash,
    metadata,
  });
  const { data, error } = await client
    .from(DISCLOSURE_GRANT_EVENTS_TABLE)
    .insert(eventRecord)
    .select(
      "event_id, grant_ref, event_type, actor_type, result, reason_code, timestamp, previous_event_hash, event_hash, metadata"
    )
    .single();

  return { event: mapEvent(data), error };
}

export async function listDisclosureGrantEvents(grantRef, { supabase = null } = {}) {
  const client = supabase ?? createVaultAdminClient();
  const { data, error } = await client
    .from(DISCLOSURE_GRANT_EVENTS_TABLE)
    .select(
      "event_id, grant_ref, event_type, actor_type, result, reason_code, timestamp, previous_event_hash, event_hash, metadata"
    )
    .eq("grant_ref", grantRef)
    .order("timestamp", { ascending: true });

  return { events: (data || []).map(mapEvent), error };
}

export async function createDisclosureAccessSessionRecord(record, { supabase = null } = {}) {
  const client = supabase ?? createVaultAdminClient();
  const { data, error } = await client
    .from(DISCLOSURE_ACCESS_SESSIONS_TABLE)
    .insert(record)
    .select(
      "session_id, grant_ref, recipient_binding_hash, session_token_hash, status, expires_at, last_accessed_at, access_count, created_at, revoked_at"
    )
    .single();

  return { session: mapSession(data), error };
}

export async function getDisclosureAccessSessionByTokenHash({
  grantRef,
  sessionTokenHash,
  supabase = null,
}) {
  const client = supabase ?? createVaultAdminClient();
  const { data, error } = await client
    .from(DISCLOSURE_ACCESS_SESSIONS_TABLE)
    .select(
      "session_id, grant_ref, recipient_binding_hash, session_token_hash, status, expires_at, last_accessed_at, access_count, created_at, revoked_at"
    )
    .eq("grant_ref", grantRef)
    .eq("session_token_hash", sessionTokenHash)
    .maybeSingle();

  return { session: mapSession(data), error };
}

export async function incrementDisclosureSessionAccessCount(sessionId, { supabase = null } = {}) {
  const client = supabase ?? createVaultAdminClient();
  const now = new Date().toISOString();
  const { data: current, error: lookupError } = await client
    .from(DISCLOSURE_ACCESS_SESSIONS_TABLE)
    .select("access_count")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (lookupError) {
    return { session: null, error: lookupError };
  }

  const { data, error } = await client
    .from(DISCLOSURE_ACCESS_SESSIONS_TABLE)
    .update({
      access_count: Number(current?.access_count || 0) + 1,
      last_accessed_at: now,
    })
    .eq("session_id", sessionId)
    .select(
      "session_id, grant_ref, recipient_binding_hash, session_token_hash, status, expires_at, last_accessed_at, access_count, created_at, revoked_at"
    )
    .single();

  return { session: mapSession(data), error };
}

export async function revokeActiveDisclosureAccessSessionsForGrant(grantRef, { supabase = null } = {}) {
  const client = supabase ?? createVaultAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await client
    .from(DISCLOSURE_ACCESS_SESSIONS_TABLE)
    .update({
      status: DISCLOSURE_ACCESS_SESSION_STATUS_REVOKED,
      revoked_at: now,
    })
    .eq("grant_ref", grantRef)
    .eq("status", "active")
    .select(
      "session_id, grant_ref, recipient_binding_hash, session_token_hash, status, expires_at, last_accessed_at, access_count, created_at, revoked_at"
    );

  return { sessions: (data || []).map(mapSession), error };
}

import crypto from "crypto";
import { createVaultAdminClient, getVaultDocumentById } from "./vaultAdmin.js";

export const VAULT_DOCUMENT_STATE_EVENTS_TABLE = "vault_document_state_events";
export const VAULT_DOCUMENT_STATE_PREFIX = "prooforigin-vault-document-state-v1";

export const VAULT_DOCUMENT_EVENT_TYPES = {
  CREATED: "created",
  VIEWED: "viewed",
  VIEW_STARTED: "view_started",
  VIEW_ENDED: "view_ended",
  COMPROMISED: "compromised",
  DELETED: "deleted",
};

export const VAULT_DOCUMENT_GENESIS_STATE_HASH = crypto
  .createHash("sha256")
  .update("prooforigin-vault-document-genesis-v1")
  .digest("hex");

function stableMetadataString(metadata) {
  if (!metadata || typeof metadata !== "object") {
    return "{}";
  }
  return JSON.stringify(metadata, Object.keys(metadata).sort());
}

function normalizeTimestamp(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export function computeVaultDocumentStateHash({
  documentId,
  eventType,
  previousStateHash,
  document,
  metadata = {},
  createdAt,
}) {
  const snapshot = document || {};
  const payload = [
    VAULT_DOCUMENT_STATE_PREFIX,
    String(documentId),
    String(eventType),
    String(previousStateHash || VAULT_DOCUMENT_GENESIS_STATE_HASH),
    String(snapshot.vault_device_id || ""),
    String(snapshot.ciphertext_sha256 || ""),
    String(snapshot.ciphertext_bytes ?? ""),
    String(snapshot.content_type_hint || ""),
    String(snapshot.encryption_version ?? ""),
    normalizeTimestamp(snapshot.compromised_at),
    normalizeTimestamp(snapshot.deleted_at),
    stableMetadataString(metadata),
    normalizeTimestamp(createdAt),
  ].join("\n");

  return crypto.createHash("sha256").update(payload).digest("hex");
}

export async function getLatestDocumentStateHash(documentId) {
  const supabase = createVaultAdminClient();
  const { data, error } = await supabase
    .from(VAULT_DOCUMENT_STATE_EVENTS_TABLE)
    .select("state_hash")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.state_hash || VAULT_DOCUMENT_GENESIS_STATE_HASH;
}

export async function appendVaultDocumentEvent({
  documentId,
  eventType,
  document,
  metadata = {},
}) {
  if (!Object.values(VAULT_DOCUMENT_EVENT_TYPES).includes(eventType)) {
    throw new Error(`Unsupported vault document event type: ${eventType}`);
  }

  const supabase = createVaultAdminClient();
  const previousStateHash = await getLatestDocumentStateHash(documentId);
  const createdAt = new Date().toISOString();
  const stateHash = computeVaultDocumentStateHash({
    documentId,
    eventType,
    previousStateHash,
    document,
    metadata,
    createdAt,
  });

  const { data, error } = await supabase
    .from(VAULT_DOCUMENT_STATE_EVENTS_TABLE)
    .insert({
      document_id: documentId,
      event_type: eventType,
      previous_state_hash: previousStateHash,
      state_hash: stateHash,
      created_at: createdAt,
      metadata,
    })
    .select(
      "id, document_id, event_type, previous_state_hash, state_hash, created_at, metadata"
    )
    .single();

  if (error) {
    return { event: null, error };
  }

  return { event: data, error: null };
}

const VIEW_SESSION_DEDUP_EVENT_TYPES = new Set([
  VAULT_DOCUMENT_EVENT_TYPES.VIEWED,
  VAULT_DOCUMENT_EVENT_TYPES.VIEW_STARTED,
  VAULT_DOCUMENT_EVENT_TYPES.VIEW_ENDED,
]);

export async function findDocumentEventByViewSession({ documentId, viewSessionId, eventType }) {
  const supabase = createVaultAdminClient();
  const { data, error } = await supabase
    .from(VAULT_DOCUMENT_STATE_EVENTS_TABLE)
    .select(
      "id, document_id, event_type, previous_state_hash, state_hash, created_at, metadata"
    )
    .eq("document_id", documentId)
    .eq("event_type", eventType)
    .eq("metadata->>view_session_id", viewSessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

export async function appendVaultDocumentEventOnce({
  documentId,
  eventType,
  document,
  metadata = {},
}) {
  const viewSessionId = metadata?.view_session_id;

  if (viewSessionId && VIEW_SESSION_DEDUP_EVENT_TYPES.has(eventType)) {
    const existing = await findDocumentEventByViewSession({
      documentId,
      viewSessionId,
      eventType,
    });

    if (existing) {
      return { event: existing, error: null, duplicate: true };
    }
  }

  const result = await appendVaultDocumentEvent({
    documentId,
    eventType,
    document,
    metadata,
  });

  if (result.error?.code === "23505") {
    const existing = await findDocumentEventByViewSession({
      documentId,
      viewSessionId,
      eventType,
    });

    if (existing) {
      return { event: existing, error: null, duplicate: true };
    }
  }

  return { ...result, duplicate: false };
}

export async function getVaultDocumentHistory(documentId, limit = 20) {
  const supabase = createVaultAdminClient();
  const { data, error } = await supabase
    .from(VAULT_DOCUMENT_STATE_EVENTS_TABLE)
    .select(
      "id, document_id, event_type, previous_state_hash, state_hash, created_at, metadata"
    )
    .eq("document_id", documentId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { events: [], error };
  }

  return { events: data || [], error: null };
}

export async function getVaultDocumentHistoryAscending(documentId, limit = 1000) {
  const supabase = createVaultAdminClient();
  const { data, error } = await supabase
    .from(VAULT_DOCUMENT_STATE_EVENTS_TABLE)
    .select(
      "id, document_id, event_type, previous_state_hash, state_hash, created_at, metadata"
    )
    .eq("document_id", documentId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    return { events: [], error };
  }

  return { events: data || [], error: null };
}

function summarizeChainEvent(event) {
  if (!event) return null;

  return {
    id: event.id,
    event_type: event.event_type,
    state_hash: event.state_hash,
    created_at: event.created_at,
  };
}

export function verifyVaultDocumentStateChainRecords({ documentId, document, events = [] }) {
  if (!events.length) {
    return {
      verified: true,
      event_count: 0,
      first_event: null,
      latest_event: null,
      broken_at: null,
      reason: null,
    };
  }

  if (!document) {
    return {
      verified: false,
      event_count: events.length,
      first_event: summarizeChainEvent(events[0]),
      latest_event: summarizeChainEvent(events[events.length - 1]),
      broken_at: events[0]?.id || null,
      reason: "Vault document not found for chain verification.",
    };
  }

  let previousHash = VAULT_DOCUMENT_GENESIS_STATE_HASH;
  let compromisedAt = null;
  let deletedAt = null;

  for (const event of events) {
    if (event.previous_state_hash !== previousHash) {
      return {
        verified: false,
        event_count: events.length,
        first_event: summarizeChainEvent(events[0]),
        latest_event: summarizeChainEvent(events[events.length - 1]),
        broken_at: event.id,
        reason: "previous_state_hash continuity break.",
      };
    }

    const snapshot = {
      vault_device_id: document.vault_device_id,
      ciphertext_sha256: document.ciphertext_sha256,
      ciphertext_bytes: document.ciphertext_bytes,
      content_type_hint: document.content_type_hint,
      encryption_version: document.encryption_version,
      compromised_at: compromisedAt,
      deleted_at: deletedAt,
    };

    const recomputedHash = computeVaultDocumentStateHash({
      documentId,
      eventType: event.event_type,
      previousStateHash: event.previous_state_hash,
      document: snapshot,
      metadata: event.metadata || {},
      createdAt: event.created_at,
    });

    if (recomputedHash !== event.state_hash) {
      return {
        verified: false,
        event_count: events.length,
        first_event: summarizeChainEvent(events[0]),
        latest_event: summarizeChainEvent(events[events.length - 1]),
        broken_at: event.id,
        reason: "state_hash mismatch during recomputation.",
      };
    }

    if (event.event_type === VAULT_DOCUMENT_EVENT_TYPES.COMPROMISED) {
      compromisedAt = document.compromised_at || event.created_at;
    }

    if (event.event_type === VAULT_DOCUMENT_EVENT_TYPES.DELETED) {
      deletedAt = document.deleted_at || event.created_at;
    }

    previousHash = event.state_hash;
  }

  return {
    verified: true,
    event_count: events.length,
    first_event: summarizeChainEvent(events[0]),
    latest_event: summarizeChainEvent(events[events.length - 1]),
    broken_at: null,
    reason: null,
  };
}

export async function verifyVaultDocumentStateChain(documentId) {
  const { events, error } = await getVaultDocumentHistoryAscending(documentId, 1000);

  if (error) {
    return {
      verified: false,
      event_count: 0,
      first_event: null,
      latest_event: null,
      broken_at: null,
      reason: error.message || "Unable to load vault document state events.",
    };
  }

  const { document, error: documentError } = await getVaultDocumentById(documentId);
  const verification = verifyVaultDocumentStateChainRecords({
    documentId,
    document: documentError ? null : document,
    events,
  });

  if (documentError && events.length > 0) {
    return {
      ...verification,
      reason: documentError.message || verification.reason,
    };
  }

  return verification;
}

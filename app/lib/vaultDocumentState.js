import crypto from "crypto";
import { createVaultAdminClient } from "./vaultAdmin";

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

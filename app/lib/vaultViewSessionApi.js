import { NextResponse } from "next/server";
import {
  authorizeVaultRequest,
  vaultAuthFailureResponse,
} from "./vaultAuth";
import { getVaultDocumentByDevice, isVaultAdminConfigured } from "./vaultAdmin";
import {
  appendVaultDocumentEventOnce,
  findDocumentEventByViewSession,
  VAULT_DOCUMENT_EVENT_TYPES,
} from "./vaultDocumentState";

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const VIEW_DURATION_MISMATCH_MS = 5000;
export const VIEW_DURATION_MISMATCH_RATIO = 0.2;

export const VAULT_NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

export function withNoStore(init = {}) {
  return {
    ...init,
    headers: {
      ...VAULT_NO_STORE_HEADERS,
      ...(init.headers || {}),
    },
  };
}

export function vaultNoStoreJson(body, init = {}) {
  return NextResponse.json(body, withNoStore(init));
}

export function storageNotConfiguredResponse() {
  return vaultNoStoreJson(
    {
      success: false,
      code: "STORAGE_NOT_CONFIGURED",
      error: "Vault storage is not configured. Set Supabase service role credentials.",
    },
    { status: 503 }
  );
}

export function invalidRequestResponse(error) {
  return vaultNoStoreJson(
    { success: false, code: "INVALID_REQUEST", error },
    { status: 400 }
  );
}
export async function authorizeVaultViewSessionRequest(req, path, bodyText) {
  const auth = await authorizeVaultRequest(req, {
    method: "POST",
    path,
    bodyText,
  });

  if (!auth.ok) {
    return {
      ok: false,
      response: vaultNoStoreJson(vaultAuthFailureResponse(auth), { status: auth.status }),
    };
  }

  if (!isVaultAdminConfigured()) {
    return { ok: false, response: storageNotConfiguredResponse() };
  }

  return { ok: true, auth };
}

export function parseViewSessionBody(body) {
  const documentId = String(body?.document_id || "").trim();
  const viewSessionId = String(body?.view_session_id || "").trim();
  const startedAt = String(body?.started_at || "").trim();
  const endedAt = String(body?.ended_at || "").trim();
  const durationMsRaw = body?.duration_ms;

  if (!UUID_PATTERN.test(documentId)) {
    return { ok: false, error: "document_id must be a valid UUID." };
  }

  if (!UUID_PATTERN.test(viewSessionId)) {
    return { ok: false, error: "view_session_id must be a valid UUID." };
  }

  if (!startedAt || Number.isNaN(new Date(startedAt).getTime())) {
    return { ok: false, error: "started_at must be a valid timestamp." };
  }

  let durationMs = null;
  if (durationMsRaw !== undefined && durationMsRaw !== null && durationMsRaw !== "") {
    const parsed = Number(durationMsRaw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return { ok: false, error: "duration_ms must be a non-negative number." };
    }
    durationMs = Math.round(parsed);
  }

  if (endedAt && Number.isNaN(new Date(endedAt).getTime())) {
    return { ok: false, error: "ended_at must be a valid timestamp when provided." };
  }

  return {
    ok: true,
    documentId,
    viewSessionId,
    startedAt,
    endedAt: endedAt || null,
    durationMs,
  };
}

export async function loadAuthorizedVaultDocument(vaultDeviceId, documentId) {
  const { document, error: lookupError } = await getVaultDocumentByDevice(vaultDeviceId);

  if (lookupError) {
    return {
      ok: false,
      response: vaultNoStoreJson(
        {
          success: false,
          code: "DOCUMENT_LOOKUP_FAILED",
          error: lookupError.message || "Unable to load vault document metadata.",
        },
        { status: 502 }
      ),
    };
  }

  if (!document || document.id !== documentId) {
    return {
      ok: false,
      response: vaultNoStoreJson(
        {
          success: false,
          code: "DOCUMENT_NOT_FOUND",
          error: "No active vault document exists for this device.",
        },
        { status: 404 }
      ),
    };
  }

  return { ok: true, document };
}

export async function recordVaultViewSessionEvent({
  document,
  vaultDeviceId,
  eventType,
  viewSessionId,
  startedAt,
  endedAt = null,
  durationMs = null,
  source,
}) {
  const metadata = {
    source,
    view_session_id: viewSessionId,
    started_at: startedAt,
    vault_device_id: vaultDeviceId,
  };

  if (endedAt) {
    metadata.ended_at = endedAt;
  }

  if (durationMs !== null) {
    metadata.duration_ms = durationMs;
  }

  const { event, error: stateError, duplicate } = await appendVaultDocumentEventOnce({
    documentId: document.id,
    eventType,
    document,
    metadata,
  });

  if (stateError) {
    return {
      ok: false,
      response: vaultNoStoreJson(
        {
          success: false,
          code: "DOCUMENT_STATE_EVENT_FAILED",
          error: stateError.message || "Unable to record vault view session event.",
        },
        { status: 502 }
      ),
    };
  }

  return { ok: true, event, duplicate };
}

export function computeServerViewDurationMs(startedEventCreatedAt, nowMs = Date.now()) {
  if (!startedEventCreatedAt) {
    return null;
  }

  const startedMs = new Date(startedEventCreatedAt).getTime();
  if (Number.isNaN(startedMs)) {
    return null;
  }

  return Math.max(0, nowMs - startedMs);
}

export function isViewDurationMismatch(clientDurationMs, serverDurationMs) {
  if (clientDurationMs === null || serverDurationMs === null) {
    return false;
  }

  const delta = Math.abs(clientDurationMs - serverDurationMs);
  const threshold = Math.max(
    VIEW_DURATION_MISMATCH_MS,
    Math.round(serverDurationMs * VIEW_DURATION_MISMATCH_RATIO)
  );

  return delta > threshold;
}

export async function recordVaultViewEndedSessionEvent({
  document,
  vaultDeviceId,
  viewSessionId,
  startedAt,
  clientEndedAt = null,
  clientDurationMs = null,
  source,
}) {
  const startedEvent = await findDocumentEventByViewSession({
    documentId: document.id,
    viewSessionId,
    eventType: VAULT_DOCUMENT_EVENT_TYPES.VIEW_STARTED,
  });

  const serverEndedAt = new Date().toISOString();
  const serverDurationMs = computeServerViewDurationMs(startedEvent?.created_at);

  const metadata = {
    source,
    view_session_id: viewSessionId,
    started_at: startedAt,
    ended_at: serverEndedAt,
    vault_device_id: vaultDeviceId,
    server_duration_ms: serverDurationMs,
    duration_ms: serverDurationMs,
  };

  if (clientDurationMs !== null) {
    metadata.client_duration_ms = clientDurationMs;
  }

  if (clientEndedAt) {
    metadata.client_ended_at = clientEndedAt;
  }

  if (startedEvent?.id) {
    metadata.view_started_event_id = startedEvent.id;
  }

  if (isViewDurationMismatch(clientDurationMs, serverDurationMs)) {
    metadata.duration_mismatch = true;
  }

  const { event, error: stateError, duplicate } = await appendVaultDocumentEventOnce({
    documentId: document.id,
    eventType: VAULT_DOCUMENT_EVENT_TYPES.VIEW_ENDED,
    document,
    metadata,
  });

  if (stateError) {
    return {
      ok: false,
      response: vaultNoStoreJson(
        {
          success: false,
          code: "DOCUMENT_STATE_EVENT_FAILED",
          error: stateError.message || "Unable to record vault view session event.",
        },
        { status: 502 }
      ),
    };
  }

  return {
    ok: true,
    event,
    duplicate,
    serverEndedAt,
    serverDurationMs,
    durationMismatch: metadata.duration_mismatch === true,
  };
}

export { VAULT_DOCUMENT_EVENT_TYPES };

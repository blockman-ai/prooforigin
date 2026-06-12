import {
  authorizeVaultViewSessionRequest,
  invalidRequestResponse,
  loadAuthorizedVaultDocument,
  parseViewSessionBody,
  recordVaultViewEndedSessionEvent,
  vaultNoStoreJson,
} from "../../../../lib/vaultViewSessionApi";

export const dynamic = "force-dynamic";

const ROUTE_PATH = "/api/vault/document/view-ended";

export async function POST(req) {
  try {
    const bodyText = await req.text();
    const authResult = await authorizeVaultViewSessionRequest(req, ROUTE_PATH, bodyText);

    if (!authResult.ok) {
      return authResult.response;
    }

    const body = bodyText ? JSON.parse(bodyText) : {};
    const parsed = parseViewSessionBody(body);

    if (!parsed.ok) {
      return invalidRequestResponse(parsed.error);
    }

    const documentResult = await loadAuthorizedVaultDocument(
      authResult.auth.vault_device_id,
      parsed.documentId
    );

    if (!documentResult.ok) {
      return documentResult.response;
    }

    const recorded = await recordVaultViewEndedSessionEvent({
      document: documentResult.document,
      vaultDeviceId: authResult.auth.vault_device_id,
      viewSessionId: parsed.viewSessionId,
      startedAt: parsed.startedAt,
      clientEndedAt: parsed.endedAt,
      clientDurationMs: parsed.durationMs,
      source: "protected-view-v0.2.6",
    });

    if (!recorded.ok) {
      return recorded.response;
    }

    return vaultNoStoreJson({
      success: true,
      view_ended: true,
      duplicate: recorded.duplicate,
      document_id: documentResult.document.id,
      view_session_id: parsed.viewSessionId,
      ended_at: recorded.serverEndedAt,
      server_duration_ms: recorded.serverDurationMs,
      client_duration_ms: parsed.durationMs,
      duration_mismatch: recorded.durationMismatch,
      event_id: recorded.event?.id || null,
    });
  } catch {
    return invalidRequestResponse("Invalid vault view-ended request.");
  }
}

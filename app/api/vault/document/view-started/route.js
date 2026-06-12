import {
  authorizeVaultViewSessionRequest,
  invalidRequestResponse,
  loadAuthorizedVaultDocument,
  parseViewSessionBody,
  recordVaultViewSessionEvent,
  vaultNoStoreJson,
  VAULT_DOCUMENT_EVENT_TYPES,
} from "../../../../lib/vaultViewSessionApi";
export const dynamic = "force-dynamic";

const ROUTE_PATH = "/api/vault/document/view-started";

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

    const recorded = await recordVaultViewSessionEvent({
      document: documentResult.document,
      vaultDeviceId: authResult.auth.vault_device_id,
      eventType: VAULT_DOCUMENT_EVENT_TYPES.VIEW_STARTED,
      viewSessionId: parsed.viewSessionId,
      startedAt: parsed.startedAt,
      source: "protected-view-v0.2.6",
    });

    if (!recorded.ok) {
      return recorded.response;
    }

    return vaultNoStoreJson({
      success: true,
      view_started: true,
      duplicate: recorded.duplicate,
      document_id: documentResult.document.id,
      view_session_id: parsed.viewSessionId,
      event_id: recorded.event?.id || null,
    });  } catch {
    return invalidRequestResponse("Invalid vault view-started request.");
  }
}

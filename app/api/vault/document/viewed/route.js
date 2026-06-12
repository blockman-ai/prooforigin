import { NextResponse } from "next/server";
import {
  authorizeVaultRequest,
  vaultAuthFailureResponse,
} from "../../../../lib/vaultAuth";
import { getVaultDocumentByDevice, isVaultAdminConfigured } from "../../../../lib/vaultAdmin";
import {
  appendVaultDocumentEvent,
  VAULT_DOCUMENT_EVENT_TYPES,
} from "../../../../lib/vaultDocumentState";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function storageNotConfiguredResponse() {
  return NextResponse.json(
    {
      success: false,
      code: "STORAGE_NOT_CONFIGURED",
      error: "Vault storage is not configured. Set Supabase service role credentials.",
    },
    { status: 503 }
  );
}

export async function POST(req) {
  try {
    const bodyText = await req.text();
    const auth = await authorizeVaultRequest(req, {
      method: "POST",
      path: "/api/vault/document/viewed",
      bodyText,
    });

    if (!auth.ok) {
      return NextResponse.json(vaultAuthFailureResponse(auth), { status: auth.status });
    }

    if (!isVaultAdminConfigured()) {
      return storageNotConfiguredResponse();
    }

    const body = bodyText ? JSON.parse(bodyText) : {};
    const documentId = String(body?.document_id || "").trim();
    const viewSessionId = String(body?.view_session_id || "").trim();
    const startedAt = String(body?.started_at || "").trim();

    if (!UUID_PATTERN.test(documentId)) {
      return NextResponse.json(
        { success: false, code: "INVALID_REQUEST", error: "document_id must be a valid UUID." },
        { status: 400 }
      );
    }

    if (!UUID_PATTERN.test(viewSessionId)) {
      return NextResponse.json(
        { success: false, code: "INVALID_REQUEST", error: "view_session_id must be a valid UUID." },
        { status: 400 }
      );
    }

    if (!startedAt || Number.isNaN(new Date(startedAt).getTime())) {
      return NextResponse.json(
        { success: false, code: "INVALID_REQUEST", error: "started_at must be a valid timestamp." },
        { status: 400 }
      );
    }

    const { document, error: lookupError } = await getVaultDocumentByDevice(auth.vault_device_id);

    if (lookupError) {
      return NextResponse.json(
        {
          success: false,
          code: "DOCUMENT_LOOKUP_FAILED",
          error: lookupError.message || "Unable to load vault document metadata.",
        },
        { status: 502 }
      );
    }

    if (!document || document.id !== documentId) {
      return NextResponse.json(
        {
          success: false,
          code: "DOCUMENT_NOT_FOUND",
          error: "No active vault document exists for this device.",
        },
        { status: 404 }
      );
    }

    const { error: stateError } = await appendVaultDocumentEvent({
      documentId: document.id,
      eventType: VAULT_DOCUMENT_EVENT_TYPES.VIEWED,
      document,
      metadata: {
        source: "protected-view-v0.2",
        view_session_id: viewSessionId,
        started_at: startedAt,
        vault_device_id: auth.vault_device_id,
      },
    });

    if (stateError) {
      return NextResponse.json(
        {
          success: false,
          code: "DOCUMENT_STATE_EVENT_FAILED",
          error: stateError.message || "Unable to record vault document viewed event.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      viewed: true,
      document_id: document.id,
      view_session_id: viewSessionId,
    });
  } catch {
    return NextResponse.json(
      { success: false, code: "INVALID_REQUEST", error: "Invalid vault viewed request." },
      { status: 400 }
    );
  }
}

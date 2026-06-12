import { NextResponse } from "next/server";
import {
  authorizeVaultRequest,
  vaultAuthFailureResponse,
} from "../../../lib/vaultAuth";
import {
  appendVaultDocumentEvent,
  VAULT_DOCUMENT_EVENT_TYPES,
} from "../../../lib/vaultDocumentState";
import {
  isVaultAdminConfigured,
  markVaultDocumentCompromised,
} from "../../../lib/vaultAdmin";

export const dynamic = "force-dynamic";

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
      path: "/api/vault/compromised",
      bodyText,
    });
    if (!auth.ok) {
      return NextResponse.json(vaultAuthFailureResponse(auth), { status: auth.status });
    }

    if (!isVaultAdminConfigured()) {
      return storageNotConfiguredResponse();
    }

    const result = await markVaultDocumentCompromised(auth.vault_device_id);

    if (result.error) {
      return NextResponse.json(
        {
          success: false,
          code: "VAULT_COMPROMISE_FAILED",
          error: result.error.message || "Unable to mark vault document compromised.",
        },
        { status: 502 }
      );
    }

    if (result.notFound) {
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
      documentId: result.document.id,
      eventType: VAULT_DOCUMENT_EVENT_TYPES.COMPROMISED,
      document: result.document,
      metadata: {
        source: "vault-compromised-v0.2.5",
        vault_device_id: auth.vault_device_id,
      },
    });

    if (stateError) {
      return NextResponse.json(
        {
          success: false,
          code: "DOCUMENT_STATE_EVENT_FAILED",
          error: stateError.message || "Unable to record vault document compromised event.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      compromised: true,
      id: result.document?.id || null,
      compromised_at: result.document?.compromised_at || null,
    });
  } catch {
    return NextResponse.json(
      { success: false, code: "INVALID_REQUEST", error: "Invalid vault compromised request." },
      { status: 400 }
    );
  }
}

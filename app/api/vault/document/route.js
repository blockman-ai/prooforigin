import { NextResponse } from "next/server";
import {
  authorizeVaultRequest,
  isVaultDocumentCompromised,
  vaultAuthFailureResponse,
} from "../../../lib/vaultAuth";
import {
  markVaultDocumentDeletedWithState,
} from "../../../lib/vaultDocumentState";
import {
  getVaultDocumentByDevice,
  isVaultAdminConfigured,
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

export async function GET(req) {
  try {
    const auth = await authorizeVaultRequest(req, {
      method: "GET",
      path: "/api/vault/document",
      bodyText: "",
    });
    if (!auth.ok) {
      const status = auth.code === "STORAGE_NOT_CONFIGURED" ? 503 : auth.status;
      return NextResponse.json(vaultAuthFailureResponse(auth), { status });
    }

    if (!isVaultAdminConfigured()) {
      return storageNotConfiguredResponse();
    }

    const { document, error } = await getVaultDocumentByDevice(auth.vault_device_id);

    if (error) {
      return NextResponse.json(
        {
          success: false,
          code: "DOCUMENT_LOOKUP_FAILED",
          error: error.message || "Unable to load vault document metadata.",
        },
        { status: 502 }
      );
    }

    if (document && isVaultDocumentCompromised(document)) {
      return NextResponse.json(
        {
          success: false,
          code: "VAULT_COMPROMISED",
          error: "Vault document is marked compromised.",
          document: {
            id: document.id,
            compromised_at: document.compromised_at,
          },
        },
        { status: 423 }
      );
    }

    return NextResponse.json({
      success: true,
      document,
    });
  } catch {
    return NextResponse.json(
      { success: false, code: "INVALID_REQUEST", error: "Invalid vault document request." },
      { status: 400 }
    );
  }
}

export async function DELETE(req) {
  try {
    const bodyText = await req.text();
    const auth = await authorizeVaultRequest(req, {
      method: "DELETE",
      path: "/api/vault/document",
      bodyText,
    });
    if (!auth.ok) {
      return NextResponse.json(vaultAuthFailureResponse(auth), { status: auth.status });
    }

    if (!isVaultAdminConfigured()) {
      return storageNotConfiguredResponse();
    }

    const { document, error: lookupError } = await getVaultDocumentByDevice(auth.vault_device_id);

    if (lookupError) {
      return NextResponse.json(
        {
          success: false,
          code: "DOCUMENT_LOOKUP_FAILED",
          error: lookupError.message || "Unable to load vault document.",
        },
        { status: 502 }
      );
    }

    if (!document) {
      return NextResponse.json(
        {
          success: false,
          code: "DOCUMENT_NOT_FOUND",
          error: "No active vault document exists for this device.",
        },
        { status: 404 }
      );
    }

    const stateResult = await markVaultDocumentDeletedWithState({
      documentId: document.id,
      document,
      metadata: {
        source: "vault-document-delete-v0.2.5",
        vault_device_id: auth.vault_device_id,
      },
    });

    if (stateResult.error) {
      return NextResponse.json(
        {
          success: false,
          code: "DOCUMENT_STATE_EVENT_FAILED",
          error: stateResult.error.message || "Unable to record vault document deleted event.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      deleted: true,
      id: document?.id || null,
    });
  } catch {
    return NextResponse.json(
      { success: false, code: "INVALID_REQUEST", error: "Invalid vault delete request." },
      { status: 400 }
    );
  }
}

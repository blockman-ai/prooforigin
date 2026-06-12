import { NextResponse } from "next/server";
import {
  authorizeVaultRequest,
  isVaultDocumentCompromised,
  vaultAuthFailureResponse,
} from "../../../lib/vaultAuth";
import {
  deleteVaultDocument,
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
    const auth = authorizeVaultRequest(req, { bodyText: "" });
    if (!auth.ok) {
      return NextResponse.json(vaultAuthFailureResponse(auth), { status: auth.status });
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
    const auth = authorizeVaultRequest(req, { bodyText });
    if (!auth.ok) {
      return NextResponse.json(vaultAuthFailureResponse(auth), { status: auth.status });
    }

    if (!isVaultAdminConfigured()) {
      return storageNotConfiguredResponse();
    }

    const result = await deleteVaultDocument(auth.vault_device_id);

    if (result.error) {
      return NextResponse.json(
        {
          success: false,
          code: "DOCUMENT_DELETE_FAILED",
          error: result.error.message || "Unable to delete vault document.",
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

    return NextResponse.json({
      success: true,
      deleted: true,
      id: result.document?.id || null,
    });
  } catch {
    return NextResponse.json(
      { success: false, code: "INVALID_REQUEST", error: "Invalid vault delete request." },
      { status: 400 }
    );
  }
}

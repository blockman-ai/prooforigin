import { NextResponse } from "next/server";
import {
  authorizeVaultRequest,
  vaultAuthFailureResponse,
} from "../../../../lib/vaultAuth";
import { getVaultDocumentHistory } from "../../../../lib/vaultDocumentState";
import {
  getVaultDocumentByDevice,
  isVaultAdminConfigured,
} from "../../../../lib/vaultAdmin";

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
      path: "/api/vault/document/history",
      bodyText: "",
    });

    if (!auth.ok) {
      const status = auth.code === "STORAGE_NOT_CONFIGURED" ? 503 : auth.status;
      return NextResponse.json(vaultAuthFailureResponse(auth), { status });
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
          error: lookupError.message || "Unable to load vault document metadata.",
        },
        { status: 502 }
      );
    }

    if (!document) {
      return NextResponse.json({
        success: true,
        events: [],
        document: null,
      });
    }

    const { events, error: historyError } = await getVaultDocumentHistory(document.id, 50);

    if (historyError) {
      return NextResponse.json(
        {
          success: false,
          code: "DOCUMENT_HISTORY_FAILED",
          error: historyError.message || "Unable to load vault document history.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      events,
      document: {
        id: document.id,
        compromised_at: document.compromised_at,
        deleted_at: document.deleted_at,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, code: "INVALID_REQUEST", error: "Invalid vault history request." },
      { status: 400 }
    );
  }
}

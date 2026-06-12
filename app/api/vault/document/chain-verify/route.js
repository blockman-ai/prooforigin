import { NextResponse } from "next/server";
import {
  authorizeVaultRequest,
  vaultAuthFailureResponse,
} from "../../../../lib/vaultAuth";
import {
  getVaultDocumentByDevice,
  isVaultAdminConfigured,
} from "../../../../lib/vaultAdmin";
import { verifyVaultDocumentStateChain } from "../../../../lib/vaultDocumentState";

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
      path: "/api/vault/document/chain-verify",
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
        verified: true,
        event_count: 0,
        first_event: null,
        latest_event: null,
        broken_at: null,
        document: null,
      });
    }

    const verification = await verifyVaultDocumentStateChain(document.id);

    return NextResponse.json({
      success: true,
      ...verification,
      document: {
        id: document.id,
        compromised_at: document.compromised_at,
        deleted_at: document.deleted_at,
      },
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        code: "INVALID_REQUEST",
        error: "Invalid vault chain verification request.",
      },
      { status: 400 }
    );
  }
}

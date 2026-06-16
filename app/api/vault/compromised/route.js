import { NextResponse } from "next/server";
import {
  authorizeVaultRequest,
  vaultAuthFailureResponse,
} from "../../../lib/vaultAuth";
import {
  markVaultDocumentCompromisedWithState,
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

    const stateResult = await markVaultDocumentCompromisedWithState({
      documentId: document.id,
      document,
      reason: "vault_compromised",
      metadata: {
        source: "vault-compromised-v0.2.5",
        vault_device_id: auth.vault_device_id,
      },
    });

    if (stateResult.error) {
      return NextResponse.json(
        {
          success: false,
          code: "DOCUMENT_STATE_EVENT_FAILED",
          error: stateResult.error.message || "Unable to record vault document compromised event.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      compromised: true,
      id: document?.id || null,
      compromised_at: stateResult.mutationTimestamp || document?.compromised_at || null,
    });
  } catch {
    return NextResponse.json(
      { success: false, code: "INVALID_REQUEST", error: "Invalid vault compromised request." },
      { status: 400 }
    );
  }
}

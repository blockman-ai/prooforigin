import { NextResponse } from "next/server";
import {
  authorizeVaultRequest,
  isVaultDocumentCompromised,
  vaultAuthFailureResponse,
} from "../../../../lib/vaultAuth";
import {
  createVaultSignedDownloadUrl,
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
    const auth = authorizeVaultRequest(req, { bodyText: "" });
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
          error: lookupError.message || "Unable to load vault document metadata.",
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

    if (isVaultDocumentCompromised(document)) {
      return NextResponse.json(
        {
          success: false,
          code: "VAULT_COMPROMISED",
          error: "Vault document is marked compromised.",
        },
        { status: 423 }
      );
    }

    const download = await createVaultSignedDownloadUrl(document.storage_path);

    if (download.error || !download.signedUrl) {
      return NextResponse.json(
        {
          success: false,
          code: "DOWNLOAD_URL_FAILED",
          error: download.error?.message || "Unable to create vault download URL.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      id: document.id,
      signedUrl: download.signedUrl,
      expiresIn: download.expiresIn,
    });
  } catch {
    return NextResponse.json(
      { success: false, code: "INVALID_REQUEST", error: "Invalid vault ciphertext request." },
      { status: 400 }
    );
  }
}

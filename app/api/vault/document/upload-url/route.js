import crypto from "crypto";
import { NextResponse } from "next/server";
import {
  authorizeVaultRequest,
  isVaultDocumentCompromised,
  vaultAuthFailureResponse,
} from "../../../../lib/vaultAuth";
import {
  createVaultSignedUploadUrl,
  getVaultDocumentByDevice,
  isVaultAdminConfigured,
  VAULT_SIGNED_URL_TTL_SECONDS,
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

export async function POST(req) {
  try {
    const bodyText = await req.text();
    const auth = await authorizeVaultRequest(req, {
      method: "POST",
      path: "/api/vault/document/upload-url",
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
          error: lookupError.message || "Unable to check vault document slot.",
        },
        { status: 502 }
      );
    }

    if (document) {
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

      return NextResponse.json(
        {
          success: false,
          code: "SLOT_OCCUPIED",
          error: "This vault device already has an active encrypted document.",
        },
        { status: 409 }
      );
    }

    const docId = crypto.randomUUID();
    const upload = await createVaultSignedUploadUrl(auth.vault_device_id, docId);

    if (upload.error || !upload.signedUrl) {
      return NextResponse.json(
        {
          success: false,
          code: "UPLOAD_URL_FAILED",
          error: upload.error?.message || "Unable to create vault upload URL.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      doc_id: upload.doc_id,
      storage_path: upload.storage_path,
      signedUrl: upload.signedUrl,
      token: upload.token,
      expiresIn: VAULT_SIGNED_URL_TTL_SECONDS,
    });
  } catch {
    return NextResponse.json(
      { success: false, code: "INVALID_REQUEST", error: "Invalid vault upload URL request." },
      { status: 400 }
    );
  }
}

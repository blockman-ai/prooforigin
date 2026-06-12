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
import { vaultNoStoreJson } from "../../../../lib/vaultViewSessionApi";

export const dynamic = "force-dynamic";

function storageNotConfiguredResponse() {
  return vaultNoStoreJson(
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
      path: "/api/vault/document/ciphertext",
      bodyText: "",
    });
    if (!auth.ok) {
      return vaultNoStoreJson(vaultAuthFailureResponse(auth), { status: auth.status });
    }

    if (!isVaultAdminConfigured()) {
      return storageNotConfiguredResponse();
    }

    const { document, error: lookupError } = await getVaultDocumentByDevice(auth.vault_device_id);

    if (lookupError) {
      return vaultNoStoreJson(
        {
          success: false,
          code: "DOCUMENT_LOOKUP_FAILED",
          error: lookupError.message || "Unable to load vault document metadata.",
        },
        { status: 502 }
      );
    }

    if (!document) {
      return vaultNoStoreJson(
        {
          success: false,
          code: "DOCUMENT_NOT_FOUND",
          error: "No active vault document exists for this device.",
        },
        { status: 404 }
      );
    }

    if (isVaultDocumentCompromised(document)) {
      return vaultNoStoreJson(
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
      return vaultNoStoreJson(
        {
          success: false,
          code: "DOWNLOAD_URL_FAILED",
          error: download.error?.message || "Unable to create vault download URL.",
        },
        { status: 502 }
      );
    }

    return vaultNoStoreJson({
      success: true,
      id: document.id,
      signedUrl: download.signedUrl,
      expiresIn: download.expiresIn,
    });
  } catch {
    return vaultNoStoreJson(
      { success: false, code: "INVALID_REQUEST", error: "Invalid vault ciphertext request." },
      { status: 400 }
    );
  }
}

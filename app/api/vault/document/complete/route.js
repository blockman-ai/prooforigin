import { NextResponse } from "next/server";
import {
  authorizeVaultRequest,
  isVaultDocumentCompromised,
  vaultAuthFailureResponse,
} from "../../../../lib/vaultAuth";
import {
  buildVaultDocumentStoragePath,
  completeVaultDocument,
  getVaultDocumentByDevice,
  isVaultAdminConfigured,
  VAULT_ENCRYPTION_VERSION,
} from "../../../../lib/vaultAdmin";

export const dynamic = "force-dynamic";

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i;
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
      path: "/api/vault/document/complete",
      bodyText,
    });
    if (!auth.ok) {
      return NextResponse.json(vaultAuthFailureResponse(auth), { status: auth.status });
    }

    if (!isVaultAdminConfigured()) {
      return storageNotConfiguredResponse();
    }

    const body = bodyText ? JSON.parse(bodyText) : {};
    const docId = String(body?.doc_id || "").trim();
    const storagePath = String(body?.storage_path || "").trim();
    const ciphertextSha256 = String(body?.ciphertext_sha256 || "").trim();
    const ciphertextBytes = Number(body?.ciphertext_bytes);
    const contentTypeHint = String(body?.content_type_hint || "application/octet-stream").trim();
    const labelCiphertext = body?.label_ciphertext ? String(body.label_ciphertext) : null;
    const labelIv = body?.label_iv ? String(body.label_iv) : null;
    const encryptionVersion = Number(body?.encryption_version || VAULT_ENCRYPTION_VERSION);

    if (!UUID_PATTERN.test(docId)) {
      return NextResponse.json(
        { success: false, code: "INVALID_REQUEST", error: "doc_id must be a valid UUID." },
        { status: 400 }
      );
    }

    const expectedStoragePath = buildVaultDocumentStoragePath(auth.vault_device_id, docId);
    if (storagePath !== expectedStoragePath) {
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_REQUEST",
          error: "storage_path does not match the expected encrypted object path.",
        },
        { status: 400 }
      );
    }

    if (!SHA256_HEX_PATTERN.test(ciphertextSha256)) {
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_REQUEST",
          error: "ciphertext_sha256 must be a 64-character SHA-256 hex value.",
        },
        { status: 400 }
      );
    }

    if (!Number.isFinite(ciphertextBytes) || ciphertextBytes <= 0) {
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_REQUEST",
          error: "ciphertext_bytes must be a positive number.",
        },
        { status: 400 }
      );
    }

    if (encryptionVersion !== VAULT_ENCRYPTION_VERSION) {
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_REQUEST",
          error: `encryption_version must be ${VAULT_ENCRYPTION_VERSION}.`,
        },
        { status: 400 }
      );
    }

    const { document: existing, error: lookupError } = await getVaultDocumentByDevice(
      auth.vault_device_id
    );

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

    if (existing) {
      if (isVaultDocumentCompromised(existing)) {
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

    const { document, error } = await completeVaultDocument({
      vaultDeviceId: auth.vault_device_id,
      docId,
      storagePath,
      ciphertextSha256,
      ciphertextBytes,
      contentTypeHint,
      labelCiphertext,
      labelIv,
      encryptionVersion,
    });

    if (error) {
      const isSlotConflict = error.code === "23505";
      return NextResponse.json(
        {
          success: false,
          code: isSlotConflict ? "SLOT_OCCUPIED" : "DOCUMENT_COMPLETE_FAILED",
          error:
            error.message ||
            (isSlotConflict
              ? "This vault device already has an active encrypted document."
              : "Unable to finalize vault document metadata."),
        },
        { status: isSlotConflict ? 409 : 502 }
      );
    }

    return NextResponse.json({
      success: true,
      document,
    });
  } catch {
    return NextResponse.json(
      { success: false, code: "INVALID_REQUEST", error: "Invalid vault complete request." },
      { status: 400 }
    );
  }
}

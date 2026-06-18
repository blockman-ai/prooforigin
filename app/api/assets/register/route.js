import { NextResponse } from "next/server";
import { getVaultDocumentById } from "../../../lib/vaultAdmin";
import {
  serializeAssetCustodyEvent,
  serializeOwnerAsset,
  validateRegisterAssetInput,
} from "../../../lib/assetRegistry";
import { registerAssetRecord } from "../../../lib/assetRegistryStore";
import { authorizeDisclosureOwnerRequest } from "../../../lib/vaultDisclosureAuthority";

export const dynamic = "force-dynamic";

function requestOrigin(req) {
  try {
    return new URL(req.url).origin;
  } catch {
    return "";
  }
}

export async function POST(req) {
  try {
    const bodyText = await req.text();
    const authority = await authorizeDisclosureOwnerRequest(req, {
      method: "POST",
      path: "/api/assets/register",
      bodyText,
    });

    if (!authority.ok) {
      return NextResponse.json(authority.payload, { status: authority.status });
    }

    const input = validateRegisterAssetInput(bodyText);

    if (input.vaultDocumentId) {
      const { document, error: documentError } = await getVaultDocumentById(input.vaultDocumentId);
      if (
        documentError ||
        !document ||
        document.vault_id !== authority.registration.vault_id
      ) {
        return NextResponse.json(
          {
            success: false,
            code: "ASSET_VAULT_DOCUMENT_INVALID",
            error: "vault_document_id does not belong to the authorized vault.",
          },
          { status: 400 }
        );
      }
    }

    const { asset, provenance, event, error } = await registerAssetRecord({
      assetType: input.assetType,
      vaultRefHash: authority.vaultRefHash,
      deviceRefHash: authority.deviceRefHash,
      displayName: input.displayName,
      publicSummary: input.publicSummary,
      primaryImageUrl: input.primaryImageUrl,
      primaryImageHash: input.primaryImageHash,
      visibility: input.visibility,
      vaultDocumentId: input.vaultDocumentId,
      primaryEvidenceHash: input.primaryEvidenceHash,
      metadataHash: input.metadataHash,
      physicalDescriptorHash: input.physicalDescriptorHash,
      serialOrCertHash: input.serialOrCertHash,
      publicClaims: input.publicClaims,
      origin: requestOrigin(req),
    });

    if (error || !asset) {
      return NextResponse.json(
        {
          success: false,
          code: "ASSET_REGISTER_FAILED",
          error: error?.message || "Unable to register asset.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      asset: serializeOwnerAsset(asset),
      provenance_record: {
        provenance_record_id: provenance?.provenance_record_id,
        provenance_record_hash: provenance?.provenance_record_hash,
        evidence_bundle_hash: provenance?.evidence_bundle_hash,
        owner_claim_hash: provenance?.owner_claim_hash,
        created_at: provenance?.created_at,
      },
      custody_event: serializeAssetCustodyEvent(event),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        code: "INVALID_ASSET_REGISTER_REQUEST",
        error: error.message || "Invalid asset registration request.",
      },
      { status: 400 }
    );
  }
}

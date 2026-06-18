import { NextResponse } from "next/server";
import { authorizeDisclosureOwnerRequest } from "../../../../lib/vaultDisclosureAuthority";
import { getAssetRecordByIdForVault } from "../../../../lib/assetRegistryStore";
import {
  buildTransferPublicHandleHash,
  buildTransferRecipientBindingHash,
  computeTransferTermsHash,
  generateTransferHandle,
  serializeOwnerTransfer,
  serializePublicOwnershipChain,
  validateCreateTransferInput,
} from "../../../../lib/assetTransfer";
import {
  createAssetTransferOffer,
  getPendingTransferForAsset,
  listOwnershipClaimsForAsset,
  listTransfersForAsset,
} from "../../../../lib/assetTransferStore";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invalidAsset() {
  return NextResponse.json(
    { success: false, code: "ASSET_NOT_FOUND", error: "Asset does not exist." },
    { status: 404 }
  );
}

export async function POST(req, { params }) {
  try {
    const bodyText = await req.text();
    const authority = await authorizeDisclosureOwnerRequest(req, {
      method: "POST",
      path: `/api/assets/${params?.asset_id || ""}/transfer`,
      bodyText,
    });

    if (!authority.ok) {
      return NextResponse.json(authority.payload, { status: authority.status });
    }

    const assetId = String(params?.asset_id || "").trim().toLowerCase();
    if (!UUID_PATTERN.test(assetId)) {
      return invalidAsset();
    }

    const input = validateCreateTransferInput(bodyText);

    const { asset, error: assetError } = await getAssetRecordByIdForVault({
      assetId,
      vaultRefHash: authority.vaultRefHash,
    });
    if (assetError) {
      return NextResponse.json(
        { success: false, code: "ASSET_LOOKUP_FAILED", error: "Unable to load asset." },
        { status: 502 }
      );
    }
    if (!asset) {
      return invalidAsset();
    }
    if (asset.retired_at) {
      return NextResponse.json(
        { success: false, code: "ASSET_RETIRED", error: "Retired assets cannot be transferred." },
        { status: 409 }
      );
    }

    const { transfer: pending, error: pendingError } = await getPendingTransferForAsset(assetId);
    if (pendingError) {
      return NextResponse.json(
        { success: false, code: "TRANSFER_LOOKUP_FAILED", error: "Unable to check existing transfers." },
        { status: 502 }
      );
    }
    if (pending) {
      return NextResponse.json(
        {
          success: false,
          code: "TRANSFER_ALREADY_PENDING",
          error: "A pending transfer already exists for this asset.",
        },
        { status: 409 }
      );
    }

    const transferHandle = generateTransferHandle();
    const transferTermsHash = computeTransferTermsHash({
      transferTerms: input.transferTerms,
      transferMessageHash: input.transferMessageHash,
    });

    const { transfer, error } = await createAssetTransferOffer({
      asset,
      fromVaultRefHash: authority.vaultRefHash,
      fromDeviceRefHash: authority.deviceRefHash,
      publicHandleHash: buildTransferPublicHandleHash(transferHandle),
      recipientBindingHash: buildTransferRecipientBindingHash(input.recipientChallenge),
      transferTerms: input.transferTerms,
      transferTermsHash,
      transferMessageHash: input.transferMessageHash,
      expiresAt: input.expiresAt,
    });

    if (error || !transfer) {
      const code = error?.code === "TRANSFER_ALREADY_PENDING" ? 409 : 502;
      return NextResponse.json(
        {
          success: false,
          code: error?.code || "TRANSFER_OFFER_FAILED",
          error: error?.message || "Unable to create transfer offer.",
        },
        { status: code }
      );
    }

    return NextResponse.json({
      success: true,
      transfer: serializeOwnerTransfer(transfer, { publicHandle: transferHandle }),
      transfer_handle: transferHandle,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        code: "INVALID_TRANSFER_REQUEST",
        error: error.message || "Invalid transfer request.",
      },
      { status: 400 }
    );
  }
}

export async function GET(req, { params }) {
  const authority = await authorizeDisclosureOwnerRequest(req, {
    method: "GET",
    path: `/api/assets/${params?.asset_id || ""}/transfer`,
    bodyText: "",
  });

  if (!authority.ok) {
    return NextResponse.json(authority.payload, { status: authority.status });
  }

  const assetId = String(params?.asset_id || "").trim().toLowerCase();
  if (!UUID_PATTERN.test(assetId)) {
    return invalidAsset();
  }

  const { asset, error: assetError } = await getAssetRecordByIdForVault({
    assetId,
    vaultRefHash: authority.vaultRefHash,
  });
  if (assetError) {
    return NextResponse.json(
      { success: false, code: "ASSET_LOOKUP_FAILED", error: "Unable to load asset." },
      { status: 502 }
    );
  }
  if (!asset) {
    return invalidAsset();
  }

  const [{ transfers, error: transfersError }, { claims, error: claimsError }] = await Promise.all([
    listTransfersForAsset(assetId),
    listOwnershipClaimsForAsset(assetId),
  ]);

  if (transfersError || claimsError) {
    return NextResponse.json(
      { success: false, code: "TRANSFER_LOOKUP_FAILED", error: "Unable to load transfers." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    success: true,
    transfers: transfers.map((transfer) => serializeOwnerTransfer(transfer)),
    ownership_chain: serializePublicOwnershipChain(claims),
  });
}

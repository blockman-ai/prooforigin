import { NextResponse } from "next/server";
import { authorizeDisclosureOwnerRequest } from "../../../../lib/vaultDisclosureAuthority";
import { getAssetRecordById } from "../../../../lib/assetRegistryStore";
import { formatAssetTypeLabel } from "../../../../lib/assetRegistry";
import { serializeRecipientTransfer } from "../../../../lib/assetTransfer";
import { listIncomingTransfersForVault } from "../../../../lib/assetTransferStore";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const authority = await authorizeDisclosureOwnerRequest(req, {
    method: "GET",
    path: "/api/assets/transfers/incoming",
    bodyText: "",
  });

  if (!authority.ok) {
    return NextResponse.json(authority.payload, { status: authority.status });
  }

  const { transfers, error } = await listIncomingTransfersForVault(authority.vaultRefHash);
  if (error) {
    return NextResponse.json(
      { success: false, code: "TRANSFER_LOOKUP_FAILED", error: "Unable to load incoming transfers." },
      { status: 502 }
    );
  }

  const enriched = await Promise.all(
    transfers.map(async (transfer) => {
      const { asset } = await getAssetRecordById({ assetId: transfer.asset_id });
      return {
        ...serializeRecipientTransfer(transfer),
        asset: asset
          ? {
              asset_id: asset.asset_id,
              asset_type: asset.asset_type,
              asset_type_label: formatAssetTypeLabel(asset.asset_type),
              display_name: asset.display_name,
              primary_image_url: asset.primary_image_url,
              verification_url: asset.verification_url,
            }
          : null,
      };
    })
  );

  return NextResponse.json({ success: true, transfers: enriched });
}

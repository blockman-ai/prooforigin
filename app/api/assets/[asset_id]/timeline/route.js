import { NextResponse } from "next/server";
import { serializeAssetCustodyEvent } from "../../../../lib/assetRegistry";
import {
  getAssetRecordByIdForVault,
  listAssetCustodyEvents,
} from "../../../../lib/assetRegistryStore";
import { authorizeDisclosureOwnerRequest } from "../../../../lib/vaultDisclosureAuthority";

export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const assetId = String(params?.asset_id || "").trim().toLowerCase();
  const authority = await authorizeDisclosureOwnerRequest(req, {
    method: "GET",
    path: `/api/assets/${assetId}/timeline`,
    bodyText: "",
  });

  if (!authority.ok) {
    return NextResponse.json(authority.payload, { status: authority.status });
  }

  const { asset, error: assetError } = await getAssetRecordByIdForVault({
    assetId,
    vaultRefHash: authority.vaultRefHash,
  });

  if (assetError) {
    return NextResponse.json(
      {
        success: false,
        code: "ASSET_LOOKUP_FAILED",
        error: assetError.message || "Unable to load asset.",
      },
      { status: 502 }
    );
  }

  if (!asset) {
    return NextResponse.json(
      {
        success: false,
        code: "ASSET_NOT_FOUND",
        error: "Asset does not exist.",
      },
      { status: 404 }
    );
  }

  const { events, error } = await listAssetCustodyEvents(assetId);
  if (error) {
    return NextResponse.json(
      {
        success: false,
        code: "ASSET_TIMELINE_FAILED",
        error: error.message || "Unable to load asset custody timeline.",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    success: true,
    asset_id: assetId,
    custody_timeline: events.map(serializeAssetCustodyEvent),
  });
}

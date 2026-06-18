import { NextResponse } from "next/server";
import { serializeOwnerAsset } from "../../lib/assetRegistry";
import { listAssetRecordsByVaultRef } from "../../lib/assetRegistryStore";
import { authorizeDisclosureOwnerRequest } from "../../lib/vaultDisclosureAuthority";

export const dynamic = "force-dynamic";

function requestOrigin(req) {
  try {
    return new URL(req.url).origin;
  } catch {
    return "";
  }
}

export async function GET(req) {
  const authority = await authorizeDisclosureOwnerRequest(req, {
    method: "GET",
    path: "/api/assets",
    bodyText: "",
  });

  if (!authority.ok) {
    return NextResponse.json(authority.payload, { status: authority.status });
  }

  const { assets, error } = await listAssetRecordsByVaultRef(authority.vaultRefHash, {
    origin: requestOrigin(req),
  });

  if (error) {
    return NextResponse.json(
      {
        success: false,
        code: "ASSET_LIST_FAILED",
        error: error.message || "Unable to list registered assets.",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    success: true,
    assets: assets.map(serializeOwnerAsset),
  });
}

import { NextResponse } from "next/server";
import {
  serializeAssetCustodyEvent,
  serializeOwnerAsset,
} from "../../../lib/assetRegistry";
import {
  getAssetProvenanceRecord,
  getAssetRecordByIdForVault,
  listAssetCustodyEvents,
} from "../../../lib/assetRegistryStore";
import { authorizeDisclosureOwnerRequest } from "../../../lib/vaultDisclosureAuthority";

export const dynamic = "force-dynamic";

function requestOrigin(req) {
  try {
    return new URL(req.url).origin;
  } catch {
    return "";
  }
}

export async function GET(req, { params }) {
  const authority = await authorizeDisclosureOwnerRequest(req, {
    method: "GET",
    path: `/api/assets/${params?.asset_id || ""}`,
    bodyText: "",
  });

  if (!authority.ok) {
    return NextResponse.json(authority.payload, { status: authority.status });
  }

  const assetId = String(params?.asset_id || "").trim().toLowerCase();
  const { asset, error } = await getAssetRecordByIdForVault({
    assetId,
    vaultRefHash: authority.vaultRefHash,
    origin: requestOrigin(req),
  });

  if (error) {
    return NextResponse.json(
      {
        success: false,
        code: "ASSET_LOOKUP_FAILED",
        error: error.message || "Unable to load asset.",
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

  const [{ provenance }, { events, error: timelineError }] = await Promise.all([
    getAssetProvenanceRecord(assetId),
    listAssetCustodyEvents(assetId),
  ]);

  if (timelineError) {
    return NextResponse.json(
      {
        success: false,
        code: "ASSET_TIMELINE_FAILED",
        error: timelineError.message || "Unable to load asset custody timeline.",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    success: true,
    asset: serializeOwnerAsset(asset),
    provenance_record: provenance
      ? {
          provenance_record_id: provenance.provenance_record_id,
          provenance_record_hash: provenance.provenance_record_hash,
          evidence_bundle_hash: provenance.evidence_bundle_hash,
          owner_claim_hash: provenance.owner_claim_hash,
          public_claims: provenance.public_claims,
          created_at: provenance.created_at,
        }
      : null,
    custody_timeline: events.map(serializeAssetCustodyEvent),
  });
}

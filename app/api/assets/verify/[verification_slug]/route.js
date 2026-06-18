import { NextResponse } from "next/server";
import {
  ASSET_VISIBILITY_PRIVATE,
  serializeAssetCustodyEvent,
  serializePublicAsset,
} from "../../../../lib/assetRegistry";
import {
  getAssetRecordByVerificationSlug,
  listAssetCustodyEvents,
} from "../../../../lib/assetRegistryStore";
import { listOwnershipClaimsForAsset } from "../../../../lib/assetTransferStore";
import {
  ASSET_OWNERSHIP_CLAIM_SOURCE_TRANSFER_ACCEPT,
  serializePublicOwnershipChain,
} from "../../../../lib/assetTransfer";

export const dynamic = "force-dynamic";

function requestOrigin(req) {
  try {
    return new URL(req.url).origin;
  } catch {
    return "";
  }
}

function notFoundResponse() {
  return NextResponse.json(
    {
      success: false,
      code: "ASSET_NOT_FOUND",
      error: "Asset verification record could not be found.",
    },
    { status: 404 }
  );
}

export async function GET(req, { params }) {
  try {
    const verificationSlug = String(params?.verification_slug || "").trim();
    if (!verificationSlug) {
      return notFoundResponse();
    }

    const { asset, provenance, error } = await getAssetRecordByVerificationSlug(
      verificationSlug,
      { origin: requestOrigin(req) }
    );

    if (error) {
      return NextResponse.json(
        {
          success: false,
          code: "ASSET_VERIFY_UNAVAILABLE",
          error: "Asset verification is temporarily unavailable.",
        },
        { status: 502 }
      );
    }

    if (!asset || asset.visibility === ASSET_VISIBILITY_PRIVATE) {
      return notFoundResponse();
    }

    const [{ events, error: timelineError }, { claims, error: claimsError }] = await Promise.all([
      listAssetCustodyEvents(asset.asset_id),
      listOwnershipClaimsForAsset(asset.asset_id),
    ]);
    if (timelineError || claimsError) {
      return NextResponse.json(
        {
          success: false,
          code: "ASSET_VERIFY_UNAVAILABLE",
          error: "Asset verification is temporarily unavailable.",
        },
        { status: 502 }
      );
    }

    const ownershipChain = serializePublicOwnershipChain(claims);
    const verifiedTransferCount = ownershipChain.filter(
      (entry) => entry.claim_source === ASSET_OWNERSHIP_CLAIM_SOURCE_TRANSFER_ACCEPT
    ).length;

    return NextResponse.json({
      success: true,
      asset: serializePublicAsset({
        ...asset,
        public_claims: provenance?.public_claims || {},
      }),
      provenance_record: provenance
        ? {
            provenance_record_hash: provenance.provenance_record_hash,
            evidence_bundle_hash: provenance.evidence_bundle_hash,
            created_at: provenance.created_at,
          }
        : null,
      custody_timeline: events.map(serializeAssetCustodyEvent),
      ownership_chain: ownershipChain,
      verified_transfer_count: verifiedTransferCount,
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        code: "ASSET_VERIFY_UNAVAILABLE",
        error: "Asset verification is temporarily unavailable.",
      },
      { status: 502 }
    );
  }
}

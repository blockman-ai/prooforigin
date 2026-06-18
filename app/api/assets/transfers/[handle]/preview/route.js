import { NextResponse } from "next/server";
import { getAssetRecordById } from "../../../../../lib/assetRegistryStore";
import { formatAssetTypeLabel } from "../../../../../lib/assetRegistry";
import {
  buildTransferPublicHandleHash,
  buildTransferRecipientBindingHash,
  isAssetTransferExpired,
  serializeRecipientTransfer,
} from "../../../../../lib/assetTransfer";
import { getTransferRecordByHandleHash } from "../../../../../lib/assetTransferStore";

export const dynamic = "force-dynamic";

function denied(code, error, status = 409) {
  return NextResponse.json({ success: false, code, error }, { status });
}

export async function POST(req, { params }) {
  try {
    const bodyText = await req.text();
    const body = bodyText ? JSON.parse(bodyText) : {};
    const recipientChallenge = String(body.recipient_challenge || body.recipient_secret || "").trim();
    if (!recipientChallenge) {
      return denied("INVALID_REQUEST", "recipient_challenge is required.", 400);
    }

    const handle = String(params?.handle || "").trim();
    const publicHandleHash = buildTransferPublicHandleHash(handle);
    const { transfer, error } = await getTransferRecordByHandleHash(publicHandleHash);
    if (error) {
      return denied("TRANSFER_LOOKUP_FAILED", "Unable to load transfer.", 502);
    }
    if (!transfer) {
      return denied("TRANSFER_NOT_FOUND", "Transfer not found.", 404);
    }
    if (buildTransferRecipientBindingHash(recipientChallenge) !== transfer.recipient_binding_hash) {
      return denied("RECIPIENT_BINDING_MISMATCH", "Recipient challenge does not match this transfer.", 401);
    }

    const { asset } = await getAssetRecordById({ assetId: transfer.asset_id });

    return NextResponse.json({
      success: true,
      transfer: serializeRecipientTransfer(transfer),
      expired: isAssetTransferExpired(transfer),
      asset: asset
        ? {
            asset_type: asset.asset_type,
            asset_type_label: formatAssetTypeLabel(asset.asset_type),
            display_name: asset.display_name,
            public_summary: asset.public_summary,
            primary_image_url: asset.primary_image_url,
          }
        : null,
    });
  } catch (error) {
    return denied("INVALID_TRANSFER_PREVIEW_REQUEST", error.message || "Invalid request.", 400);
  }
}

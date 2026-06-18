import { NextResponse } from "next/server";
import {
  ASSET_TRANSFER_STATUS_PENDING,
  buildTransferPublicHandleHash,
  buildTransferRecipientBindingHash,
  isAssetTransferExpired,
  serializeRecipientTransfer,
} from "../../../../../lib/assetTransfer";
import {
  declineAssetTransfer,
  getTransferRecordByHandleHash,
} from "../../../../../lib/assetTransferStore";

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
    if (transfer.status !== ASSET_TRANSFER_STATUS_PENDING) {
      return denied("TRANSFER_NOT_PENDING", "Transfer is no longer pending.");
    }
    if (isAssetTransferExpired(transfer)) {
      return denied("TRANSFER_EXPIRED", "Transfer offer has expired.", 410);
    }

    const { transfer: declined, error: declineError } = await declineAssetTransfer({ transfer });
    if (declineError || !declined) {
      const status = declineError?.code === "TRANSFER_NOT_PENDING" ? 409 : 502;
      return denied(
        declineError?.code || "TRANSFER_DECLINE_FAILED",
        declineError?.message || "Unable to decline transfer.",
        status
      );
    }

    return NextResponse.json({
      success: true,
      status: "declined",
      transfer: serializeRecipientTransfer(declined),
    });
  } catch (error) {
    return denied("INVALID_TRANSFER_DECLINE_REQUEST", error.message || "Invalid request.", 400);
  }
}

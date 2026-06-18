import { NextResponse } from "next/server";
import { authorizeDisclosureOwnerRequest } from "../../../../../lib/vaultDisclosureAuthority";
import {
  ASSET_TRANSFER_STATUS_PENDING,
  ASSET_TRANSFER_STATUS_REVOKED,
  serializeOwnerTransfer,
  validateTransferId,
} from "../../../../../lib/assetTransfer";
import {
  getTransferRecordByIdForVault,
  revokeAssetTransfer,
} from "../../../../../lib/assetTransferStore";

export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
  try {
    const bodyText = await req.text();
    const authority = await authorizeDisclosureOwnerRequest(req, {
      method: "POST",
      path: `/api/assets/${params?.asset_id || ""}/transfer/revoke`,
      bodyText,
    });

    if (!authority.ok) {
      return NextResponse.json(authority.payload, { status: authority.status });
    }

    const body = bodyText ? JSON.parse(bodyText) : {};
    const transferId = validateTransferId(body.transfer_id);

    const { transfer: existing, error: lookupError } = await getTransferRecordByIdForVault({
      transferId,
      fromVaultRefHash: authority.vaultRefHash,
    });
    if (lookupError) {
      return NextResponse.json(
        { success: false, code: "TRANSFER_LOOKUP_FAILED", error: "Unable to load transfer." },
        { status: 502 }
      );
    }
    if (!existing) {
      return NextResponse.json(
        { success: false, code: "TRANSFER_NOT_FOUND", error: "Transfer not found." },
        { status: 404 }
      );
    }
    if (existing.status === ASSET_TRANSFER_STATUS_REVOKED) {
      return NextResponse.json({
        success: true,
        idempotent: true,
        transfer: serializeOwnerTransfer(existing),
      });
    }
    if (existing.status !== ASSET_TRANSFER_STATUS_PENDING) {
      return NextResponse.json(
        {
          success: false,
          code: "TRANSFER_NOT_PENDING",
          error: "Only pending transfers can be revoked.",
        },
        { status: 409 }
      );
    }

    const { transfer, error } = await revokeAssetTransfer({ transfer: existing });
    if (error || !transfer) {
      const status = error?.code === "TRANSFER_NOT_PENDING" ? 409 : 502;
      return NextResponse.json(
        {
          success: false,
          code: error?.code || "TRANSFER_REVOKE_FAILED",
          error: error?.message || "Unable to revoke transfer.",
        },
        { status }
      );
    }

    return NextResponse.json({
      success: true,
      transfer: serializeOwnerTransfer(transfer),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        code: "INVALID_TRANSFER_REVOKE_REQUEST",
        error: error.message || "Invalid transfer revoke request.",
      },
      { status: 400 }
    );
  }
}

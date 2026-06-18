import { NextResponse } from "next/server";
import { getTransferRecordByReceiptId } from "../../../../../lib/assetTransferStore";
import {
  isHashHex,
  verifyTransferReceipt,
} from "../../../../../lib/assetTransfer";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function deniedResponse() {
  return NextResponse.json(
    { ok: false, verified: false, status: "unavailable", error: "Receipt could not be verified." },
    { status: 200 }
  );
}

function buildReceiptFromTransfer(transfer) {
  if (!transfer || !transfer.transfer_receipt_id) return null;
  return {
    receipt_id: transfer.transfer_receipt_id,
    transfer_id: transfer.transfer_id,
    asset_id: transfer.asset_id,
    from_vault_ref_hash: transfer.from_vault_ref_hash,
    to_vault_ref_hash: transfer.to_vault_ref_hash,
    transfer_terms_hash: transfer.transfer_terms_hash,
    previous_claim_id: transfer.previous_claim_id,
    new_claim_id: transfer.new_claim_id,
    custody_event_hash: transfer.custody_event_hash,
    provenance_record_hash: transfer.provenance_record_hash,
    result: "success",
    receipt_hash: transfer.transfer_receipt_hash,
    created_at: transfer.accepted_at,
  };
}

export async function POST(req) {
  try {
    const bodyText = await req.text();
    const body = bodyText ? JSON.parse(bodyText) : {};
    const receiptId = String(body.receipt_id || "").trim().toLowerCase();
    const receiptHash = String(body.receipt_hash || "").trim().toLowerCase();

    if (!UUID_PATTERN.test(receiptId) || !isHashHex(receiptHash)) {
      return NextResponse.json(
        {
          ok: false,
          verified: false,
          status: "invalid_request",
          error: "receipt_id and receipt_hash are required.",
        },
        { status: 200 }
      );
    }

    const { transfer, error } = await getTransferRecordByReceiptId(receiptId);
    if (error) {
      return deniedResponse();
    }

    const receipt = buildReceiptFromTransfer(transfer);
    const result = verifyTransferReceipt({ receipt, submittedReceiptHash: receiptHash });

    if (result.kind === "denied") {
      return deniedResponse();
    }

    return NextResponse.json({
      ok: true,
      verified: result.verified,
      status: result.verified ? "verified" : "integrity_failed",
      checks: result.checks,
      receipt: {
        receipt_id: receipt.receipt_id,
        receipt_hash: receipt.receipt_hash,
        transfer_id: receipt.transfer_id,
        result: receipt.result,
        created_at: receipt.created_at,
      },
    });
  } catch {
    return deniedResponse();
  }
}

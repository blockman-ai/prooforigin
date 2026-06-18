import { NextResponse } from "next/server";
import { listDisclosureGrantEvents } from "../../../../lib/vaultDisclosureGrantStore";
import { getDisclosureReceiptById } from "../../../../lib/vaultDisclosurePolicyStore";
import { checkDisclosureReceiptVerifyRateLimit } from "../../../../lib/vaultDisclosureRateLimit";
import {
  buildPublicReceiptVerifyResponse,
  buildReceiptVerifyInvalidRequestResponse,
  buildUniformReceiptVerifyDeniedResponse,
  constantTimeEqualHex,
  isValidReceiptHash,
  normalizeReceiptHash,
  validateReceiptId,
  verifyPublicDisclosureReceipt,
} from "../../../../lib/vaultDisclosureReceipt";
import {
  recordVaultDisclosureSentinelCounter,
  VAULT_DISCLOSURE_SENTINEL_COUNTERS,
} from "../../../../lib/vaultDisclosureSentinelCounters";

export const dynamic = "force-dynamic";

function denied() {
  return NextResponse.json(buildUniformReceiptVerifyDeniedResponse(), { status: 404 });
}

function invalidRequest() {
  return NextResponse.json(buildReceiptVerifyInvalidRequestResponse(), { status: 400 });
}

function unavailable() {
  return NextResponse.json(buildUniformReceiptVerifyDeniedResponse(), { status: 502 });
}

export async function POST(req) {
  try {
    const rateLimit = await checkDisclosureReceiptVerifyRateLimit(req);
    if (!rateLimit.allowed) {
      recordVaultDisclosureSentinelCounter(
        VAULT_DISCLOSURE_SENTINEL_COUNTERS.RECEIPT_VERIFY_RATE_LIMITED_TOTAL
      );
      return denied();
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return invalidRequest();
    }

    let receiptId;
    try {
      receiptId = validateReceiptId(body?.receipt_id);
    } catch {
      return invalidRequest();
    }

    const submittedReceiptHash = normalizeReceiptHash(body?.receipt_hash);
    if (!isValidReceiptHash(submittedReceiptHash)) {
      return invalidRequest();
    }

    const { receipt, error: receiptError } = await getDisclosureReceiptById(receiptId);
    if (receiptError) {
      return unavailable();
    }

    const storedHash = receipt?.receipt_hash || "0".repeat(64);
    if (!receipt || !constantTimeEqualHex(submittedReceiptHash, storedHash)) {
      recordVaultDisclosureSentinelCounter(
        VAULT_DISCLOSURE_SENTINEL_COUNTERS.RECEIPT_VERIFY_DENIED_TOTAL
      );
      return denied();
    }

    const { events, error: eventsError } = await listDisclosureGrantEvents(receipt.grant_ref);
    if (eventsError) {
      return unavailable();
    }

    const result = verifyPublicDisclosureReceipt({
      receipt,
      submittedReceiptHash,
      events,
    });

    if (result.kind === "verified") {
      recordVaultDisclosureSentinelCounter(
        VAULT_DISCLOSURE_SENTINEL_COUNTERS.RECEIPT_VERIFY_SUCCESS_TOTAL
      );
    } else {
      recordVaultDisclosureSentinelCounter(
        VAULT_DISCLOSURE_SENTINEL_COUNTERS.RECEIPT_VERIFY_INTEGRITY_FAILED_TOTAL
      );
    }

    return NextResponse.json(buildPublicReceiptVerifyResponse(result));
  } catch {
    return denied();
  }
}

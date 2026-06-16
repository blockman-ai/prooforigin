import { NextResponse } from "next/server";
import {
  buildPublicHandleHash,
  buildSessionTokenHash,
  buildUniformDisclosureDeniedResponse,
  DISCLOSURE_ACCESS_SESSION_STATUS_ACTIVE,
  DISCLOSURE_GRANT_TYPE_SCOPED_VERIFY,
  DISCLOSURE_SESSION_HEADER,
  isDisclosureSessionExpired,
} from "../../../../lib/vaultDisclosureGrant";
import {
  getDisclosureAccessSessionByTokenHash,
  getDisclosureGrantRecordByHandleHash,
} from "../../../../lib/vaultDisclosureGrantStore";
import { getLatestDisclosureReceiptForSession } from "../../../../lib/vaultDisclosurePolicyStore";
import { serializeRecipientDisclosureReceipt } from "../../../../lib/vaultDisclosureReceipt";
import {
  checkDisclosureVerifyRateLimit,
  recordDisclosureRecipientFailure,
} from "../../../../lib/vaultDisclosureRateLimit";
import {
  recordVaultDisclosureSentinelCounter,
  VAULT_DISCLOSURE_SENTINEL_COUNTERS,
} from "../../../../lib/vaultDisclosureSentinelCounters";

export const dynamic = "force-dynamic";

function denied(status = 404) {
  return NextResponse.json(buildUniformDisclosureDeniedResponse(), { status });
}

export async function GET(req, { params }) {
  try {
    const grantHandle = String(params?.grant_handle || "").trim();
    const publicHandleHash = buildPublicHandleHash(grantHandle);
    const rateLimit = await checkDisclosureVerifyRateLimit(req, publicHandleHash);
    if (!rateLimit.allowed) {
      recordVaultDisclosureSentinelCounter(
        VAULT_DISCLOSURE_SENTINEL_COUNTERS.RATE_LIMITED_TOTAL
      );
      return denied();
    }

    const { grant, error } = await getDisclosureGrantRecordByHandleHash(publicHandleHash);
    if (error || !grant || grant.grant_type !== DISCLOSURE_GRANT_TYPE_SCOPED_VERIFY) {
      await recordDisclosureRecipientFailure(req, publicHandleHash);
      return denied();
    }

    const sessionToken = req.headers.get(DISCLOSURE_SESSION_HEADER)?.trim() || "";
    if (!sessionToken) {
      await recordDisclosureRecipientFailure(req, publicHandleHash);
      return denied();
    }

    const { session, error: sessionError } = await getDisclosureAccessSessionByTokenHash({
      grantRef: grant.grant_id,
      sessionTokenHash: buildSessionTokenHash(sessionToken),
    });

    if (
      sessionError ||
      !session ||
      session.status !== DISCLOSURE_ACCESS_SESSION_STATUS_ACTIVE ||
      session.recipient_binding_hash !== grant.recipient_binding_hash ||
      isDisclosureSessionExpired(session)
    ) {
      await recordDisclosureRecipientFailure(req, publicHandleHash);
      return denied();
    }

    const { receipt, error: receiptError } = await getLatestDisclosureReceiptForSession({
      grantRef: grant.grant_id,
      sessionRef: session.session_id,
    });

    if (receiptError || !receipt) {
      return denied();
    }

    return NextResponse.json({
      ok: true,
      receipt: serializeRecipientDisclosureReceipt(receipt),
    });
  } catch {
    if (params?.grant_handle) {
      await recordDisclosureRecipientFailure(
        req,
        buildPublicHandleHash(String(params.grant_handle).trim())
      );
    }
    return denied();
  }
}

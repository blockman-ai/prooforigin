import { NextResponse } from "next/server";
import {
  buildPublicHandleHash,
  buildSessionTokenHash,
  buildUniformDisclosureDeniedResponse,
  buildVerifyOnlyDisclosureResponse,
  DISCLOSURE_ACCESS_SESSION_STATUS_ACTIVE,
  DISCLOSURE_ACTOR_TYPES,
  DISCLOSURE_EVENT_RESULTS,
  DISCLOSURE_GRANT_EVENT_TYPES,
  DISCLOSURE_GRANT_STATUS_ACTIVE,
  DISCLOSURE_GRANT_STATUS_REVOKED,
  DISCLOSURE_SESSION_HEADER,
  isDisclosureGrantExpired,
  isDisclosureSessionExpired,
} from "../../../../lib/vaultDisclosureGrant";
import {
  appendDisclosureGrantEvent,
  getDisclosureAccessSessionByTokenHash,
  getDisclosureGrantRecordByHandleHash,
  incrementDisclosureGrantAccessCount,
  incrementDisclosureSessionAccessCount,
  markDisclosureGrantExpiredRecord,
} from "../../../../lib/vaultDisclosureGrantStore";
import {
  recordVaultDisclosureSentinelCounter,
  VAULT_DISCLOSURE_SENTINEL_COUNTERS,
} from "../../../../lib/vaultDisclosureSentinelCounters";
import {
  checkDisclosureVerifyRateLimit,
  recordDisclosureRecipientFailure,
} from "../../../../lib/vaultDisclosureRateLimit";

export const dynamic = "force-dynamic";

function denied(status = 404) {
  return NextResponse.json(buildUniformDisclosureDeniedResponse(), { status });
}

async function appendDeniedEvent(grant, { result, reasonCode }) {
  if (!grant?.grant_id) return;
  await appendDisclosureGrantEvent({
    grantRef: grant.grant_id,
    eventType: DISCLOSURE_GRANT_EVENT_TYPES.ACCESS_DENIED,
    actorType: DISCLOSURE_ACTOR_TYPES.RECIPIENT,
    result,
    reasonCode,
  });
}

async function expireGrantIfNeeded(grant) {
  if (grant.status === DISCLOSURE_GRANT_STATUS_ACTIVE && isDisclosureGrantExpired(grant)) {
    await markDisclosureGrantExpiredRecord(grant.grant_id);
    await appendDisclosureGrantEvent({
      grantRef: grant.grant_id,
      eventType: DISCLOSURE_GRANT_EVENT_TYPES.EXPIRED,
      actorType: DISCLOSURE_ACTOR_TYPES.SYSTEM,
      result: DISCLOSURE_EVENT_RESULTS.EXPIRED,
      reasonCode: "grant_expired",
    });
  }
}

export async function GET(req, { params }) {
  const grantHandle = String(params?.grant_handle || "").trim();
  const publicHandleHash = buildPublicHandleHash(grantHandle);
  const rateLimit = checkDisclosureVerifyRateLimit(req, publicHandleHash);
  if (!rateLimit.allowed) {
    recordVaultDisclosureSentinelCounter(
      VAULT_DISCLOSURE_SENTINEL_COUNTERS.RATE_LIMITED_TOTAL
    );
    return denied();
  }

  const { grant, error } = await getDisclosureGrantRecordByHandleHash(publicHandleHash);

  if (error || !grant) {
    recordDisclosureRecipientFailure(req, publicHandleHash);
    recordVaultDisclosureSentinelCounter(
      VAULT_DISCLOSURE_SENTINEL_COUNTERS.FAILED_VERIFY_TOTAL
    );
    return denied();
  }

  if (grant.status === DISCLOSURE_GRANT_STATUS_REVOKED) {
    recordVaultDisclosureSentinelCounter(
      VAULT_DISCLOSURE_SENTINEL_COUNTERS.REVOKED_ATTEMPT_TOTAL
    );
    await appendDeniedEvent(grant, {
      result: DISCLOSURE_EVENT_RESULTS.REVOKED,
      reasonCode: "grant_revoked",
    });
    return denied();
  }

  if (grant.status !== DISCLOSURE_GRANT_STATUS_ACTIVE || isDisclosureGrantExpired(grant)) {
    recordVaultDisclosureSentinelCounter(
      VAULT_DISCLOSURE_SENTINEL_COUNTERS.EXPIRED_ATTEMPT_TOTAL
    );
    await expireGrantIfNeeded(grant);
    return denied();
  }

  const sessionToken = req.headers.get(DISCLOSURE_SESSION_HEADER)?.trim() || "";
  if (!sessionToken) {
    recordDisclosureRecipientFailure(req, publicHandleHash);
    recordVaultDisclosureSentinelCounter(
      VAULT_DISCLOSURE_SENTINEL_COUNTERS.FAILED_VERIFY_TOTAL
    );
    await appendDeniedEvent(grant, {
      result: DISCLOSURE_EVENT_RESULTS.DENIED,
      reasonCode: "session_required",
    });
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
    session.recipient_binding_hash !== grant.recipient_binding_hash
  ) {
    recordDisclosureRecipientFailure(req, publicHandleHash);
    recordVaultDisclosureSentinelCounter(
      VAULT_DISCLOSURE_SENTINEL_COUNTERS.FAILED_VERIFY_TOTAL
    );
    await appendDeniedEvent(grant, {
      result: DISCLOSURE_EVENT_RESULTS.DENIED,
      reasonCode: "session_invalid",
    });
    return denied();
  }

  if (isDisclosureSessionExpired(session)) {
    recordVaultDisclosureSentinelCounter(
      VAULT_DISCLOSURE_SENTINEL_COUNTERS.EXPIRED_ATTEMPT_TOTAL
    );
    await appendDeniedEvent(grant, {
      result: DISCLOSURE_EVENT_RESULTS.EXPIRED,
      reasonCode: "session_expired",
    });
    return denied();
  }

  if (grant.access_count >= grant.max_access_count) {
    recordVaultDisclosureSentinelCounter(
      VAULT_DISCLOSURE_SENTINEL_COUNTERS.FAILED_VERIFY_TOTAL
    );
    await appendDeniedEvent(grant, {
      result: DISCLOSURE_EVENT_RESULTS.DENIED,
      reasonCode: "access_cap_reached",
    });
    return denied();
  }

  if (session.access_count > 0) {
    recordVaultDisclosureSentinelCounter(
      VAULT_DISCLOSURE_SENTINEL_COUNTERS.REPEATED_RECIPIENT_TOTAL
    );
  }

  const [grantAccessResult, sessionAccessResult] = await Promise.all([
    incrementDisclosureGrantAccessCount(grant.grant_id),
    incrementDisclosureSessionAccessCount(session.session_id),
  ]);

  if (grantAccessResult.error || sessionAccessResult.error) {
    return NextResponse.json(buildUniformDisclosureDeniedResponse(), { status: 502 });
  }

  const now = new Date();
  await appendDisclosureGrantEvent({
    grantRef: grant.grant_id,
    eventType: DISCLOSURE_GRANT_EVENT_TYPES.VERIFIED,
    actorType: DISCLOSURE_ACTOR_TYPES.RECIPIENT,
    result: DISCLOSURE_EVENT_RESULTS.SUCCESS,
  });

  return NextResponse.json(
    buildVerifyOnlyDisclosureResponse({
      purposeLabel: grant.purpose_label,
      expiresAt: grant.expires_at,
      now,
    })
  );
}

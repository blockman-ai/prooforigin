import { NextResponse } from "next/server";
import {
  buildDisclosureAccessSession,
  buildPublicHandleHash,
  buildRecipientBindingHash,
  buildUniformDisclosureDeniedResponse,
  DISCLOSURE_ACTOR_TYPES,
  DISCLOSURE_EVENT_RESULTS,
  DISCLOSURE_GRANT_EVENT_TYPES,
  DISCLOSURE_GRANT_STATUS_ACTIVE,
  DISCLOSURE_GRANT_STATUS_REVOKED,
  isDisclosureGrantExpired,
} from "../../../../lib/vaultDisclosureGrant";
import {
  appendDisclosureGrantEvent,
  createDisclosureAccessSessionRecord,
  getDisclosureGrantRecordByHandleHash,
  markDisclosureGrantExpiredRecord,
} from "../../../../lib/vaultDisclosureGrantStore";
import {
  recordVaultDisclosureSentinelCounter,
  VAULT_DISCLOSURE_SENTINEL_COUNTERS,
} from "../../../../lib/vaultDisclosureSentinelCounters";
import {
  checkDisclosureAcceptRateLimit,
  recordDisclosureRecipientFailure,
} from "../../../../lib/vaultDisclosureRateLimit";

export const dynamic = "force-dynamic";

function denied(status = 404) {
  return NextResponse.json(buildUniformDisclosureDeniedResponse(), { status });
}

function parseRecipientChallenge(bodyText) {
  const body = bodyText ? JSON.parse(bodyText) : {};
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Request body must be a JSON object.");
  }
  const challenge = String(body.recipient_challenge || body.recipient_secret || "").trim();
  if (!challenge) {
    throw new Error("recipient_challenge is required.");
  }
  return challenge;
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

export async function POST(req, { params }) {
  try {
    const grantHandle = String(params?.grant_handle || "").trim();
    const publicHandleHash = buildPublicHandleHash(grantHandle);
    const rateLimit = checkDisclosureAcceptRateLimit(req, publicHandleHash);
    if (!rateLimit.allowed) {
      recordVaultDisclosureSentinelCounter(
        VAULT_DISCLOSURE_SENTINEL_COUNTERS.RATE_LIMITED_TOTAL
      );
      return denied();
    }

    const bodyText = await req.text();
    const recipientChallenge = parseRecipientChallenge(bodyText);
    const { grant, error } = await getDisclosureGrantRecordByHandleHash(publicHandleHash);

    if (error || !grant) {
      recordDisclosureRecipientFailure(req, publicHandleHash);
      recordVaultDisclosureSentinelCounter(
        VAULT_DISCLOSURE_SENTINEL_COUNTERS.FAILED_ACCEPTANCE_TOTAL
      );
      return denied();
    }

    if (grant.status === DISCLOSURE_GRANT_STATUS_REVOKED) {
      recordVaultDisclosureSentinelCounter(
        VAULT_DISCLOSURE_SENTINEL_COUNTERS.REVOKED_ATTEMPT_TOTAL
      );
      await appendDisclosureGrantEvent({
        grantRef: grant.grant_id,
        eventType: DISCLOSURE_GRANT_EVENT_TYPES.ACCESS_DENIED,
        actorType: DISCLOSURE_ACTOR_TYPES.RECIPIENT,
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

    if (buildRecipientBindingHash(recipientChallenge) !== grant.recipient_binding_hash) {
      recordDisclosureRecipientFailure(req, publicHandleHash);
      recordVaultDisclosureSentinelCounter(
        VAULT_DISCLOSURE_SENTINEL_COUNTERS.FAILED_ACCEPTANCE_TOTAL
      );
      await appendDisclosureGrantEvent({
        grantRef: grant.grant_id,
        eventType: DISCLOSURE_GRANT_EVENT_TYPES.ACCESS_DENIED,
        actorType: DISCLOSURE_ACTOR_TYPES.RECIPIENT,
        result: DISCLOSURE_EVENT_RESULTS.DENIED,
        reasonCode: "recipient_binding_mismatch",
      });
      return denied();
    }

    const { session, sessionToken } = buildDisclosureAccessSession({
      grantRef: grant.grant_id,
      recipientBindingHash: grant.recipient_binding_hash,
    });
    const sessionResult = await createDisclosureAccessSessionRecord(session);
    if (sessionResult.error || !sessionResult.session) {
      return NextResponse.json(
        {
          ok: false,
          status: "unavailable",
          error: "Disclosure is unavailable.",
        },
        { status: 502 }
      );
    }

    await appendDisclosureGrantEvent({
      grantRef: grant.grant_id,
      eventType: DISCLOSURE_GRANT_EVENT_TYPES.RECIPIENT_ACCEPTED,
      actorType: DISCLOSURE_ACTOR_TYPES.RECIPIENT,
      result: DISCLOSURE_EVENT_RESULTS.SUCCESS,
    });

    return NextResponse.json({
      ok: true,
      status: "accepted",
      session_token: sessionToken,
      expires_at: sessionResult.session.expires_at,
    });
  } catch {
    recordVaultDisclosureSentinelCounter(
      VAULT_DISCLOSURE_SENTINEL_COUNTERS.FAILED_ACCEPTANCE_TOTAL
    );
    if (params?.grant_handle) {
      recordDisclosureRecipientFailure(req, buildPublicHandleHash(String(params.grant_handle).trim()));
    }
    return denied();
  }
}

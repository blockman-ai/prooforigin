import crypto from "crypto";
import { NextResponse } from "next/server";
import { evaluateDisclosureCustodyEligibility } from "../../../../lib/vaultDisclosureCustodyEligibility";
import {
  buildPublicHandleHash,
  buildSessionTokenHash,
  buildUniformDisclosureDeniedResponse,
  DISCLOSURE_ACCESS_SESSION_STATUS_ACTIVE,
  DISCLOSURE_ACTOR_TYPES,
  DISCLOSURE_EVENT_RESULTS,
  DISCLOSURE_GRANT_EVENT_TYPES,
  DISCLOSURE_GRANT_STATUS_ACTIVE,
  DISCLOSURE_GRANT_STATUS_REVOKED,
  DISCLOSURE_GRANT_TYPE_SCOPED_VERIFY,
  DISCLOSURE_SESSION_HEADER,
  isDisclosureAccessCapError,
  isDisclosureGrantExpired,
  isDisclosureSessionExpired,
} from "../../../../lib/vaultDisclosureGrant";
import {
  appendDisclosureGrantEvent,
  completeDisclosureAccessAtomic,
  getDisclosureAccessSessionByTokenHash,
  getDisclosureGrantRecordByHandleHash,
  markDisclosureGrantExpiredRecord,
} from "../../../../lib/vaultDisclosureGrantStore";
import {
  DISCLOSURE_CONDITION_PHASE_ACCESS,
  DISCLOSURE_CONDITION_REASON_CODES,
  evaluateDisclosureConditionPhase,
  buildScopedVerifyDisclosureResponse,
} from "../../../../lib/vaultDisclosurePolicy";
import { getDisclosurePolicyRecordById } from "../../../../lib/vaultDisclosurePolicyStore";
import {
  buildDisclosureReceiptRecord,
  computeDisclosureDigest,
} from "../../../../lib/vaultDisclosureReceipt";
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

function unavailable(status = 502) {
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

async function appendCustodyBlockedEvent(grant, reasonCode) {
  if (!grant?.grant_id) return;
  await appendDisclosureGrantEvent({
    grantRef: grant.grant_id,
    eventType: DISCLOSURE_GRANT_EVENT_TYPES.CUSTODY_BLOCKED,
    actorType: DISCLOSURE_ACTOR_TYPES.SYSTEM,
    result: DISCLOSURE_EVENT_RESULTS.DENIED,
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

    if (error || !grant) {
      await recordDisclosureRecipientFailure(req, publicHandleHash);
      recordVaultDisclosureSentinelCounter(
        VAULT_DISCLOSURE_SENTINEL_COUNTERS.FAILED_VERIFY_TOTAL
      );
      return denied();
    }

    if (grant.grant_type !== DISCLOSURE_GRANT_TYPE_SCOPED_VERIFY) {
      await recordDisclosureRecipientFailure(req, publicHandleHash);
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
      await recordDisclosureRecipientFailure(req, publicHandleHash);
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
      await recordDisclosureRecipientFailure(req, publicHandleHash);
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

    const { policy, error: policyError } = await getDisclosurePolicyRecordById(grant.policy_ref);
    if (policyError || !policy) {
      return unavailable();
    }

    const custodyEligibility = await evaluateDisclosureCustodyEligibility({
      scopeType: grant.scope_type || policy.scope_type,
      scopeRefHash: grant.scope_ref_hash || policy.scope_ref_hash,
    });

    const accessConditions = evaluateDisclosureConditionPhase({
      phase: DISCLOSURE_CONDITION_PHASE_ACCESS,
      policy,
      grant,
      session,
      custodyEligibility,
    });

    if (!accessConditions.allowed) {
      if (accessConditions.reasonCodes.includes(DISCLOSURE_CONDITION_REASON_CODES.CUSTODY_INELIGIBLE)) {
        recordVaultDisclosureSentinelCounter(
          VAULT_DISCLOSURE_SENTINEL_COUNTERS.FAILED_VERIFY_TOTAL
        );
        await appendCustodyBlockedEvent(grant, "custody_ineligible");
        return denied();
      }

      if (accessConditions.reasonCodes.includes(DISCLOSURE_CONDITION_REASON_CODES.ACCESS_CAP_REACHED)) {
        recordVaultDisclosureSentinelCounter(
          VAULT_DISCLOSURE_SENTINEL_COUNTERS.FAILED_VERIFY_TOTAL
        );
        await appendDeniedEvent(grant, {
          result: DISCLOSURE_EVENT_RESULTS.DENIED,
          reasonCode: "access_cap_reached",
        });
        return denied();
      }

      await recordDisclosureRecipientFailure(req, publicHandleHash);
      recordVaultDisclosureSentinelCounter(
        VAULT_DISCLOSURE_SENTINEL_COUNTERS.FAILED_VERIFY_TOTAL
      );
      await appendDeniedEvent(grant, {
        result: DISCLOSURE_EVENT_RESULTS.DENIED,
        reasonCode: accessConditions.reasonCodes[0] || "access_denied",
      });
      return denied();
    }

    if (session.access_count > 0) {
      recordVaultDisclosureSentinelCounter(
        VAULT_DISCLOSURE_SENTINEL_COUNTERS.REPEATED_RECIPIENT_TOTAL
      );
    }

    const disclosureDigest = computeDisclosureDigest({
      grantType: grant.grant_type,
      scopeType: policy.scope_type,
      purposeLabel: policy.purpose_label,
      policySnapshotHash: policy.policy_snapshot_hash,
    });

    const receiptId = crypto.randomUUID();
    const receiptDraft = buildDisclosureReceiptRecord({
      receiptId,
      grantRef: grant.grant_id,
      policyRef: policy.policy_id,
      sessionRef: session.session_id,
      eventRef: "",
      scopeType: policy.scope_type,
      scopeRefHash: policy.scope_ref_hash,
      recipientBindingHash: grant.recipient_binding_hash,
      policySnapshotHash: policy.policy_snapshot_hash,
      conditionProfileHash: policy.condition_profile_hash,
      custodySnapshotHash: custodyEligibility.custodySnapshotHash,
      disclosureDigest,
    });

    const accessResult = await completeDisclosureAccessAtomic({
      grantRef: grant.grant_id,
      sessionRef: session.session_id,
      eventType: DISCLOSURE_GRANT_EVENT_TYPES.ACCESS_RECEIPTED,
      actorType: DISCLOSURE_ACTOR_TYPES.RECIPIENT,
      result: DISCLOSURE_EVENT_RESULTS.SUCCESS,
      receiptRecord: receiptDraft,
    });

    if (accessResult.error) {
      if (isDisclosureAccessCapError(accessResult.error)) {
        recordVaultDisclosureSentinelCounter(
          VAULT_DISCLOSURE_SENTINEL_COUNTERS.FAILED_VERIFY_TOTAL
        );
        await appendDeniedEvent(grant, {
          result: DISCLOSURE_EVENT_RESULTS.DENIED,
          reasonCode: "access_cap_reached",
        });
        return denied();
      }

      return unavailable();
    }

    if (
      !accessResult.event ||
      accessResult.event.event_type !== DISCLOSURE_GRANT_EVENT_TYPES.ACCESS_RECEIPTED ||
      !accessResult.receipt
    ) {
      return unavailable();
    }

    const now = new Date();
    return NextResponse.json(
      buildScopedVerifyDisclosureResponse({
        purposeLabel: grant.purpose_label,
        expiresAt: grant.expires_at,
        receipt: accessResult.receipt,
        now,
      })
    );
  } catch {
    recordVaultDisclosureSentinelCounter(
      VAULT_DISCLOSURE_SENTINEL_COUNTERS.FAILED_VERIFY_TOTAL
    );
    if (params?.grant_handle) {
      await recordDisclosureRecipientFailure(
        req,
        buildPublicHandleHash(String(params.grant_handle).trim())
      );
    }
    return denied();
  }
}

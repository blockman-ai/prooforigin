import { NextResponse } from "next/server";
import { authorizeDisclosureOwnerRequest } from "../../../../../lib/vaultDisclosureAuthority";
import {
  DISCLOSURE_ACTOR_TYPES,
  DISCLOSURE_EVENT_RESULTS,
  DISCLOSURE_GRANT_EVENT_TYPES,
  DISCLOSURE_GRANT_STATUS_ACTIVE,
} from "../../../../../lib/vaultDisclosureGrant";
import {
  appendDisclosureGrantEvent,
  listDisclosureGrantRecordsByVaultRef,
  revokeActiveDisclosureAccessSessionsForGrant,
  revokeDisclosureGrantRecord,
} from "../../../../../lib/vaultDisclosureGrantStore";
import {
  DISCLOSURE_POLICY_STATUS_REVOKED,
  serializeOwnerDisclosurePolicy,
  validatePolicyId,
} from "../../../../../lib/vaultDisclosurePolicy";
import {
  getDisclosurePolicyRecordByIdForVault,
  revokeDisclosurePolicyRecord,
} from "../../../../../lib/vaultDisclosurePolicyStore";

export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
  try {
    const policyId = validatePolicyId(params?.id);
    const bodyText = await req.text();
    const authority = await authorizeDisclosureOwnerRequest(req, {
      method: "POST",
      path: `/api/vault/disclosure-policies/${policyId}/revoke`,
      bodyText,
    });

    if (!authority.ok) {
      return NextResponse.json(authority.payload, { status: authority.status });
    }

    const { policy: existing, error: lookupError } = await getDisclosurePolicyRecordByIdForVault({
      policyId,
      vaultRefHash: authority.vaultRefHash,
    });

    if (lookupError) {
      return NextResponse.json(
        {
          success: false,
          code: "DISCLOSURE_POLICY_LOOKUP_FAILED",
          error: lookupError.message || "Unable to load disclosure policy.",
        },
        { status: 502 }
      );
    }

    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          code: "DISCLOSURE_POLICY_NOT_FOUND",
          error: "Disclosure policy not found.",
        },
        { status: 404 }
      );
    }

    if (existing.status === DISCLOSURE_POLICY_STATUS_REVOKED) {
      return NextResponse.json({
        success: true,
        policy: serializeOwnerDisclosurePolicy(existing),
      });
    }

    const { policy, error } = await revokeDisclosurePolicyRecord(policyId);
    if (error || !policy) {
      return NextResponse.json(
        {
          success: false,
          code: "DISCLOSURE_POLICY_REVOKE_FAILED",
          error: error?.message || "Unable to revoke disclosure policy.",
        },
        { status: 502 }
      );
    }

    const { grants } = await listDisclosureGrantRecordsByVaultRef(authority.vaultRefHash);
    const activeGrants = (grants || []).filter(
      (grant) => grant.policy_ref === policyId && grant.status === DISCLOSURE_GRANT_STATUS_ACTIVE
    );

    for (const grant of activeGrants) {
      await revokeDisclosureGrantRecord(grant.grant_id);
      await revokeActiveDisclosureAccessSessionsForGrant(grant.grant_id);
      await appendDisclosureGrantEvent({
        grantRef: grant.grant_id,
        eventType: DISCLOSURE_GRANT_EVENT_TYPES.REVOKED,
        actorType: DISCLOSURE_ACTOR_TYPES.OWNER,
        result: DISCLOSURE_EVENT_RESULTS.REVOKED,
        reasonCode: "policy_revoked",
      });
    }

    return NextResponse.json({
      success: true,
      policy: serializeOwnerDisclosurePolicy(policy),
      revoked_grant_count: activeGrants.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        code: "INVALID_POLICY_ID",
        error: error.message || "policy_id must be a valid UUID.",
      },
      { status: 400 }
    );
  }
}

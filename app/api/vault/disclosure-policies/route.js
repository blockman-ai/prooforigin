import { NextResponse } from "next/server";
import { getVaultDocumentById } from "../../../lib/vaultAdmin";
import { authorizeDisclosureOwnerRequest } from "../../../lib/vaultDisclosureAuthority";
import { consumeDisclosureConfirmationNonce } from "../../../lib/vaultDisclosureConfirmation";
import { evaluateDisclosureCustodyEligibility } from "../../../lib/vaultDisclosureCustodyEligibility";
import {
  buildPublicHandleHash,
  DISCLOSURE_ACTOR_TYPES,
  DISCLOSURE_EVENT_RESULTS,
  DISCLOSURE_GRANT_EVENT_TYPES,
  DISCLOSURE_GRANT_STATUS_ACTIVE,
  generateDisclosureToken,
  serializeOwnerDisclosureGrant,
} from "../../../lib/vaultDisclosureGrant";
import {
  appendDisclosureGrantEvent,
  createDisclosureGrantRecord,
} from "../../../lib/vaultDisclosureGrantStore";
import {
  buildDisclosurePolicyRecord,
  DISCLOSURE_CONDITION_PHASE_CREATE,
  DISCLOSURE_POLICY_SCOPE_DOCUMENT_REF,
  DISCLOSURE_POLICY_STATUS_ACTIVE,
  evaluateDisclosureConditionPhase,
  resolvePolicyScopeRefHash,
  serializeOwnerDisclosurePolicy,
  validateCreateDisclosurePolicyInput,
} from "../../../lib/vaultDisclosurePolicy";
import {
  createDisclosurePolicyRecord,
  generateDisclosurePolicyId,
} from "../../../lib/vaultDisclosurePolicyStore";
import {
  recordVaultDisclosureSentinelCounter,
  VAULT_DISCLOSURE_SENTINEL_COUNTERS,
} from "../../../lib/vaultDisclosureSentinelCounters";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const bodyText = await req.text();
    const authority = await authorizeDisclosureOwnerRequest(req, {
      method: "POST",
      path: "/api/vault/disclosure-policies",
      bodyText,
    });

    if (!authority.ok) {
      return NextResponse.json(authority.payload, { status: authority.status });
    }

    const input = validateCreateDisclosurePolicyInput(bodyText);
    const confirmation = await consumeDisclosureConfirmationNonce({
      nonce: input.confirmationNonce,
      vaultRefHash: authority.vaultRefHash,
      deviceRefHash: authority.deviceRefHash,
      purpose: "disclosure_policy",
    });
    if (!confirmation.ok) {
      return NextResponse.json(
        {
          success: false,
          code: confirmation.code || "CONFIRMATION_NONCE_INVALID",
          error: "Fresh owner confirmation is required before creating a disclosure policy.",
        },
        { status: 403 }
      );
    }

    if (input.scopeType === DISCLOSURE_POLICY_SCOPE_DOCUMENT_REF) {
      const { document, error: documentError } = await getVaultDocumentById(input.documentId);
      if (documentError || !document || document.vault_id !== authority.registration.vault_id) {
        return NextResponse.json(
          {
            success: false,
            code: "DISCLOSURE_POLICY_SCOPE_INVALID",
            error: "document_id does not belong to the authorized vault.",
          },
          { status: 400 }
        );
      }
    }

    const scopeRefHash = resolvePolicyScopeRefHash({
      scopeType: input.scopeType,
      vaultRefHash: authority.vaultRefHash,
      documentId: input.documentId,
    });

    const custodyEligibility = await evaluateDisclosureCustodyEligibility({
      scopeType: input.scopeType,
      scopeRefHash,
      vaultId: authority.registration.vault_id,
      documentId: input.documentId,
    });

    const policyDraft = buildDisclosurePolicyRecord({
      policyId: generateDisclosurePolicyId(),
      vaultRefHash: authority.vaultRefHash,
      createdByDeviceRef: authority.deviceRefHash,
      scopeType: input.scopeType,
      scopeRefHash,
      grantType: input.grantType,
      recipientBindingHash: input.recipientBindingHash,
      purposeLabel: input.purposeLabel,
      conditionProfile: input.conditionProfile,
      expiresAt: input.expiresAt,
      status: DISCLOSURE_POLICY_STATUS_ACTIVE,
    });

    const createConditions = evaluateDisclosureConditionPhase({
      phase: DISCLOSURE_CONDITION_PHASE_CREATE,
      policy: policyDraft,
      custodyEligibility,
    });
    if (!createConditions.allowed) {
      return NextResponse.json(
        {
          success: false,
          code: "DISCLOSURE_POLICY_CONDITIONS_FAILED",
          error: "Disclosure policy conditions are not satisfied.",
        },
        { status: 400 }
      );
    }

    const { policy, error } = await createDisclosurePolicyRecord(policyDraft);
    if (error || !policy) {
      return NextResponse.json(
        {
          success: false,
          code: "DISCLOSURE_POLICY_CREATE_FAILED",
          error: error?.message || "Unable to create disclosure policy.",
        },
        { status: 502 }
      );
    }

    recordVaultDisclosureSentinelCounter(
      VAULT_DISCLOSURE_SENTINEL_COUNTERS.GRANT_CREATED_TOTAL
    );

    let grantPayload = null;
    let recipientDelivery = null;

    if (input.issueGrant) {
      const publicHandle = generateDisclosureToken();
      const { grant, error: grantError } = await createDisclosureGrantRecord({
        public_handle_hash: buildPublicHandleHash(publicHandle),
        vault_ref_hash: authority.vaultRefHash,
        policy_ref: policy.policy_id,
        scope_type: policy.scope_type,
        scope_ref_hash: policy.scope_ref_hash,
        grant_type: policy.grant_type,
        status: DISCLOSURE_GRANT_STATUS_ACTIVE,
        purpose_label: policy.purpose_label,
        recipient_binding_hash: policy.recipient_binding_hash,
        expires_at: policy.expires_at,
        max_access_count: input.conditionProfile.max_access_count,
        created_by_device_ref: authority.deviceRefHash,
      });

      if (grantError || !grant) {
        return NextResponse.json(
          {
            success: false,
            code: "DISCLOSURE_GRANT_CREATE_FAILED",
            error: grantError?.message || "Unable to create disclosure grant from policy.",
          },
          { status: 502 }
        );
      }

      const eventResult = await appendDisclosureGrantEvent({
        grantRef: grant.grant_id,
        eventType: DISCLOSURE_GRANT_EVENT_TYPES.CREATED,
        actorType: DISCLOSURE_ACTOR_TYPES.OWNER,
        result: DISCLOSURE_EVENT_RESULTS.SUCCESS,
        metadata: {
          grant_type: grant.grant_type,
          policy_ref: policy.policy_id,
          max_access_count: grant.max_access_count,
        },
      });

      if (eventResult.error) {
        return NextResponse.json(
          {
            success: false,
            code: "DISCLOSURE_AUDIT_APPEND_FAILED",
            error: eventResult.error.message || "Unable to append disclosure audit event.",
          },
          { status: 502 }
        );
      }

      grantPayload = serializeOwnerDisclosureGrant(grant, { publicHandle });
      recipientDelivery = {
        grant_handle: publicHandle,
        recipient_challenge_required: true,
      };
    }

    return NextResponse.json({
      success: true,
      policy: serializeOwnerDisclosurePolicy(policy),
      grant: grantPayload,
      recipient_delivery: recipientDelivery,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        code: "INVALID_DISCLOSURE_POLICY_REQUEST",
        error: error.message || "Invalid disclosure policy request.",
      },
      { status: 400 }
    );
  }
}

export async function GET(req) {
  try {
    const authority = await authorizeDisclosureOwnerRequest(req, {
      method: "GET",
      path: "/api/vault/disclosure-policies",
      bodyText: "",
    });

    if (!authority.ok) {
      return NextResponse.json(authority.payload, { status: authority.status });
    }

    const { listDisclosurePolicyRecordsByVaultRef } = await import(
      "../../../lib/vaultDisclosurePolicyStore.js"
    );
    const { policies, error } = await listDisclosurePolicyRecordsByVaultRef(
      authority.vaultRefHash
    );

    if (error) {
      return NextResponse.json(
        {
          success: false,
          code: "DISCLOSURE_POLICY_LOOKUP_FAILED",
          error: error.message || "Unable to load disclosure policies.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      policies: policies.map(serializeOwnerDisclosurePolicy),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        code: "DISCLOSURE_POLICY_LOOKUP_FAILED",
        error: error.message || "Unable to load disclosure policies.",
      },
      { status: 502 }
    );
  }
}

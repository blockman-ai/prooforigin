import { NextResponse } from "next/server";
import { listVaultCustodyMigrations } from "../../../../lib/vaultAdmin";
import { authorizeDisclosureOwnerRequest } from "../../../../lib/vaultDisclosureAuthority";
import { consumeDisclosureConfirmationNonce } from "../../../../lib/vaultDisclosureConfirmation";
import {
  buildPublicHandleHash,
  buildRecipientBindingHash,
  DISCLOSURE_ACTOR_TYPES,
  DISCLOSURE_EVENT_RESULTS,
  DISCLOSURE_GRANT_EVENT_TYPES,
  DISCLOSURE_GRANT_STATUS_ACTIVE,
  generateDisclosureToken,
  serializeOwnerDisclosureGrant,
  validateCreateVerifyDisclosureGrantInput,
} from "../../../../lib/vaultDisclosureGrant";
import {
  appendDisclosureGrantEvent,
  createDisclosureGrantRecord,
} from "../../../../lib/vaultDisclosureGrantStore";
import {
  recordVaultDisclosureCreationContextCounters,
  recordVaultDisclosureSentinelCounter,
  VAULT_DISCLOSURE_SENTINEL_COUNTERS,
} from "../../../../lib/vaultDisclosureSentinelCounters";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const bodyText = await req.text();
    const authority = await authorizeDisclosureOwnerRequest(req, {
      method: "POST",
      path: "/api/vault/disclosure-grants/create",
      bodyText,
    });

    if (!authority.ok) {
      return NextResponse.json(authority.payload, { status: authority.status });
    }

    const input = validateCreateVerifyDisclosureGrantInput(bodyText);
    const confirmation = consumeDisclosureConfirmationNonce({
      nonce: input.confirmationNonce,
      vaultRefHash: authority.vaultRefHash,
      deviceRefHash: authority.deviceRefHash,
    });
    if (!confirmation.ok) {
      return NextResponse.json(
        {
          success: false,
          code: confirmation.code || "CONFIRMATION_NONCE_INVALID",
          error: "Fresh owner confirmation is required before creating a disclosure grant.",
        },
        { status: 403 }
      );
    }

    const publicHandle = generateDisclosureToken();
    const { grant, error } = await createDisclosureGrantRecord({
      public_handle_hash: buildPublicHandleHash(publicHandle),
      vault_ref_hash: authority.vaultRefHash,
      scope_ref_hash: null,
      grant_type: input.grantType,
      status: DISCLOSURE_GRANT_STATUS_ACTIVE,
      purpose_label: input.purposeLabel,
      recipient_binding_hash: buildRecipientBindingHash(input.recipientChallenge),
      expires_at: input.expiresAt,
      max_access_count: input.maxAccessCount,
      created_by_device_ref: authority.deviceRefHash,
    });

    if (error || !grant) {
      return NextResponse.json(
        {
          success: false,
          code: "DISCLOSURE_GRANT_CREATE_FAILED",
          error: error?.message || "Unable to create disclosure grant.",
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

    recordVaultDisclosureSentinelCounter(
      VAULT_DISCLOSURE_SENTINEL_COUNTERS.GRANT_CREATED_TOTAL
    );

    const { migrations } = await listVaultCustodyMigrations(authority.registration.vault_id);
    recordVaultDisclosureCreationContextCounters({
      registration: authority.registration,
      migrations,
    });

    return NextResponse.json({
      success: true,
      grant: serializeOwnerDisclosureGrant(grant, { publicHandle }),
      recipient_delivery: {
        grant_handle: publicHandle,
        recipient_challenge_required: true,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        code: "INVALID_DISCLOSURE_GRANT_REQUEST",
        error: error.message || "Invalid disclosure grant request.",
      },
      { status: 400 }
    );
  }
}

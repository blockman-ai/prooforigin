import { NextResponse } from "next/server";
import { authorizeDisclosureOwnerRequest } from "../../../../../lib/vaultDisclosureAuthority";
import {
  DISCLOSURE_ACTOR_TYPES,
  DISCLOSURE_EVENT_RESULTS,
  DISCLOSURE_GRANT_EVENT_TYPES,
  DISCLOSURE_GRANT_STATUS_REVOKED,
  serializeOwnerDisclosureGrant,
  validateGrantId,
} from "../../../../../lib/vaultDisclosureGrant";
import {
  appendDisclosureGrantEvent,
  getDisclosureGrantRecordByIdForVault,
  revokeActiveDisclosureAccessSessionsForGrant,
  revokeDisclosureGrantRecord,
} from "../../../../../lib/vaultDisclosureGrantStore";

export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
  try {
    const grantId = validateGrantId(params?.id);
    const bodyText = await req.text();
    const authority = await authorizeDisclosureOwnerRequest(req, {
      method: "POST",
      path: `/api/vault/disclosure-grants/${grantId}/revoke`,
      bodyText,
    });

    if (!authority.ok) {
      return NextResponse.json(authority.payload, { status: authority.status });
    }

    const { grant: existing, error: lookupError } = await getDisclosureGrantRecordByIdForVault({
      grantId,
      vaultRefHash: authority.vaultRefHash,
    });

    if (lookupError) {
      return NextResponse.json(
        {
          success: false,
          code: "DISCLOSURE_GRANT_LOOKUP_FAILED",
          error: lookupError.message || "Unable to load disclosure grant.",
        },
        { status: 502 }
      );
    }

    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          code: "DISCLOSURE_GRANT_NOT_FOUND",
          error: "Disclosure grant not found.",
        },
        { status: 404 }
      );
    }

    if (existing.status === DISCLOSURE_GRANT_STATUS_REVOKED) {
      return NextResponse.json({
        success: true,
        grant: serializeOwnerDisclosureGrant(existing),
        idempotent: true,
      });
    }

    const { grant, error } = await revokeDisclosureGrantRecord(grantId);
    if (error || !grant) {
      return NextResponse.json(
        {
          success: false,
          code: "DISCLOSURE_GRANT_REVOKE_FAILED",
          error: error?.message || "Unable to revoke disclosure grant.",
        },
        { status: 502 }
      );
    }

    const sessionsResult = await revokeActiveDisclosureAccessSessionsForGrant(grant.grant_id);
    if (sessionsResult.error) {
      return NextResponse.json(
        {
          success: false,
          code: "DISCLOSURE_SESSION_REVOKE_FAILED",
          error: sessionsResult.error.message || "Unable to revoke disclosure access sessions.",
        },
        { status: 502 }
      );
    }

    const eventResult = await appendDisclosureGrantEvent({
      grantRef: grant.grant_id,
      eventType: DISCLOSURE_GRANT_EVENT_TYPES.REVOKED,
      actorType: DISCLOSURE_ACTOR_TYPES.OWNER,
      result: DISCLOSURE_EVENT_RESULTS.REVOKED,
      reasonCode: "owner_revoked",
      metadata: {
        revoked_sessions: sessionsResult.sessions.length,
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

    return NextResponse.json({
      success: true,
      grant: serializeOwnerDisclosureGrant(grant),
      revoked_sessions: sessionsResult.sessions.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        code: "INVALID_GRANT_ID",
        error: error.message || "grant_id must be a valid UUID.",
      },
      { status: 400 }
    );
  }
}

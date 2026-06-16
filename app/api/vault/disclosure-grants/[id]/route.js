import { NextResponse } from "next/server";
import { authorizeDisclosureOwnerRequest } from "../../../../lib/vaultDisclosureAuthority";
import {
  serializeOwnerDisclosureGrant,
  validateGrantId,
} from "../../../../lib/vaultDisclosureGrant";
import { getDisclosureGrantRecordByIdForVault } from "../../../../lib/vaultDisclosureGrantStore";

export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  try {
    const grantId = validateGrantId(params?.id);
    const authority = await authorizeDisclosureOwnerRequest(req, {
      method: "GET",
      path: `/api/vault/disclosure-grants/${grantId}`,
      bodyText: "",
    });

    if (!authority.ok) {
      return NextResponse.json(authority.payload, { status: authority.status });
    }

    const { grant, error } = await getDisclosureGrantRecordByIdForVault({
      grantId,
      vaultRefHash: authority.vaultRefHash,
    });

    if (error) {
      return NextResponse.json(
        {
          success: false,
          code: "DISCLOSURE_GRANT_LOOKUP_FAILED",
          error: error.message || "Unable to load disclosure grant.",
        },
        { status: 502 }
      );
    }

    if (!grant) {
      return NextResponse.json(
        {
          success: false,
          code: "DISCLOSURE_GRANT_NOT_FOUND",
          error: "Disclosure grant not found.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      grant: serializeOwnerDisclosureGrant(grant),
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

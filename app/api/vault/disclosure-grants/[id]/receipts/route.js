import { NextResponse } from "next/server";
import { authorizeDisclosureOwnerRequest } from "../../../../../lib/vaultDisclosureAuthority";
import { validateGrantId } from "../../../../../lib/vaultDisclosureGrant";
import { getDisclosureGrantRecordByIdForVault } from "../../../../../lib/vaultDisclosureGrantStore";
import { serializeOwnerDisclosureReceipt } from "../../../../../lib/vaultDisclosureReceipt";
import { listDisclosureReceiptsByGrantRef } from "../../../../../lib/vaultDisclosurePolicyStore";

export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  try {
    const grantId = validateGrantId(params?.id);
    const authority = await authorizeDisclosureOwnerRequest(req, {
      method: "GET",
      path: `/api/vault/disclosure-grants/${grantId}/receipts`,
      bodyText: "",
    });

    if (!authority.ok) {
      return NextResponse.json(authority.payload, { status: authority.status });
    }

    const { grant, error: grantError } = await getDisclosureGrantRecordByIdForVault({
      grantId,
      vaultRefHash: authority.vaultRefHash,
    });

    if (grantError) {
      return NextResponse.json(
        {
          success: false,
          code: "DISCLOSURE_GRANT_LOOKUP_FAILED",
          error: grantError.message || "Unable to load disclosure grant.",
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

    const { receipts, error } = await listDisclosureReceiptsByGrantRef(grantId);
    if (error) {
      return NextResponse.json(
        {
          success: false,
          code: "DISCLOSURE_RECEIPT_LOOKUP_FAILED",
          error: error.message || "Unable to load disclosure receipts.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      receipts: receipts.map(serializeOwnerDisclosureReceipt),
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

import { NextResponse } from "next/server";
import { authorizeDisclosureOwnerRequest } from "../../../../lib/vaultDisclosureAuthority";
import { issueDisclosureConfirmationNonce } from "../../../../lib/vaultDisclosureConfirmation";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const bodyText = await req.text();
    const authority = await authorizeDisclosureOwnerRequest(req, {
      method: "POST",
      path: "/api/vault/disclosure-policies/confirm",
      bodyText,
    });

    if (!authority.ok) {
      return NextResponse.json(authority.payload, { status: authority.status });
    }

    const confirmation = await issueDisclosureConfirmationNonce({
      vaultRefHash: authority.vaultRefHash,
      deviceRefHash: authority.deviceRefHash,
      purpose: "disclosure_policy",
    });

    return NextResponse.json({
      success: true,
      confirmation_nonce: confirmation.confirmationNonce,
      expires_at: confirmation.expiresAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        code: "DISCLOSURE_POLICY_CONFIRMATION_FAILED",
        error: error.message || "Unable to issue disclosure policy confirmation.",
      },
      { status: 400 }
    );
  }
}

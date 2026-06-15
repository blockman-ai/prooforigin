import { NextResponse } from "next/server";
import { authorizeDisclosureOwnerRequest } from "../../../../lib/vaultDisclosureAuthority";
import { issueDisclosureConfirmationNonce } from "../../../../lib/vaultDisclosureConfirmation";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const bodyText = await req.text();
    const authority = await authorizeDisclosureOwnerRequest(req, {
      method: "POST",
      path: "/api/vault/disclosure-grants/confirm",
      bodyText,
    });

    if (!authority.ok) {
      return NextResponse.json(authority.payload, { status: authority.status });
    }

    const confirmation = issueDisclosureConfirmationNonce({
      vaultRefHash: authority.vaultRefHash,
      deviceRefHash: authority.deviceRefHash,
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
        code: "DISCLOSURE_CONFIRMATION_FAILED",
        error: error.message || "Unable to issue disclosure confirmation.",
      },
      { status: 400 }
    );
  }
}

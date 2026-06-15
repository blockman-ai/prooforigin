import { NextResponse } from "next/server";
import { authorizeDisclosureOwnerRequest } from "../../../lib/vaultDisclosureAuthority";
import { serializeOwnerDisclosureGrant } from "../../../lib/vaultDisclosureGrant";
import { listDisclosureGrantRecordsByVaultRef } from "../../../lib/vaultDisclosureGrantStore";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const authority = await authorizeDisclosureOwnerRequest(req, {
    method: "GET",
    path: "/api/vault/disclosure-grants",
    bodyText: "",
  });

  if (!authority.ok) {
    return NextResponse.json(authority.payload, { status: authority.status });
  }

  const { grants, error } = await listDisclosureGrantRecordsByVaultRef(authority.vaultRefHash);
  if (error) {
    return NextResponse.json(
      {
        success: false,
        code: "DISCLOSURE_GRANT_LIST_FAILED",
        error: error.message || "Unable to list disclosure grants.",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    success: true,
    grants: grants.map((grant) => serializeOwnerDisclosureGrant(grant)),
  });
}

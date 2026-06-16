import { NextResponse } from "next/server";
import { authorizeDisclosureOwnerRequest } from "../../../../lib/vaultDisclosureAuthority";
import {
  serializeOwnerDisclosurePolicy,
  validatePolicyId,
} from "../../../../lib/vaultDisclosurePolicy";
import { getDisclosurePolicyRecordByIdForVault } from "../../../../lib/vaultDisclosurePolicyStore";

export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  try {
    const policyId = validatePolicyId(params?.id);
    const authority = await authorizeDisclosureOwnerRequest(req, {
      method: "GET",
      path: `/api/vault/disclosure-policies/${policyId}`,
      bodyText: "",
    });

    if (!authority.ok) {
      return NextResponse.json(authority.payload, { status: authority.status });
    }

    const { policy, error } = await getDisclosurePolicyRecordByIdForVault({
      policyId,
      vaultRefHash: authority.vaultRefHash,
    });

    if (error) {
      return NextResponse.json(
        {
          success: false,
          code: "DISCLOSURE_POLICY_LOOKUP_FAILED",
          error: error.message || "Unable to load disclosure policy.",
        },
        { status: 502 }
      );
    }

    if (!policy) {
      return NextResponse.json(
        {
          success: false,
          code: "DISCLOSURE_POLICY_NOT_FOUND",
          error: "Disclosure policy not found.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      policy: serializeOwnerDisclosurePolicy(policy),
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

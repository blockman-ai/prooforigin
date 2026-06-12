import { NextResponse } from "next/server";
import { authorizeProofOriginOpsRequest } from "../../../../lib/proofOriginOpsAuth.js";
import { buildSentinelSnapshot } from "../../../../lib/sentinelSnapshot.js";
import {
  auditVaultCiphertextStorage,
  cleanupExpiredVaultNonces,
  verifyVaultBucketPrivacy,
} from "../../../../lib/vaultOps.js";
import { isVaultAdminConfigured } from "../../../../lib/vaultAdmin.js";
import { buildGlobalApiSecurityHeaders } from "../../../../lib/vaultSecurityHeaders.js";

export const dynamic = "force-dynamic";

function withSecurityHeaders(response) {
  for (const header of buildGlobalApiSecurityHeaders()) {
    response.headers.set(header.key, header.value);
  }
  return response;
}

export async function POST(req) {
  const auth = authorizeProofOriginOpsRequest(req);
  if (!auth.authorized) {
    const status = auth.reason === "ops_secret_not_configured" ? 503 : 401;
    return withSecurityHeaders(
      NextResponse.json(
        {
          success: false,
          error: auth.reason,
        },
        { status }
      )
    );
  }

  if (!isVaultAdminConfigured()) {
    return withSecurityHeaders(
      NextResponse.json(
        {
          success: false,
          error: "vault_admin_not_configured",
        },
        { status: 503 }
      )
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "audit").trim();

    if (action === "cleanup_nonces") {
      const deletedCount = await cleanupExpiredVaultNonces();
      return withSecurityHeaders(
        NextResponse.json({
          success: true,
          action,
          deleted_nonce_count: deletedCount,
        })
      );
    }

    if (action === "audit_storage") {
      const [bucket, storage] = await Promise.all([
        verifyVaultBucketPrivacy(),
        auditVaultCiphertextStorage(),
      ]);

      return withSecurityHeaders(
        NextResponse.json({
          success: true,
          action,
          bucket,
          storage,
        })
      );
    }

    if (action === "sentinel_snapshot") {
      const snapshot = await buildSentinelSnapshot();
      return withSecurityHeaders(
        NextResponse.json({
          success: true,
          action,
          snapshot,
        })
      );
    }

    return withSecurityHeaders(
      NextResponse.json(
        {
          success: false,
          error: "unsupported_action",
          allowed_actions: ["audit_storage", "cleanup_nonces", "sentinel_snapshot"],
        },
        { status: 400 }
      )
    );
  } catch (error) {
    return withSecurityHeaders(
      NextResponse.json(
        {
          success: false,
          error: error.message || "Vault ops action failed.",
        },
        { status: 500 }
      )
    );
  }
}

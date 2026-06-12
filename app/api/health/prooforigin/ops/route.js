import { NextResponse } from "next/server";
import { authorizeProofOriginOpsRequest } from "../../../../lib/proofOriginOpsAuth.js";
import { buildSentinelSnapshot } from "../../../../lib/sentinelSnapshot.js";
import {
  persistSentinelSnapshot,
  pinSentinelBaseline,
} from "../../../../lib/sentinelSnapshotHistory.js";
import { getSentinelCounters } from "../../../../lib/sentinelCounters.js";
import { buildSentinelTrend } from "../../../../lib/sentinelTrend.js";
import {
  auditVaultCiphertextStorage,
  cleanupExpiredVaultNonces,
  verifyVaultBucketPrivacy,
} from "../../../../lib/vaultOps.js";
import { isVaultAdminConfigured } from "../../../../lib/vaultAdmin.js";
import { buildGlobalApiSecurityHeaders } from "../../../../lib/vaultSecurityHeaders.js";

export const SENTINEL_OPS_ACTIONS = [
  "audit_storage",
  "cleanup_nonces",
  "sentinel_snapshot",
  "sentinel_persist",
  "sentinel_trend",
  "sentinel_pin_baseline",
  "sentinel_counters",
];

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
    const body = {
      success: false,
      error: auth.reason,
    };

    if (auth.diagnostics) {
      body.auth_debug = auth.diagnostics;
    }

    return withSecurityHeaders(
      NextResponse.json(body, { status })
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

    if (action === "sentinel_persist") {
      const snapshot = await buildSentinelSnapshot();
      const persisted = await persistSentinelSnapshot({
        snapshot,
        label: body.label,
        source: body.source || "ops",
      });

      if (!persisted.ok) {
        return withSecurityHeaders(
          NextResponse.json(
            {
              success: false,
              action,
              error: persisted.error,
              message: persisted.message || null,
            },
            { status: persisted.error === "supabase_not_configured" ? 503 : 500 }
          )
        );
      }

      return withSecurityHeaders(
        NextResponse.json({
          success: true,
          action,
          record: persisted.record,
        })
      );
    }

    if (action === "sentinel_pin_baseline") {
      const snapshot = await buildSentinelSnapshot();
      const pinned = await pinSentinelBaseline({
        snapshot,
        label: body.label || body.baseline_label || "baseline_v1",
        source: body.source || "ops",
      });

      if (!pinned.ok) {
        return withSecurityHeaders(
          NextResponse.json(
            {
              success: false,
              action,
              error: pinned.error,
              message: pinned.message || null,
            },
            { status: pinned.error === "supabase_not_configured" ? 503 : 500 }
          )
        );
      }

      return withSecurityHeaders(
        NextResponse.json({
          success: true,
          action,
          already_pinned: pinned.already_pinned,
          record: pinned.record,
        })
      );
    }

    if (action === "sentinel_trend") {
      const trend = await buildSentinelTrend({
        baselineLabel: body.baseline_label || body.label || "baseline_v1",
      });

      return withSecurityHeaders(
        NextResponse.json({
          success: true,
          action,
          trend,
        })
      );
    }

    if (action === "sentinel_counters") {
      const result = await getSentinelCounters(body.prefix ?? null);

      if (!result.ok) {
        return withSecurityHeaders(
          NextResponse.json(
            {
              success: false,
              action,
              error: result.error,
              counters: [],
            },
            { status: result.error === "supabase_not_configured" ? 503 : 500 }
          )
        );
      }

      return withSecurityHeaders(
        NextResponse.json({
          success: true,
          action,
          prefix: body.prefix ?? null,
          counters: result.counters,
        })
      );
    }

    return withSecurityHeaders(
      NextResponse.json(
        {
          success: false,
          error: "unsupported_action",
          allowed_actions: SENTINEL_OPS_ACTIONS,
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

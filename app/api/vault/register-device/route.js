import { NextResponse } from "next/server";
import {
  isVaultAdminConfigured,
  registerVaultDevice,
  vaultDeviceRegistered,
} from "../../../lib/vaultAdmin";
import {
  checkRateLimit,
  getVaultRequestClientIp,
  VAULT_REGISTRATION_DEVICE_LIMIT,
  VAULT_REGISTRATION_DEVICE_WINDOW_MS,
  VAULT_REGISTRATION_IP_LIMIT,
  VAULT_REGISTRATION_IP_WINDOW_MS,
} from "../../../lib/vaultRateLimit";
import {
  recordVaultAuthSentinelCounter,
  VAULT_AUTH_SENTINEL_COUNTERS,
} from "../../../lib/vaultAuthSentinelCounters";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i;

function storageNotConfiguredResponse() {
  return NextResponse.json(
    {
      success: false,
      code: "STORAGE_NOT_CONFIGURED",
      error: "Vault storage is not configured. Set Supabase service role credentials.",
    },
    { status: 503 }
  );
}

function rateLimitResponse(retryAfterMs) {
  const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return NextResponse.json(
    {
      success: false,
      code: "RATE_LIMITED",
      error: "Too many vault device registration attempts. Try again later.",
      retry_after_seconds: retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
      },
    }
  );
}

export async function POST(req) {
  try {
    if (!isVaultAdminConfigured()) {
      return storageNotConfiguredResponse();
    }

    const clientIp = getVaultRequestClientIp(req);
    const ipLimit = checkRateLimit({
      key: `vault-register:ip:${clientIp}`,
      limit: VAULT_REGISTRATION_IP_LIMIT,
      windowMs: VAULT_REGISTRATION_IP_WINDOW_MS,
    });

    if (!ipLimit.allowed) {
      recordVaultAuthSentinelCounter(VAULT_AUTH_SENTINEL_COUNTERS.RATE_LIMITED);
      return rateLimitResponse(ipLimit.retryAfterMs);
    }

    const bodyText = await req.text();
    const body = bodyText ? JSON.parse(bodyText) : {};
    const vaultDeviceId = String(body?.vault_device_id || "").trim();
    const authSecretHash = String(body?.auth_secret_hash || "").trim().toLowerCase();

    if (!UUID_PATTERN.test(vaultDeviceId)) {
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_REQUEST",
          error: "vault_device_id must be a valid UUID.",
        },
        { status: 400 }
      );
    }

    const deviceLimit = checkRateLimit({
      key: `vault-register:device:${vaultDeviceId}`,
      limit: VAULT_REGISTRATION_DEVICE_LIMIT,
      windowMs: VAULT_REGISTRATION_DEVICE_WINDOW_MS,
    });

    if (!deviceLimit.allowed) {
      recordVaultAuthSentinelCounter(VAULT_AUTH_SENTINEL_COUNTERS.RATE_LIMITED);
      return rateLimitResponse(deviceLimit.retryAfterMs);
    }

    if (!SHA256_HEX_PATTERN.test(authSecretHash)) {
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_REQUEST",
          error: "auth_secret_hash must be a 64-character SHA-256 hex value.",
        },
        { status: 400 }
      );
    }

    const alreadyRegistered = await vaultDeviceRegistered(vaultDeviceId);
    if (alreadyRegistered) {
      return NextResponse.json(
        {
          success: false,
          code: "DEVICE_ALREADY_REGISTERED",
          error: "An active vault device registration already exists for this device id.",
        },
        { status: 409 }
      );
    }

    const { registration, error } = await registerVaultDevice({
      vaultDeviceId,
      authSecretHash,
      metadata: {
        registration_source: "prooforigin-vault-v0.2.5",
      },
    });

    if (error) {
      const isDuplicate = error.code === "23505";
      return NextResponse.json(
        {
          success: false,
          code: isDuplicate ? "DEVICE_ALREADY_REGISTERED" : "DEVICE_REGISTRATION_FAILED",
          error:
            error.message ||
            (isDuplicate
              ? "An active vault device registration already exists for this device id."
              : "Unable to register vault device."),
        },
        { status: isDuplicate ? 409 : 502 }
      );
    }

    return NextResponse.json({
      success: true,
      registration: {
        vault_device_id: registration.vault_device_id,
        device_public_id: registration.device_public_id,
        created_at: registration.created_at,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, code: "INVALID_REQUEST", error: "Invalid vault device registration request." },
      { status: 400 }
    );
  }
}

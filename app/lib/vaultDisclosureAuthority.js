import {
  getBoundVaultDeviceRegistration,
  hasVerifiedVaultOwnershipForDevice,
  isVaultAdminConfigured,
} from "./vaultAdmin.js";
import {
  authorizeVaultRequest,
  vaultAuthFailureResponse,
} from "./vaultAuth.js";
import { buildOpaqueRefHash } from "./vaultDisclosureGrant.js";

export function storageNotConfiguredPayload() {
  return {
    success: false,
    code: "STORAGE_NOT_CONFIGURED",
    error: "Vault storage is not configured. Set Supabase service role credentials.",
  };
}

export async function authorizeDisclosureOwnerRequest(req, { method, path, bodyText = "" }) {
  const auth = await authorizeVaultRequest(req, { method, path, bodyText });
  if (!auth.ok) {
    return {
      ok: false,
      status: auth.code === "STORAGE_NOT_CONFIGURED" ? 503 : auth.status,
      payload: vaultAuthFailureResponse(auth),
    };
  }

  if (!isVaultAdminConfigured()) {
    return {
      ok: false,
      status: 503,
      payload: storageNotConfiguredPayload(),
    };
  }

  const { registration, error: registrationError } = await getBoundVaultDeviceRegistration(
    auth.vault_device_id
  );
  if (registrationError) {
    return {
      ok: false,
      status: 502,
      payload: {
        success: false,
        code: "DISCLOSURE_DEVICE_BINDING_LOOKUP_FAILED",
        error: registrationError.message || "Unable to determine disclosure authority.",
      },
    };
  }

  if (!registration?.vault_id) {
    return {
      ok: false,
      status: 403,
      payload: {
        success: false,
        code: "VAULT_DEVICE_NOT_BOUND",
        error: "A bound vault device is required before creating disclosure grants.",
      },
    };
  }

  const { verified, error: verificationError } = await hasVerifiedVaultOwnershipForDevice({
    vaultId: registration.vault_id,
    vaultDeviceId: auth.vault_device_id,
  });
  if (verificationError) {
    return {
      ok: false,
      status: 502,
      payload: {
        success: false,
        code: "DISCLOSURE_OWNERSHIP_LOOKUP_FAILED",
        error: verificationError.message || "Unable to determine ownership verification state.",
      },
    };
  }

  if (!verified) {
    return {
      ok: false,
      status: 403,
      payload: {
        success: false,
        code: "OWNERSHIP_VERIFICATION_REQUIRED",
        error: "Vault ownership verification is required before disclosure grants.",
      },
    };
  }

  return {
    ok: true,
    auth,
    registration,
    vaultRefHash: buildOpaqueRefHash(registration.vault_id, "vault-ref"),
    deviceRefHash: buildOpaqueRefHash(auth.vault_device_id, "device-ref"),
  };
}

import crypto from "crypto";

export const VAULT_AUTH_SKEW_MS = 5 * 60 * 1000;
export const VAULT_AUTH_HEADER_DEVICE_ID = "x-prooforigin-vault-device-id";
export const VAULT_AUTH_HEADER_TIMESTAMP = "x-prooforigin-vault-timestamp";
export const VAULT_AUTH_HEADER_BODY_HASH = "x-prooforigin-vault-body-hash";
export const VAULT_AUTH_HEADER_SIGNATURE = "x-prooforigin-vault-signature";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i;

export function hashVaultRequestBody(bodyText = "") {
  return crypto.createHash("sha256").update(bodyText).digest("hex");
}

function readVaultAuthHeaders(req) {
  return {
    vault_device_id: req.headers.get(VAULT_AUTH_HEADER_DEVICE_ID)?.trim() || "",
    timestamp: req.headers.get(VAULT_AUTH_HEADER_TIMESTAMP)?.trim() || "",
    body_hash: req.headers.get(VAULT_AUTH_HEADER_BODY_HASH)?.trim() || "",
    signature: req.headers.get(VAULT_AUTH_HEADER_SIGNATURE)?.trim() || "",
  };
}

export function authorizeVaultRequest(req, { bodyText = "" } = {}) {
  const headers = readVaultAuthHeaders(req);

  if (
    !headers.vault_device_id ||
    !headers.timestamp ||
    !headers.body_hash ||
    !headers.signature
  ) {
    return {
      ok: false,
      status: 401,
      code: "VAULT_AUTH_REQUIRED",
      message: "Vault authentication headers are required.",
    };
  }

  if (!UUID_PATTERN.test(headers.vault_device_id)) {
    return {
      ok: false,
      status: 401,
      code: "VAULT_AUTH_REQUIRED",
      message: "Vault device id must be a valid UUID.",
    };
  }

  const timestamp = Number(headers.timestamp);
  if (!Number.isFinite(timestamp)) {
    return {
      ok: false,
      status: 401,
      code: "VAULT_AUTH_REQUIRED",
      message: "Vault timestamp must be numeric.",
    };
  }

  if (Math.abs(Date.now() - timestamp) > VAULT_AUTH_SKEW_MS) {
    return {
      ok: false,
      status: 401,
      code: "VAULT_AUTH_REQUIRED",
      message: "Vault timestamp is outside the allowed window.",
    };
  }

  if (!SHA256_HEX_PATTERN.test(headers.body_hash)) {
    return {
      ok: false,
      status: 401,
      code: "VAULT_AUTH_REQUIRED",
      message: "Vault body hash must be a 64-character SHA-256 hex value.",
    };
  }

  if (!SHA256_HEX_PATTERN.test(headers.signature)) {
    return {
      ok: false,
      status: 401,
      code: "VAULT_AUTH_REQUIRED",
      message: "Vault signature must be a 64-character hex value.",
    };
  }

  const computedBodyHash = hashVaultRequestBody(bodyText);
  if (headers.body_hash.toLowerCase() !== computedBodyHash) {
    return {
      ok: false,
      status: 401,
      code: "VAULT_AUTH_REQUIRED",
      message: "Vault body hash does not match the request body.",
    };
  }

  // TODO(V0.2+): Verify HMAC-SHA256 signature against vault_auth_secret stored
  // in a server-side vault_device_registrations table. The secret currently lives
  // only in browser localStorage, so this commit performs header presence and
  // format checks only — NOT production-secure authentication.

  return {
    ok: true,
    vault_device_id: headers.vault_device_id,
  };
}

export function vaultAuthFailureResponse(auth) {
  return {
    success: false,
    code: auth.code || "VAULT_AUTH_REQUIRED",
    error: auth.message || "Vault authentication failed.",
  };
}

export function vaultErrorResponse({ code, message, status = 400 }) {
  return {
    response: {
      success: false,
      code,
      error: message,
    },
    status,
  };
}

export function isVaultDocumentCompromised(document) {
  return Boolean(document?.compromised_at);
}

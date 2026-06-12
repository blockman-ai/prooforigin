import crypto from "crypto";

export const PROOFORIGIN_OPS_SECRET_ENV = "PROOFORIGIN_OPS_SECRET";
export const PROOFORIGIN_OPS_AUTH_HEADER = "Authorization";
export const PROOFORIGIN_OPS_AUTH_FORMAT = "Authorization: Bearer <secret>";
export const PROOFORIGIN_OPS_DEBUG_HEADER = "x-prooforigin-ops-debug";

function readExpectedOpsSecret() {
  const raw = process.env[PROOFORIGIN_OPS_SECRET_ENV];
  if (raw == null) {
    return { raw: "", expected: "", trimApplied: false };
  }

  const value = String(raw);
  const expected = value.trim();
  return {
    raw: value,
    expected,
    trimApplied: expected !== value,
  };
}

function readBearerToken(req) {
  const header = req.headers.get("authorization") || "";
  const headerPresent = Boolean(header);
  const bearerPrefixPresent = /^Bearer\s+/i.test(header);
  const tokenRaw = bearerPrefixPresent ? header.replace(/^Bearer\s+/i, "") : "";
  const token = tokenRaw.trim();

  return {
    header,
    headerPresent,
    bearerPrefixPresent,
    tokenRaw,
    token,
    trimApplied: token !== tokenRaw,
  };
}

export function sha256Prefix(value) {
  if (value == null || value === "") {
    return null;
  }

  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex").slice(0, 8);
}

export function isOpsAuthDebugRequested(req) {
  return String(req.headers.get(PROOFORIGIN_OPS_DEBUG_HEADER) || "").trim() === "1";
}

export function isProofOriginOpsConfigured() {
  const { expected } = readExpectedOpsSecret();
  return Boolean(expected && !expected.includes("YOUR_"));
}

export function buildProofOriginOpsAuthDiagnostics(req, { includeHashPrefixes = false } = {}) {
  const { expected, trimApplied: envTrimApplied } = readExpectedOpsSecret();
  const bearer = readBearerToken(req);

  const diagnostics = {
    env_variable: PROOFORIGIN_OPS_SECRET_ENV,
    expected_header_format: PROOFORIGIN_OPS_AUTH_FORMAT,
    env_present: isProofOriginOpsConfigured(),
    header_present: bearer.headerPresent,
    bearer_prefix_present: bearer.bearerPrefixPresent,
    token_length: bearer.token ? bearer.token.length : null,
    expected_length: expected ? expected.length : null,
    trim_applied: envTrimApplied || bearer.trimApplied,
  };

  if (includeHashPrefixes) {
    diagnostics.token_sha256_prefix = sha256Prefix(bearer.token);
    diagnostics.expected_sha256_prefix = sha256Prefix(expected);
  }

  return diagnostics;
}

export function authorizeProofOriginOpsRequest(req) {
  const debug = isOpsAuthDebugRequested(req);
  const includeDiagnostics = (reason) =>
    debug
      ? buildProofOriginOpsAuthDiagnostics(req, {
          includeHashPrefixes: reason === "invalid_token" || reason === "missing_bearer_token",
        })
      : undefined;

  if (!isProofOriginOpsConfigured()) {
    return {
      authorized: false,
      reason: "ops_secret_not_configured",
      diagnostics: includeDiagnostics("ops_secret_not_configured"),
    };
  }

  const { expected } = readExpectedOpsSecret();
  const bearer = readBearerToken(req);

  if (!bearer.token) {
    return {
      authorized: false,
      reason: "missing_bearer_token",
      diagnostics: includeDiagnostics("missing_bearer_token"),
    };
  }

  const left = Buffer.from(bearer.token, "utf8");
  const right = Buffer.from(expected, "utf8");

  if (left.length !== right.length) {
    return {
      authorized: false,
      reason: "invalid_token",
      length_mismatch: true,
      diagnostics: includeDiagnostics("invalid_token"),
    };
  }

  try {
    if (!crypto.timingSafeEqual(left, right)) {
      return {
        authorized: false,
        reason: "invalid_token",
        diagnostics: includeDiagnostics("invalid_token"),
      };
    }
  } catch {
    return {
      authorized: false,
      reason: "invalid_token",
      diagnostics: includeDiagnostics("invalid_token"),
    };
  }

  return {
    authorized: true,
    reason: null,
  };
}

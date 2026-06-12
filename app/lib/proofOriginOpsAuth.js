import crypto from "crypto";

export function isProofOriginOpsConfigured() {
  const secret = process.env.PROOFORIGIN_OPS_SECRET;
  return Boolean(secret && String(secret).trim() && !String(secret).includes("YOUR_"));
}

export function authorizeProofOriginOpsRequest(req) {
  if (!isProofOriginOpsConfigured()) {
    return {
      authorized: false,
      reason: "ops_secret_not_configured",
    };
  }

  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const expected = String(process.env.PROOFORIGIN_OPS_SECRET);

  if (!token) {
    return {
      authorized: false,
      reason: "missing_bearer_token",
    };
  }

  try {
    const left = Buffer.from(token);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
      return {
        authorized: false,
        reason: "invalid_token",
      };
    }
  } catch {
    return {
      authorized: false,
      reason: "invalid_token",
    };
  }

  return {
    authorized: true,
    reason: null,
  };
}

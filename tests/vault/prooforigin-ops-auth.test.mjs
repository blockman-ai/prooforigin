import assert from "node:assert/strict";
import { test } from "node:test";
import {
  authorizeProofOriginOpsRequest,
  isProofOriginOpsConfigured,
} from "../../app/lib/proofOriginOpsAuth.js";

function makeRequest(token) {
  return {
    headers: {
      get(name) {
        if (name.toLowerCase() === "authorization") {
          return token ? `Bearer ${token}` : "";
        }
        return "";
      },
    },
  };
}

test("ops auth rejects when secret is not configured", () => {
  const original = process.env.PROOFORIGIN_OPS_SECRET;
  delete process.env.PROOFORIGIN_OPS_SECRET;

  try {
    assert.equal(isProofOriginOpsConfigured(), false);
    const result = authorizeProofOriginOpsRequest(makeRequest("anything"));
    assert.equal(result.authorized, false);
    assert.equal(result.reason, "ops_secret_not_configured");
  } finally {
    if (original !== undefined) {
      process.env.PROOFORIGIN_OPS_SECRET = original;
    }
  }
});

test("ops auth accepts valid bearer token", () => {
  const original = process.env.PROOFORIGIN_OPS_SECRET;
  process.env.PROOFORIGIN_OPS_SECRET = "test-ops-secret";

  try {
    const ok = authorizeProofOriginOpsRequest(makeRequest("test-ops-secret"));
    assert.equal(ok.authorized, true);

    const bad = authorizeProofOriginOpsRequest(makeRequest("wrong-secret"));
    assert.equal(bad.authorized, false);
    assert.equal(bad.reason, "invalid_token");
  } finally {
    if (original === undefined) {
      delete process.env.PROOFORIGIN_OPS_SECRET;
    } else {
      process.env.PROOFORIGIN_OPS_SECRET = original;
    }
  }
});

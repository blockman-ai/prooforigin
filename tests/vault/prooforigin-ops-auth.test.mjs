import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  authorizeProofOriginOpsRequest,
  buildProofOriginOpsAuthDiagnostics,
  isProofOriginOpsConfigured,
  PROOFORIGIN_OPS_SECRET_ENV,
  sha256Prefix,
} from "../../app/lib/proofOriginOpsAuth.js";

function makeRequest(token, { debug = false, authorizationHeader = null } = {}) {
  return {
    headers: {
      get(name) {
        const key = name.toLowerCase();
        if (key === "authorization") {
          if (authorizationHeader !== null) {
            return authorizationHeader;
          }
          return token ? `Bearer ${token}` : "";
        }
        if (key === "x-prooforigin-ops-debug") {
          return debug ? "1" : null;
        }
        return "";
      },
    },
  };
}

function withOpsSecret(secret, fn) {
  const original = process.env[PROOFORIGIN_OPS_SECRET_ENV];
  if (secret === undefined) {
    delete process.env[PROOFORIGIN_OPS_SECRET_ENV];
  } else {
    process.env[PROOFORIGIN_OPS_SECRET_ENV] = secret;
  }

  try {
    return fn();
  } finally {
    if (original === undefined) {
      delete process.env[PROOFORIGIN_OPS_SECRET_ENV];
    } else {
      process.env[PROOFORIGIN_OPS_SECRET_ENV] = original;
    }
  }
}

test("ops auth rejects when secret is not configured", () => {
  withOpsSecret(undefined, () => {
    assert.equal(isProofOriginOpsConfigured(), false);
    const result = authorizeProofOriginOpsRequest(makeRequest("anything"));
    assert.equal(result.authorized, false);
    assert.equal(result.reason, "ops_secret_not_configured");
  });
});

test("ops auth accepts exact secret", () => {
  withOpsSecret("test-ops-secret", () => {
    const ok = authorizeProofOriginOpsRequest(makeRequest("test-ops-secret"));
    assert.equal(ok.authorized, true);
    assert.equal(ok.reason, null);
  });
});

test("ops auth accepts leading and trailing whitespace after trim", () => {
  withOpsSecret("  test-ops-secret  ", () => {
    const fromEnvTrim = authorizeProofOriginOpsRequest(makeRequest("test-ops-secret"));
    assert.equal(fromEnvTrim.authorized, true);

    const fromTokenTrim = authorizeProofOriginOpsRequest(makeRequest("  test-ops-secret  "));
    assert.equal(fromTokenTrim.authorized, true);
  });
});

test("ops auth rejects missing header with diagnostics when debug enabled", () => {
  withOpsSecret("test-ops-secret", () => {
    const result = authorizeProofOriginOpsRequest(makeRequest("", { debug: true }));
    assert.equal(result.authorized, false);
    assert.equal(result.reason, "missing_bearer_token");
    assert.equal(result.diagnostics.env_variable, PROOFORIGIN_OPS_SECRET_ENV);
    assert.equal(result.diagnostics.header_present, false);
    assert.equal(result.diagnostics.bearer_prefix_present, false);
    assert.equal(result.diagnostics.token_length, null);
    assert.equal(result.diagnostics.expected_length, "test-ops-secret".length);
  });
});

test("ops auth rejects wrong token with safe hash prefix only", () => {
  withOpsSecret("test-ops-secret", () => {
    const result = authorizeProofOriginOpsRequest(makeRequest("wrong-secret", { debug: true }));
    assert.equal(result.authorized, false);
    assert.equal(result.reason, "invalid_token");
    assert.equal(result.diagnostics.token_sha256_prefix, sha256Prefix("wrong-secret"));
    assert.equal(result.diagnostics.expected_sha256_prefix, sha256Prefix("test-ops-secret"));
    assert.match(result.diagnostics.token_sha256_prefix, /^[0-9a-f]{8}$/);
    assert.notEqual(result.diagnostics.token_sha256_prefix, result.diagnostics.expected_sha256_prefix);

    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes("test-ops-secret"), false);
    assert.equal(serialized.includes("wrong-secret"), false);
  });
});

test("ops auth handles length mismatch without timingSafeEqual throw", () => {
  withOpsSecret("short", () => {
    const result = authorizeProofOriginOpsRequest(
      makeRequest("definitely-not-the-short-secret", { debug: true })
    );
    assert.equal(result.authorized, false);
    assert.equal(result.reason, "invalid_token");
    assert.equal(result.length_mismatch, true);
    assert.notEqual(result.diagnostics.token_length, result.diagnostics.expected_length);
  });
});

test("ops auth omits diagnostics unless debug header is set", () => {
  withOpsSecret("test-ops-secret", () => {
    const silent = authorizeProofOriginOpsRequest(makeRequest("wrong-secret"));
    assert.equal(silent.diagnostics, undefined);

    const verbose = authorizeProofOriginOpsRequest(makeRequest("wrong-secret", { debug: true }));
    assert.ok(verbose.diagnostics);
    assert.equal(verbose.diagnostics.env_present, true);
  });
});

test("buildProofOriginOpsAuthDiagnostics never exposes full secret values", () => {
  withOpsSecret("super-secret-value", () => {
    const diagnostics = buildProofOriginOpsAuthDiagnostics(makeRequest("client-token"), {
      includeHashPrefixes: true,
    });
    const serialized = JSON.stringify(diagnostics);

    assert.equal(serialized.includes("super-secret-value"), false);
    assert.equal(serialized.includes("client-token"), false);
    assert.equal(
      diagnostics.expected_sha256_prefix,
      createHash("sha256").update("super-secret-value", "utf8").digest("hex").slice(0, 8)
    );
  });
});

test("ops auth accepts bearer prefix case-insensitively", () => {
  withOpsSecret("test-ops-secret", () => {
    const result = authorizeProofOriginOpsRequest(
      makeRequest(null, { authorizationHeader: "bearer test-ops-secret" })
    );
    assert.equal(result.authorized, true);
  });
});

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { POST } from "../../app/api/guide/route.js";
import { resetGuideRateLimitsForTests } from "../../app/lib/guideRateLimit.js";
import { validateGuideContext, validateGuideRequest } from "../../app/lib/guideSchema.js";
import { buildVaultGuideSafeContext } from "../../app/lib/guideSafeContext.js";

afterEach(() => {
  resetGuideRateLimitsForTests();
});

function buildGuideRequest(body, headers = {}) {
  return new Request("http://localhost/api/guide", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "203.0.113.10",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const safeContext = buildVaultGuideSafeContext({
  vaultLocked: true,
  mvkMode: true,
  pinConfigured: true,
  passkeyEnrolled: false,
  passkeySupported: false,
  recoveryConfigured: false,
  protectedViewActive: false,
});

test("safe vault context passes allowlist validation", () => {
  const validated = validateGuideContext(safeContext);

  assert.equal(validated.route, "/vault");
  assert.equal(validated.feature, "vault");
  assert.equal(validated.vault.locked, true);
  assert.equal(validated.vault.passkeySupported, false);
});

test("forbidden context keys are rejected", () => {
  assert.throws(
    () =>
      validateGuideRequest({
        question: "How do I unlock?",
        context: {
          route: "/vault",
          pin: "123456",
        },
      }),
    /Forbidden context key: pin/
  );

  assert.throws(
    () =>
      validateGuideRequest({
        question: "Help",
        context: {
          vault: {
            locked: true,
            masterVaultKey: "secret",
          },
        },
      }),
    /Forbidden context key: vault.masterVaultKey/
  );
});

test("questions longer than 500 characters are rejected", () => {
  assert.throws(
    () =>
      validateGuideRequest({
        question: "a".repeat(501),
        context: safeContext,
      }),
    /500 characters/
  );
});

test("POST /api/guide returns deterministic answer for safe request", async () => {
  const response = await POST(
    buildGuideRequest({
      question: "How do I unlock?",
      context: safeContext,
    })
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");

  const json = await response.json();
  assert.match(json.answer, /unlock/i);
  assert.match(json.disclaimer, /cannot see your vault contents/i);
  assert.equal(json.mode, "deterministic");
  assert.equal(json.topic, "vault-unlock");
});

test("POST /api/guide rejects unsupported request fields", async () => {
  const response = await POST(
    buildGuideRequest({
      question: "Help",
      context: safeContext,
      upload: true,
    })
  );

  assert.equal(response.status, 400);
});

test("guide rate limit returns 429 after burst", async () => {
  let lastStatus = 200;

  for (let i = 0; i < 6; i += 1) {
    const response = await POST(
      buildGuideRequest({
        question: "How do I unlock?",
        context: safeContext,
      })
    );
    lastStatus = response.status;
  }

  assert.equal(lastStatus, 429);
});

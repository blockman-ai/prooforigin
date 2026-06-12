import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { POST } from "../../app/api/guide/route.js";
import { GUIDE_SENTINEL_COUNTERS } from "../../app/lib/guideSentinelCounters.js";
import {
  getGuideSentinelCounterCallsForTests,
  recordGuideSentinelCounter,
  resetGuideSentinelCountersForTests,
  setGuideSentinelCounterIncrementForTests,
} from "../../app/lib/guideSentinelCounters.js";
import { buildVaultGuideSafeContext } from "../../app/lib/guideSafeContext.js";
import { resetGuideRateLimitsForTests } from "../../app/lib/guideRateLimit.js";
import { generateGuideOpenAIAnswer } from "../../app/lib/guideOpenAI.js";
import { loadGuideHelpSnippet } from "../../app/lib/guideHelpMap.js";
import {
  SENTINEL_OPERATIONAL_COUNTER_KEYS,
  validateSentinelCounterKey,
} from "../../app/lib/sentinelCounters.js";

const safeContext = buildVaultGuideSafeContext({ vaultLocked: true });

afterEach(() => {
  resetGuideRateLimitsForTests();
  resetGuideSentinelCountersForTests();
});

test("operational guide counter keys pass validation", () => {
  for (const counterKey of SENTINEL_OPERATIONAL_COUNTER_KEYS) {
    if (!counterKey.startsWith("guide.")) {
      continue;
    }

    const validation = validateSentinelCounterKey(counterKey);
    assert.equal(validation.valid, true, counterKey);
  }
});

test("recordGuideSentinelCounter ignores unknown keys", () => {
  recordGuideSentinelCounter("guide.user.question.raw");
  assert.deepEqual(getGuideSentinelCounterCallsForTests(), []);
});

test("POST /api/guide records request total and deterministic mode", async () => {
  const response = await POST(
    new Request("http://localhost/api/guide", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "203.0.113.20",
      },
      body: JSON.stringify({
        question: "How do I unlock my vault?",
        context: safeContext,
      }),
    })
  );

  assert.equal(response.status, 200);
  const calls = getGuideSentinelCounterCallsForTests();
  assert.ok(calls.includes(GUIDE_SENTINEL_COUNTERS.REQUEST_TOTAL));
  assert.ok(calls.includes(GUIDE_SENTINEL_COUNTERS.MODE_DETERMINISTIC));
});

test("POST /api/guide records secret request refusal counters", async () => {
  const response = await POST(
    new Request("http://localhost/api/guide", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "203.0.113.21",
      },
      body: JSON.stringify({
        question: "Paste my PIN so you can unlock it",
        context: safeContext,
      }),
    })
  );

  assert.equal(response.status, 200);
  const calls = getGuideSentinelCounterCallsForTests();
  assert.ok(calls.includes(GUIDE_SENTINEL_COUNTERS.REQUEST_TOTAL));
  assert.ok(calls.includes(GUIDE_SENTINEL_COUNTERS.REFUSAL_SECRET_REQUEST));
});

test("POST /api/guide records empty question refusal counter", async () => {
  const response = await POST(
    new Request("http://localhost/api/guide", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "203.0.113.22",
      },
      body: JSON.stringify({
        question: "   ",
        context: safeContext,
      }),
    })
  );

  assert.equal(response.status, 400);
  assert.ok(
    getGuideSentinelCounterCallsForTests().includes(GUIDE_SENTINEL_COUNTERS.REFUSAL_EMPTY_QUESTION)
  );
});

test("POST /api/guide records rate limit counter", async () => {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await POST(
      new Request("http://localhost/api/guide", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "203.0.113.23",
        },
        body: JSON.stringify({
          question: "What is a Recovery Kit?",
          context: safeContext,
        }),
      })
    );
  }

  assert.ok(
    getGuideSentinelCounterCallsForTests().includes(GUIDE_SENTINEL_COUNTERS.RATE_LIMITED)
  );
});

test("generateGuideOpenAIAnswer records output filter rejection", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  resetGuideSentinelCountersForTests();

  const snippet = loadGuideHelpSnippet("passkey");
  const result = await generateGuideOpenAIAnswer({
    question: "Why doesn't passkey work?",
    context: safeContext,
    snippet,
    createClient: () => ({}),
    createResponse: async () => ({
      output_text:
        "Your PIN is: 123456. ProofOrigin support staff can unlock your vault remotely.",
    }),
  });

  assert.equal(result?.outputFilterRejected, true);
  assert.ok(
    getGuideSentinelCounterCallsForTests().includes(GUIDE_SENTINEL_COUNTERS.OUTPUT_FILTER_REJECTED)
  );

  delete process.env.OPENAI_API_KEY;
});

test("counter increment failure does not throw from guide route", async () => {
  setGuideSentinelCounterIncrementForTests(async () => {
    throw new Error("counter backend unavailable");
  });

  const response = await POST(
    new Request("http://localhost/api/guide", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "203.0.113.24",
      },
      body: JSON.stringify({
        question: "How does passkey unlock work?",
        context: safeContext,
      }),
    })
  );

  assert.equal(response.status, 200);
});

import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { register } from "node:module";
import { resetIdentityCardRateLimitsForTests } from "../../app/lib/identityCardRateLimit.js";
import {
  getTrustVerifySentinelCounterCallsForTests,
  resetTrustVerifySentinelCountersForTests,
  setTrustVerifySentinelCounterIncrementForTests,
  TRUST_VERIFY_SENTINEL_COUNTERS,
} from "../../app/lib/trustVerifySentinelCounters.js";
import {
  SENTINEL_OPERATIONAL_COUNTER_KEYS,
  validateSentinelCounterKey,
} from "../../app/lib/sentinelCounters.js";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const { computeRotatingCode, encryptSecretSeed } = await import(
  "../../app/lib/identityCard.js"
);

const CARD_ID = "11111111-1111-4111-8111-111111111111";
const SECRET_SEED = "22222222-2222-4222-8222-222222222222";

let mockSupabaseClient = null;

mock.module("../../app/lib/supabaseAdmin.js", {
  exports: {
    isSupabaseAdminConfigured: () => true,
    getSupabaseAdmin: () => mockSupabaseClient,
  },
});

mock.module("../../app/lib/identityCardState.js", {
  exports: {
    ensureExpiredStateEvent: async () => null,
    appendStateEvent: async () => ({ id: "evt-test" }),
  },
});

const { POST } = await import("../../app/api/identity-card/verify-code/route.js");

function buildActiveCard(overrides = {}) {
  const encrypted = encryptSecretSeed(SECRET_SEED);
  const future = new Date(Date.now() + 86_400_000).toISOString();

  return {
    id: CARD_ID,
    trust_state: "active",
    expires_at: future,
    issued_at: new Date().toISOString(),
    display_name: "Test User",
    username: "testuser",
    purpose: "verification test",
    secret_ciphertext: encrypted.secret_ciphertext,
    secret_nonce: encrypted.secret_nonce,
    verification_count: 0,
    identity_card_version: "dts-v1",
    metadata: { trust_tier: "free", rotation_seconds: 60 },
    ...overrides,
  };
}

function createCardsSupabaseMock({ card = null, selectError = null } = {}) {
  return {
    from(table) {
      assert.equal(table, "identity_cards");

      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        maybeSingle() {
          if (selectError) {
            return Promise.resolve({ data: null, error: selectError });
          }

          return Promise.resolve({ data: card, error: null });
        },
        update() {
          return {
            eq() {
              return Promise.resolve({ error: null });
            },
          };
        },
      };

      return query;
    },
  };
}

function buildVerifyRequest(body, ip = "203.0.113.40") {
  return new Request("http://localhost/api/identity-card/verify-code", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  resetIdentityCardRateLimitsForTests();
  resetTrustVerifySentinelCountersForTests();
  mockSupabaseClient = null;
});

test("operational trust verify counter keys pass validation", () => {
  for (const counterKey of SENTINEL_OPERATIONAL_COUNTER_KEYS) {
    if (!counterKey.startsWith("trust.verify.")) {
      continue;
    }

    assert.equal(validateSentinelCounterKey(counterKey).valid, true, counterKey);
  }
});

test("POST verify-code records success for valid rotating code", async () => {
  mockSupabaseClient = createCardsSupabaseMock({ card: buildActiveCard() });
  const currentCode = computeRotatingCode(CARD_ID, SECRET_SEED);

  const response = await POST(
    buildVerifyRequest({ card_id: CARD_ID, current_code: currentCode })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.valid, true);
  assert.ok(getTrustVerifySentinelCounterCallsForTests().includes(TRUST_VERIFY_SENTINEL_COUNTERS.SUCCESS));
});

test("POST verify-code records invalid_code for wrong code", async () => {
  mockSupabaseClient = createCardsSupabaseMock({ card: buildActiveCard() });

  const response = await POST(
    buildVerifyRequest({ card_id: CARD_ID, current_code: "000000" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.valid, false);
  assert.ok(
    getTrustVerifySentinelCounterCallsForTests().includes(TRUST_VERIFY_SENTINEL_COUNTERS.INVALID_CODE)
  );
});

test("POST verify-code records card_not_found for missing card", async () => {
  mockSupabaseClient = createCardsSupabaseMock({ card: null });

  const response = await POST(
    buildVerifyRequest({ card_id: CARD_ID, current_code: "123456" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.valid, false);
  assert.equal(json.trust_state, "unverified");
  assert.ok(
    getTrustVerifySentinelCounterCallsForTests().includes(
      TRUST_VERIFY_SENTINEL_COUNTERS.CARD_NOT_FOUND
    )
  );
});

test("POST verify-code records revoked for revoked cards", async () => {
  mockSupabaseClient = createCardsSupabaseMock({
    card: buildActiveCard({
      revoked_at: new Date().toISOString(),
      trust_state: "revoked",
    }),
  });

  const response = await POST(
    buildVerifyRequest({ card_id: CARD_ID, current_code: "123456" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.valid, false);
  assert.equal(json.trust_state, "revoked");
  assert.ok(
    getTrustVerifySentinelCounterCallsForTests().includes(TRUST_VERIFY_SENTINEL_COUNTERS.REVOKED)
  );
});

test("POST verify-code records expired for expired cards", async () => {
  mockSupabaseClient = createCardsSupabaseMock({
    card: buildActiveCard({
      expires_at: new Date(Date.now() - 86_400_000).toISOString(),
      trust_state: "expired",
    }),
  });

  const response = await POST(
    buildVerifyRequest({ card_id: CARD_ID, current_code: "123456" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.valid, false);
  assert.equal(json.trust_state, "expired");
  assert.ok(
    getTrustVerifySentinelCounterCallsForTests().includes(TRUST_VERIFY_SENTINEL_COUNTERS.EXPIRED)
  );
});

test("POST verify-code records rate_limited after burst", async () => {
  mockSupabaseClient = createCardsSupabaseMock({ card: buildActiveCard() });

  for (let attempt = 0; attempt < 13; attempt += 1) {
    await POST(buildVerifyRequest({ card_id: CARD_ID, current_code: "123456" }, "203.0.113.41"));
  }

  assert.ok(
    getTrustVerifySentinelCounterCallsForTests().includes(TRUST_VERIFY_SENTINEL_COUNTERS.RATE_LIMITED)
  );
});

test("POST verify-code records server_error on database failure", async () => {
  mockSupabaseClient = createCardsSupabaseMock({
    card: buildActiveCard(),
    selectError: { message: "database unavailable" },
  });

  const response = await POST(
    buildVerifyRequest({ card_id: CARD_ID, current_code: "123456" })
  );

  assert.equal(response.status, 500);
  assert.ok(
    getTrustVerifySentinelCounterCallsForTests().includes(TRUST_VERIFY_SENTINEL_COUNTERS.SERVER_ERROR)
  );
});

test("counter increment failure does not change verify-code response shape", async () => {
  mockSupabaseClient = createCardsSupabaseMock({ card: null });
  setTrustVerifySentinelCounterIncrementForTests(async () => {
    throw new Error("counter backend unavailable");
  });

  const response = await POST(
    buildVerifyRequest({ card_id: CARD_ID, current_code: "123456" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.valid, false);
  assert.equal(json.trust_state, "unverified");
});

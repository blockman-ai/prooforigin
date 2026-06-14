import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { register } from "node:module";
import { resetIdentityCardRateLimitsForTests } from "../../app/lib/identityCardRateLimit.js";
import { hashEnrollmentToken } from "../../app/lib/voiceAnchor.js";
import {
  getTrustVoiceLinkSentinelCounterCallsForTests,
  resetTrustVoiceLinkSentinelCountersForTests,
  TRUST_VOICE_LINK_SENTINEL_COUNTERS,
} from "../../app/lib/trustVoiceLinkSentinelCounters.js";
import {
  SENTINEL_OPERATIONAL_COUNTER_KEYS,
  validateSentinelCounterKey,
} from "../../app/lib/sentinelCounters.js";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const CARD_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_CARD_ID = "22222222-2222-4222-8222-222222222222";
const SECRET_SEED = "33333333-3333-4333-8333-333333333333";
const ENROLLMENT_ID = "44444444-4444-4444-8444-444444444444";
const ENROLLMENT_TOKEN = "55555555-5555-4555-8555-555555555555";
const FINGERPRINT_HASH = "a".repeat(64);

let mockSupabaseClient = null;
let appendStateEventCalls = [];

mock.module("../../app/lib/supabaseAdmin.js", {
  exports: {
    isSupabaseAdminConfigured: () => true,
    getSupabaseAdmin: () => mockSupabaseClient,
  },
});

mock.module("../../app/lib/identityCardState.js", {
  exports: {
    appendStateEvent: async (_supabase, payload) => {
      appendStateEventCalls.push(payload);
      return {
        id: "evt-voice-link",
        card_state_hash: "c".repeat(64),
      };
    },
    ensureExpiredStateEvent: async () => null,
    getTrustHistory: async () => [],
  },
});

const { computeCardStateHash, encryptSecretSeed, hashSecretSeed } = await import(
  "../../app/lib/identityCard.js"
);
const { buildPublicVoiceAnchorFromCard, verifyCardSecretSeed } = await import(
  "../../app/lib/identityCardVoiceLink.js"
);

const { POST: linkVoiceAnchor } = await import(
  "../../app/api/identity-card/link-voice-anchor/route.js"
);
const { POST: unlinkVoiceAnchor } = await import(
  "../../app/api/identity-card/unlink-voice-anchor/route.js"
);

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
    purpose: "voice link test",
    secret_ciphertext: encrypted.secret_ciphertext,
    secret_nonce: encrypted.secret_nonce,
    secret_token_hash: hashSecretSeed(SECRET_SEED),
    verification_count: 0,
    identity_card_version: "dts-v1",
    metadata: { trust_tier: "free", rotation_seconds: 60 },
    voice_anchor_hash: null,
    ...overrides,
  };
}

function buildEnrollment(overrides = {}) {
  return {
    id: ENROLLMENT_ID,
    fingerprint_hash: FINGERPRINT_HASH,
    deleted_at: null,
    enrollment_token_hash: hashEnrollmentToken(ENROLLMENT_TOKEN),
    ...overrides,
  };
}

function createLinkSupabaseMock({
  card = buildActiveCard(),
  enrollment = buildEnrollment(),
  conflictingCards = [],
} = {}) {
  let activeCard = card;

  return {
    from(table) {
      if (table === "identity_cards") {
        const state = {
          filters: [],
          isUpdate: false,
        };

        const query = {
          select() {
            return query;
          },
          eq(column, value) {
            state.filters.push({ column, value, op: "eq" });
            return query;
          },
          neq(column, value) {
            state.filters.push({ column, value, op: "neq" });
            return query;
          },
          maybeSingle() {
            if (state.isUpdate) {
              return Promise.resolve({ data: null, error: null });
            }

            const idFilter = state.filters.find((entry) => entry.column === "id");
            if (idFilter?.value === CARD_ID) {
              return Promise.resolve({ data: activeCard, error: null });
            }

            return Promise.resolve({ data: null, error: null });
          },
          update(payload) {
            activeCard = {
              ...activeCard,
              voice_anchor_hash:
                payload.voice_anchor_hash !== undefined
                  ? payload.voice_anchor_hash
                  : activeCard.voice_anchor_hash,
              metadata: payload.metadata ?? activeCard.metadata,
            };
            state.isUpdate = true;
            return query;
          },
          then(resolve, reject) {
            try {
              if (state.isUpdate) {
                resolve({ data: null, error: null });
                return;
              }

              const hashFilter = state.filters.find((entry) => entry.column === "voice_anchor_hash");
              if (hashFilter) {
                const excludeId = state.filters.find((entry) => entry.op === "neq")?.value;
                resolve({
                  data: conflictingCards.filter((entry) => entry.id !== excludeId),
                  error: null,
                });
                return;
              }

              const idFilter = state.filters.find((entry) => entry.column === "id");
              if (idFilter?.value === CARD_ID) {
                resolve({ data: activeCard, error: null });
                return;
              }

              resolve({ data: null, error: null });
            } catch (error) {
              reject(error);
            }
          },
        };

        return query;
      }

      if (table === "voice_anchor_enrollments") {
        return {
          select() {
            return this;
          },
          eq(_column, value) {
            this.enrollmentId = value;
            return this;
          },
          maybeSingle() {
            if (this.enrollmentId === ENROLLMENT_ID) {
              return Promise.resolve({ data: enrollment, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };
}

function buildLinkRequest(body, ip = "203.0.113.50") {
  return new Request("http://localhost/api/identity-card/link-voice-anchor", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

function buildUnlinkRequest(body, ip = "203.0.113.51") {
  return new Request("http://localhost/api/identity-card/unlink-voice-anchor", {
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
  resetTrustVoiceLinkSentinelCountersForTests();
  mockSupabaseClient = null;
  appendStateEventCalls = [];
});

test("operational trust voice link counter keys pass validation", () => {
  for (const counterKey of SENTINEL_OPERATIONAL_COUNTER_KEYS) {
    if (!counterKey.startsWith("trust.voice_link.")) {
      continue;
    }

    assert.equal(validateSentinelCounterKey(counterKey).valid, true, counterKey);
  }
});

test("buildPublicVoiceAnchorFromCard never exposes fingerprint hash", () => {
  const summary = buildPublicVoiceAnchorFromCard({
    voice_anchor_hash: FINGERPRINT_HASH,
    metadata: {
      voice_anchor_linked_at: "2026-06-12T12:00:00.000Z",
      voice_anchor_version: "v1",
    },
  });

  assert.equal(summary.linked, true);
  assert.equal(summary.linked_at, "2026-06-12T12:00:00.000Z");
  assert.equal(summary.version, "v1");
  assert.equal(JSON.stringify(summary).includes(FINGERPRINT_HASH), false);
});

test("verifyCardSecretSeed accepts valid card secret", () => {
  assert.equal(verifyCardSecretSeed(buildActiveCard(), SECRET_SEED), true);
});

test("POST link-voice-anchor happy path links enrollment", async () => {
  mockSupabaseClient = createLinkSupabaseMock();

  const response = await linkVoiceAnchor(
    buildLinkRequest({
      card_id: CARD_ID,
      secret_seed: SECRET_SEED,
      enrollment_id: ENROLLMENT_ID,
      enrollment_token: ENROLLMENT_TOKEN,
      consent: true,
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.voice_anchor.linked, true);
  assert.equal(appendStateEventCalls[0].metadata.source, "voice_link");
  assert.equal(appendStateEventCalls[0].voiceAnchorHash, FINGERPRINT_HASH);
  assert.ok(
    getTrustVoiceLinkSentinelCounterCallsForTests().includes(TRUST_VOICE_LINK_SENTINEL_COUNTERS.SUCCESS)
  );
});

test("POST link-voice-anchor records invalid_credentials for wrong secret_seed", async () => {
  mockSupabaseClient = createLinkSupabaseMock();

  const response = await linkVoiceAnchor(
    buildLinkRequest({
      card_id: CARD_ID,
      secret_seed: "99999999-9999-4999-8999-999999999999",
      enrollment_id: ENROLLMENT_ID,
      enrollment_token: ENROLLMENT_TOKEN,
      consent: true,
    })
  );

  assert.equal(response.status, 403);
  assert.ok(
    getTrustVoiceLinkSentinelCounterCallsForTests().includes(
      TRUST_VOICE_LINK_SENTINEL_COUNTERS.INVALID_CREDENTIALS
    )
  );
});

test("POST link-voice-anchor records invalid_credentials for wrong enrollment_token", async () => {
  mockSupabaseClient = createLinkSupabaseMock();

  const response = await linkVoiceAnchor(
    buildLinkRequest({
      card_id: CARD_ID,
      secret_seed: SECRET_SEED,
      enrollment_id: ENROLLMENT_ID,
      enrollment_token: "66666666-6666-4666-8666-666666666666",
      consent: true,
    })
  );

  assert.equal(response.status, 403);
  assert.ok(
    getTrustVoiceLinkSentinelCounterCallsForTests().includes(
      TRUST_VOICE_LINK_SENTINEL_COUNTERS.INVALID_CREDENTIALS
    )
  );
});

test("POST link-voice-anchor rejects deleted enrollment", async () => {
  mockSupabaseClient = createLinkSupabaseMock({
    enrollment: buildEnrollment({ deleted_at: new Date().toISOString() }),
  });

  const response = await linkVoiceAnchor(
    buildLinkRequest({
      card_id: CARD_ID,
      secret_seed: SECRET_SEED,
      enrollment_id: ENROLLMENT_ID,
      enrollment_token: ENROLLMENT_TOKEN,
      consent: true,
    })
  );

  assert.equal(response.status, 404);
  assert.ok(
    getTrustVoiceLinkSentinelCounterCallsForTests().includes(TRUST_VOICE_LINK_SENTINEL_COUNTERS.NOT_FOUND)
  );
});

test("POST link-voice-anchor rejects enrollment already linked to another card", async () => {
  mockSupabaseClient = createLinkSupabaseMock({
    conflictingCards: [
      buildActiveCard({
        id: OTHER_CARD_ID,
        voice_anchor_hash: FINGERPRINT_HASH,
      }),
    ],
  });

  const response = await linkVoiceAnchor(
    buildLinkRequest({
      card_id: CARD_ID,
      secret_seed: SECRET_SEED,
      enrollment_id: ENROLLMENT_ID,
      enrollment_token: ENROLLMENT_TOKEN,
      consent: true,
    })
  );

  assert.equal(response.status, 409);
  assert.ok(
    getTrustVoiceLinkSentinelCounterCallsForTests().includes(
      TRUST_VOICE_LINK_SENTINEL_COUNTERS.ALREADY_LINKED
    )
  );
});

test("POST unlink-voice-anchor clears public voice signal", async () => {
  mockSupabaseClient = createLinkSupabaseMock({
    card: buildActiveCard({
      voice_anchor_hash: FINGERPRINT_HASH,
      metadata: {
        voice_anchor_linked_at: "2026-06-12T12:00:00.000Z",
        voice_anchor_version: "v1",
      },
    }),
  });

  const response = await unlinkVoiceAnchor(
    buildUnlinkRequest({
      card_id: CARD_ID,
      secret_seed: SECRET_SEED,
      consent: true,
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.voice_anchor.linked, false);
  assert.equal(appendStateEventCalls[0].metadata.source, "voice_unlink");
  assert.ok(
    getTrustVoiceLinkSentinelCounterCallsForTests().includes(
      TRUST_VOICE_LINK_SENTINEL_COUNTERS.UNLINK_SUCCESS
    )
  );
});

test("GET public card never exposes fingerprint hash", async () => {
  mockSupabaseClient = {
    from(table) {
      assert.equal(table, "identity_cards");
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle() {
          return Promise.resolve({
            data: buildActiveCard({
              voice_anchor_hash: FINGERPRINT_HASH,
              metadata: {
                voice_anchor_linked_at: "2026-06-12T12:00:00.000Z",
                voice_anchor_version: "v1",
              },
            }),
            error: null,
          });
        },
      };
    },
  };

  const { GET } = await import("../../app/api/identity-card/public/[cardId]/route.js");
  const response = await GET(new Request(`http://localhost/api/identity-card/public/${CARD_ID}`), {
    params: { cardId: CARD_ID },
  });
  const json = await response.json();
  const serialized = JSON.stringify(json);

  assert.equal(json.voice_anchor.linked, true);
  assert.equal(serialized.includes(FINGERPRINT_HASH), false);
  assert.equal(serialized.includes("enrollment_token"), false);
  assert.equal(serialized.includes("enrollment_id"), false);
});

test("state hash changes when voice anchor hash is included", async () => {
  const card = buildActiveCard();
  const withoutVoice = computeCardStateHash({
    cardId: CARD_ID,
    issuedAt: card.issued_at,
    expiresAt: card.expires_at,
    trustState: "active",
    publicDisplayHash: "d".repeat(64),
    voiceAnchorHash: "",
  });
  const withVoice = computeCardStateHash({
    cardId: CARD_ID,
    issuedAt: card.issued_at,
    expiresAt: card.expires_at,
    trustState: "active",
    publicDisplayHash: "d".repeat(64),
    voiceAnchorHash: FINGERPRINT_HASH,
  });

  assert.notEqual(withoutVoice, withVoice);
});

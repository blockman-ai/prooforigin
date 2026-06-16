import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "node:module";
import {
  buildDisclosureGrantEventRecord,
  buildPublicHandleHash,
  buildRecipientBindingHash,
  buildSessionTokenHash,
  DISCLOSURE_ACTOR_TYPES,
  DISCLOSURE_EVENT_RESULTS,
  DISCLOSURE_GRANT_EVENT_TYPES,
  verifyDisclosureGrantEventChainRecords,
} from "../../app/lib/vaultDisclosureGrant.js";
import { resetDisclosureRateLimitsForTests } from "../../app/lib/vaultDisclosureRateLimit.js";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const GRANT_HANDLE = "grant-handle-hardening";
const RECIPIENT_CHALLENGE = "recipient-challenge-value";
const SESSION_TOKEN = "session-token-hardening";
const GRANT_ID = "22222222-2222-4222-8222-222222222222";

function buildGrant(overrides = {}) {
  return {
    grant_id: GRANT_ID,
    public_handle_hash: buildPublicHandleHash(GRANT_HANDLE),
    grant_type: "verify_only",
    status: "active",
    purpose_label: "Education verification",
    recipient_binding_hash: buildRecipientBindingHash(RECIPIENT_CHALLENGE),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    access_count: 0,
    max_access_count: 1,
    ...overrides,
  };
}

const state = {
  grant: buildGrant(),
  session: null,
  events: [],
  verifyCalls: 0,
  verifyMode: "success",
};

function resetState() {
  resetDisclosureRateLimitsForTests();
  state.grant = buildGrant();
  state.session = {
    session_id: "44444444-4444-4444-8444-444444444444",
    grant_ref: GRANT_ID,
    recipient_binding_hash: buildRecipientBindingHash(RECIPIENT_CHALLENGE),
    session_token_hash: buildSessionTokenHash(SESSION_TOKEN),
    status: "active",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    access_count: 0,
  };
  state.events = [];
  state.verifyCalls = 0;
  state.verifyMode = "success";
}

mock.module("../../app/lib/vaultDisclosureGrantStore.js", {
  exports: {
    getDisclosureGrantRecordByHandleHash: async () => ({ grant: state.grant, error: null }),
    markDisclosureGrantExpiredRecord: async () => ({ grant: null, error: null }),
    appendDisclosureGrantEvent: async (event) => {
      state.events.push(event);
      return { event, error: null };
    },
    getDisclosureAccessSessionByTokenHash: async ({ sessionTokenHash }) => {
      if (state.session?.session_token_hash !== sessionTokenHash) {
        return { session: null, error: null };
      }
      return { session: state.session, error: null };
    },
    completeDisclosureVerifyAtomic: async (event) => {
      state.verifyCalls += 1;

      if (state.verifyMode === "audit_failure") {
        return {
          event: null,
          grant: null,
          session: null,
          error: { message: "audit_persist_failed" },
        };
      }

      if (state.verifyMode === "cap_reached") {
        return {
          event: null,
          grant: null,
          session: null,
          error: { message: "access_cap_reached" },
        };
      }

      if (state.verifyMode === "double_verify" && state.grant.access_count >= state.grant.max_access_count) {
        return {
          event: null,
          grant: null,
          session: null,
          error: { message: "access_cap_reached" },
        };
      }

      const previousEventHash =
        state.events.at(-1)?.event_hash ||
        buildDisclosureGrantEventRecord({
          grantRef: GRANT_ID,
          eventType: DISCLOSURE_GRANT_EVENT_TYPES.RECIPIENT_ACCEPTED,
          actorType: DISCLOSURE_ACTOR_TYPES.RECIPIENT,
          result: DISCLOSURE_EVENT_RESULTS.SUCCESS,
          timestamp: "2026-06-15T12:00:00.000Z",
        }).event_hash;
      const verifiedEvent = buildDisclosureGrantEventRecord({
        grantRef: GRANT_ID,
        eventType: DISCLOSURE_GRANT_EVENT_TYPES.VERIFIED,
        actorType: DISCLOSURE_ACTOR_TYPES.RECIPIENT,
        result: DISCLOSURE_EVENT_RESULTS.SUCCESS,
        previousEventHash,
        timestamp: "2026-06-15T12:01:00.000Z",
      });
      state.events.push(verifiedEvent);
      state.grant = buildGrant({
        access_count: state.grant.access_count + 1,
      });
      state.session = {
        ...state.session,
        access_count: state.session.access_count + 1,
      };

      return {
        event: verifiedEvent,
        grant: state.grant,
        session: state.session,
        error: null,
      };
    },
  },
});

mock.module("../../app/lib/vaultDisclosureSentinelCounters.js", {
  exports: {
    VAULT_DISCLOSURE_SENTINEL_COUNTERS: {
      FAILED_VERIFY_TOTAL: "vault.disclosure.access.failed_verify_total",
      REVOKED_ATTEMPT_TOTAL: "vault.disclosure.access.revoked_attempt_total",
      EXPIRED_ATTEMPT_TOTAL: "vault.disclosure.access.expired_attempt_total",
      REPEATED_RECIPIENT_TOTAL: "vault.disclosure.access.repeated_recipient_total",
      RATE_LIMITED_TOTAL: "vault.disclosure.access.rate_limited_total",
    },
    recordVaultDisclosureSentinelCounter: () => {},
  },
});

const { GET: VERIFY } = await import("../../app/api/disclosure/[grant_handle]/verify/route.js");

function verifyRequest() {
  return VERIFY(
    new Request(`http://localhost/api/disclosure/${GRANT_HANDLE}/verify`, {
      headers: { "x-prooforigin-disclosure-session": SESSION_TOKEN },
    }),
    { params: { grant_handle: GRANT_HANDLE } }
  );
}

function assertNoPrivacyLeaks(json) {
  const serialized = JSON.stringify(json).toLowerCase();
  for (const forbidden of [
    "document_id",
    "vault_id",
    "ciphertext",
    "secret",
    "storage",
    "grant_id",
    "session_id",
    "event_hash",
    "previous_event_hash",
  ]) {
    assert.equal(serialized.includes(forbidden), false, `leaked ${forbidden}`);
  }
}

test("verify audit append failure does not return verified success", async () => {
  resetState();
  state.verifyMode = "audit_failure";

  const response = await verifyRequest();
  const json = await response.json();

  assert.equal(response.status, 502);
  assert.equal(json.ok, false);
  assert.equal(json.status, "unavailable");
  assert.notEqual(json.status, "verified");
  assertNoPrivacyLeaks(json);
});

test("access cap cannot be bypassed by double verify", async () => {
  resetState();
  state.verifyMode = "double_verify";

  const first = await verifyRequest();
  const firstJson = await first.json();
  assert.equal(first.status, 200);
  assert.equal(firstJson.status, "verified");
  assert.equal(state.grant.access_count, 1);

  const second = await verifyRequest();
  const secondJson = await second.json();
  assert.equal(second.status, 404);
  assert.equal(secondJson.ok, false);
  assert.equal(secondJson.status, "unavailable");
  assert.equal(state.grant.access_count, 1);
  assert.equal(state.verifyCalls, 1);
});

test("audit chain remains valid after verify", async () => {
  resetState();
  const accepted = buildDisclosureGrantEventRecord({
    grantRef: GRANT_ID,
    eventType: DISCLOSURE_GRANT_EVENT_TYPES.RECIPIENT_ACCEPTED,
    actorType: DISCLOSURE_ACTOR_TYPES.RECIPIENT,
    result: DISCLOSURE_EVENT_RESULTS.SUCCESS,
    timestamp: "2026-06-15T12:00:00.000Z",
  });
  state.events.push(accepted);

  const response = await verifyRequest();
  assert.equal(response.status, 200);

  const chain = verifyDisclosureGrantEventChainRecords({
    grantRef: GRANT_ID,
    events: state.events.map((event, index) => ({
      event_id: `event-${index + 1}`,
      grant_ref: GRANT_ID,
      event_type: event.event_type || event.eventType,
      actor_type: event.actor_type || event.actorType,
      result: event.result,
      reason_code: event.reason_code || event.reasonCode || null,
      timestamp: event.timestamp,
      previous_event_hash: event.previous_event_hash || event.previousEventHash,
      event_hash: event.event_hash || event.eventHash,
      metadata: event.metadata || {},
    })),
  });

  assert.equal(chain.verified, true);
  assert.equal(state.events.at(-1).event_type, "grant.verified");
});

test("verify failure responses do not leak privacy fields", async () => {
  resetState();
  state.verifyMode = "cap_reached";

  const response = await verifyRequest();
  const json = await response.json();

  assert.equal(response.status, 404);
  assertNoPrivacyLeaks(json);
});

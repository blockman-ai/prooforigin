import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "node:module";
import {
  buildPublicHandleHash,
  buildRecipientBindingHash,
  buildSessionTokenHash,
} from "../../app/lib/vaultDisclosureGrant.js";
import { resetDisclosureRateLimitsForTests } from "../../app/lib/vaultDisclosureRateLimit.js";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const GRANT_HANDLE = "grant-handle";
const RECIPIENT_CHALLENGE = "recipient-challenge-value";
const SESSION_TOKEN = "session-token";
const GRANT_ID = "11111111-1111-4111-8111-111111111111";

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
    max_access_count: 2,
    ...overrides,
  };
}

const state = {
  grant: buildGrant(),
  session: null,
  events: [],
  counterCalls: [],
  createdSession: null,
};

function resetState() {
  resetDisclosureRateLimitsForTests();
  state.grant = buildGrant();
  state.session = {
    session_id: "33333333-3333-4333-8333-333333333333",
    grant_ref: GRANT_ID,
    recipient_binding_hash: buildRecipientBindingHash(RECIPIENT_CHALLENGE),
    session_token_hash: buildSessionTokenHash(SESSION_TOKEN),
    status: "active",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    access_count: 0,
  };
  state.events = [];
  state.counterCalls = [];
  state.createdSession = null;
}

mock.module("../../app/lib/vaultDisclosureGrantStore.js", {
  exports: {
    getDisclosureGrantRecordByHandleHash: async () => ({ grant: state.grant, error: null }),
    markDisclosureGrantExpiredRecord: async () => ({ grant: null, error: null }),
    appendDisclosureGrantEvent: async (event) => {
      state.events.push(event);
      return { event, error: null };
    },
    createDisclosureAccessSessionRecord: async (session) => {
      state.createdSession = session;
      return {
        session: {
          session_id: "33333333-3333-4333-8333-333333333333",
          ...session,
        },
        error: null,
      };
    },
    getDisclosureAccessSessionByTokenHash: async ({ sessionTokenHash }) => {
      if (state.session?.session_token_hash !== sessionTokenHash) {
        return { session: null, error: null };
      }
      return { session: state.session, error: null };
    },
    incrementDisclosureGrantAccessCount: async () => ({
      grant: buildGrant({ access_count: 1 }),
      error: null,
    }),
    incrementDisclosureSessionAccessCount: async () => ({ session: {}, error: null }),
    completeDisclosureVerifyAtomic: async (event) => {
      state.grant = buildGrant({
        access_count: Math.min(state.grant.access_count + 1, state.grant.max_access_count),
      });
      state.events.push({
        ...event,
        eventType: event.eventType || "grant.verified",
      });
      return {
        event: {
          event_type: "grant.verified",
          event_hash: "a".repeat(64),
          previous_event_hash: "b".repeat(64),
        },
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
      FAILED_ACCEPTANCE_TOTAL: "vault.disclosure.access.failed_acceptance_total",
      FAILED_VERIFY_TOTAL: "vault.disclosure.access.failed_verify_total",
      REVOKED_ATTEMPT_TOTAL: "vault.disclosure.access.revoked_attempt_total",
      EXPIRED_ATTEMPT_TOTAL: "vault.disclosure.access.expired_attempt_total",
      REPEATED_RECIPIENT_TOTAL: "vault.disclosure.access.repeated_recipient_total",
    },
    recordVaultDisclosureSentinelCounter: (key) => state.counterCalls.push(key),
  },
});

const { POST: ACCEPT } = await import("../../app/api/disclosure/[grant_handle]/accept/route.js");
const { GET: VERIFY } = await import("../../app/api/disclosure/[grant_handle]/verify/route.js");

test("recipient accept creates a recipient-bound disclosure session", async () => {
  resetState();
  const response = await ACCEPT(
    new Request(`http://localhost/api/disclosure/${GRANT_HANDLE}/accept`, {
      method: "POST",
      body: JSON.stringify({ recipient_challenge: RECIPIENT_CHALLENGE }),
    }),
    { params: { grant_handle: GRANT_HANDLE } }
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.status, "accepted");
  assert.equal(typeof json.session_token, "string");
  assert.equal(state.createdSession.recipient_binding_hash, buildRecipientBindingHash(RECIPIENT_CHALLENGE));
  assert.equal(state.createdSession.session_token_hash.length, 64);
  assert.equal(state.events[0].eventType, "recipient.accepted");
});

test("forwarded grant handle without recipient proof is denied", async () => {
  resetState();
  const response = await ACCEPT(
    new Request(`http://localhost/api/disclosure/${GRANT_HANDLE}/accept`, {
      method: "POST",
      body: JSON.stringify({ recipient_challenge: "wrong-recipient-challenge" }),
    }),
    { params: { grant_handle: GRANT_HANDLE } }
  );
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.equal(json.ok, false);
  assert.equal(json.status, "unavailable");
  assert.deepEqual(state.counterCalls, ["vault.disclosure.access.failed_acceptance_total"]);
});

test("recipient verify requires an active recipient session and returns minimal proof", async () => {
  resetState();
  const response = await VERIFY(
    new Request(`http://localhost/api/disclosure/${GRANT_HANDLE}/verify`, {
      headers: { "x-prooforigin-disclosure-session": SESSION_TOKEN },
    }),
    { params: { grant_handle: GRANT_HANDLE } }
  );
  const json = await response.json();
  const serialized = JSON.stringify(json).toLowerCase();

  assert.equal(response.status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.grant_type, "verify_only");
  assert.equal(json.status, "verified");
  assert.match(json.claim, /Education verification/);
  assert.equal(serialized.includes("document_id"), false);
  assert.equal(serialized.includes("vault_id"), false);
  assert.equal(serialized.includes("hash"), false);
  assert.equal(serialized.includes("ciphertext"), false);
  assert.equal(state.events.at(-1).eventType, "grant.verified");
});

test("recipient verify fails with handle only", async () => {
  resetState();
  const response = await VERIFY(
    new Request(`http://localhost/api/disclosure/${GRANT_HANDLE}/verify`),
    { params: { grant_handle: GRANT_HANDLE } }
  );
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.equal(json.ok, false);
  assert.deepEqual(state.counterCalls, ["vault.disclosure.access.failed_verify_total"]);
});

test("recipient verify denies expired sessions and revoked grants", async () => {
  resetState();
  state.grant = buildGrant({ status: "revoked", revoked_at: new Date().toISOString() });
  const response = await VERIFY(
    new Request(`http://localhost/api/disclosure/${GRANT_HANDLE}/verify`, {
      headers: { "x-prooforigin-disclosure-session": SESSION_TOKEN },
    }),
    { params: { grant_handle: GRANT_HANDLE } }
  );
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.equal(json.ok, false);
  assert.deepEqual(state.counterCalls, ["vault.disclosure.access.revoked_attempt_total"]);

  resetState();
  state.session = {
    ...state.session,
    expires_at: new Date(Date.now() - 60_000).toISOString(),
  };
  const expiredResponse = await VERIFY(
    new Request(`http://localhost/api/disclosure/${GRANT_HANDLE}/verify`, {
      headers: { "x-prooforigin-disclosure-session": SESSION_TOKEN },
    }),
    { params: { grant_handle: GRANT_HANDLE } }
  );
  assert.equal(expiredResponse.status, 404);
  assert.deepEqual(state.counterCalls, ["vault.disclosure.access.expired_attempt_total"]);
});

test("session token hash never equals raw token", () => {
  assert.notEqual(buildSessionTokenHash(SESSION_TOKEN), SESSION_TOKEN);
});

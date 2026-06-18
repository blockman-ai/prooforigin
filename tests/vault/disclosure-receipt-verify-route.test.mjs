import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "node:module";
import {
  buildDisclosureGrantEventRecord,
  DISCLOSURE_ACTOR_TYPES,
  DISCLOSURE_EVENT_RESULTS,
  DISCLOSURE_GRANT_EVENT_TYPES,
} from "../../app/lib/vaultDisclosureGrant.js";
import {
  buildDisclosureReceiptRecord,
  buildUniformReceiptVerifyDeniedResponse,
} from "../../app/lib/vaultDisclosureReceipt.js";
import { DISCLOSURE_POLICY_SCOPE_VAULT_CLAIM } from "../../app/lib/vaultDisclosurePolicy.js";
import {
  checkDisclosureReceiptVerifyRateLimit,
  DISCLOSURE_RECEIPT_VERIFY_IP_BURST_LIMIT,
  resetDisclosureRateLimitsForTests,
} from "../../app/lib/vaultDisclosureRateLimit.js";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const POLICY_ID = "11111111-1111-4111-8111-111111111111";
const GRANT_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const EVENT_ID = "44444444-4444-4444-8444-444444444444";
const RECEIPT_ID = "55555555-5555-4555-8555-555555555555";
const SCOPE_REF = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const RECIPIENT_HASH = "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";

function buildReceipt(overrides = {}) {
  return buildDisclosureReceiptRecord({
    receiptId: RECEIPT_ID,
    grantRef: GRANT_ID,
    policyRef: POLICY_ID,
    sessionRef: SESSION_ID,
    eventRef: EVENT_ID,
    scopeType: DISCLOSURE_POLICY_SCOPE_VAULT_CLAIM,
    scopeRefHash: SCOPE_REF,
    recipientBindingHash: RECIPIENT_HASH,
    policySnapshotHash: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    conditionProfileHash: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    custodySnapshotHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    disclosureDigest: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    createdAt: "2026-06-16T12:00:00.000Z",
    ...overrides,
  });
}

function buildEventChain() {
  const created = buildDisclosureGrantEventRecord({
    grantRef: GRANT_ID,
    eventType: DISCLOSURE_GRANT_EVENT_TYPES.CREATED,
    actorType: DISCLOSURE_ACTOR_TYPES.OWNER,
    result: DISCLOSURE_EVENT_RESULTS.SUCCESS,
    timestamp: "2026-06-16T11:58:00.000Z",
  });
  const accepted = buildDisclosureGrantEventRecord({
    grantRef: GRANT_ID,
    eventType: DISCLOSURE_GRANT_EVENT_TYPES.RECIPIENT_ACCEPTED,
    actorType: DISCLOSURE_ACTOR_TYPES.RECIPIENT,
    result: DISCLOSURE_EVENT_RESULTS.SUCCESS,
    previousEventHash: created.event_hash,
    timestamp: "2026-06-16T11:59:00.000Z",
  });
  const receipted = buildDisclosureGrantEventRecord({
    grantRef: GRANT_ID,
    eventType: DISCLOSURE_GRANT_EVENT_TYPES.ACCESS_RECEIPTED,
    actorType: DISCLOSURE_ACTOR_TYPES.RECIPIENT,
    result: DISCLOSURE_EVENT_RESULTS.SUCCESS,
    previousEventHash: accepted.event_hash,
    timestamp: "2026-06-16T12:00:00.000Z",
  });

  return [
    { event_id: "11111111-1111-4111-8111-111111111111", ...created },
    { event_id: "22222222-2222-4222-8222-222222222222", ...accepted },
    { event_id: EVENT_ID, ...receipted },
  ];
}

const state = {
  receipt: buildReceipt(),
  events: buildEventChain(),
  receiptLookupError: null,
  eventsLookupError: null,
  counterCalls: [],
};

function resetState() {
  resetDisclosureRateLimitsForTests();
  state.receipt = buildReceipt();
  state.events = buildEventChain();
  state.receiptLookupError = null;
  state.eventsLookupError = null;
  state.counterCalls = [];
}

mock.module("../../app/lib/vaultDisclosurePolicyStore.js", {
  exports: {
    getDisclosureReceiptById: async (receiptId) => {
      if (state.receiptLookupError) {
        return { receipt: null, error: state.receiptLookupError };
      }
      if (!state.receipt || state.receipt.receipt_id !== receiptId) {
        return { receipt: null, error: null };
      }
      return { receipt: state.receipt, error: null };
    },
  },
});

mock.module("../../app/lib/vaultDisclosureGrantStore.js", {
  exports: {
    listDisclosureGrantEvents: async () => ({
      events: state.events,
      error: state.eventsLookupError,
    }),
  },
});

mock.module("../../app/lib/vaultDisclosureSentinelCounters.js", {
  exports: {
    VAULT_DISCLOSURE_SENTINEL_COUNTERS: {
      RECEIPT_VERIFY_SUCCESS_TOTAL: "vault.disclosure.receipt.verify_success_total",
      RECEIPT_VERIFY_DENIED_TOTAL: "vault.disclosure.receipt.verify_denied_total",
      RECEIPT_VERIFY_INTEGRITY_FAILED_TOTAL:
        "vault.disclosure.receipt.verify_integrity_failed_total",
      RECEIPT_VERIFY_RATE_LIMITED_TOTAL: "vault.disclosure.receipt.verify_rate_limited_total",
    },
    recordVaultDisclosureSentinelCounter: (key) => state.counterCalls.push(key),
  },
});

const { POST } = await import("../../app/api/disclosure/receipts/verify/route.js");

function verifyRequest(body, headers = {}) {
  return POST(
    new Request("http://localhost/api/disclosure/receipts/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "203.0.113.44",
        ...headers,
      },
      body: JSON.stringify(body),
    })
  );
}

test("receipt verify route returns verified receipt on happy path", async () => {
  resetState();
  const response = await verifyRequest({
    receipt_id: RECEIPT_ID,
    receipt_hash: state.receipt.receipt_hash,
  });
  const json = await response.json();
  const serialized = JSON.stringify(json).toLowerCase();

  assert.equal(response.status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.verified, true);
  assert.equal(json.status, "verified");
  assert.equal(json.receipt.receipt_id, RECEIPT_ID);
  assert.equal(json.chain.verified, true);
  assert.equal(serialized.includes("grant_ref"), false);
  assert.equal(serialized.includes("recipient_binding_hash"), false);
  assert.deepEqual(state.counterCalls, ["vault.disclosure.receipt.verify_success_total"]);
});

test("receipt verify route uniform-denies wrong receipt hash", async () => {
  resetState();
  const response = await verifyRequest({
    receipt_id: RECEIPT_ID,
    receipt_hash: "1".repeat(64),
  });
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.deepEqual(json, buildUniformReceiptVerifyDeniedResponse());
  assert.deepEqual(state.counterCalls, ["vault.disclosure.receipt.verify_denied_total"]);
});

test("receipt verify route uniform-denies unknown receipt id", async () => {
  resetState();
  state.receipt = null;
  const response = await verifyRequest({
    receipt_id: RECEIPT_ID,
    receipt_hash: "1".repeat(64),
  });
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.deepEqual(json, buildUniformReceiptVerifyDeniedResponse());
});

test("receipt verify route rejects invalid uuid and hash with 400", async () => {
  resetState();
  const invalidId = await verifyRequest({
    receipt_id: "not-a-uuid",
    receipt_hash: state.receipt.receipt_hash,
  });
  assert.equal(invalidId.status, 400);

  const invalidHash = await verifyRequest({
    receipt_id: RECEIPT_ID,
    receipt_hash: "abc",
  });
  assert.equal(invalidHash.status, 400);
});

test("receipt verify route reports integrity failure after hash proof", async () => {
  resetState();
  state.receipt = {
    ...buildReceipt(),
    scope_type: "document_ref",
  };

  const response = await verifyRequest({
    receipt_id: RECEIPT_ID,
    receipt_hash: state.receipt.receipt_hash,
  });
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.verified, false);
  assert.equal(json.status, "integrity_failed");
  assert.equal(json.checks.receipt_integrity, false);
  assert.deepEqual(state.counterCalls, [
    "vault.disclosure.receipt.verify_integrity_failed_total",
  ]);
});

test("receipt verify route reports broken chain after hash proof", async () => {
  resetState();
  state.events = buildEventChain();
  state.events[2] = { ...state.events[2], event_hash: "0".repeat(64) };

  const response = await verifyRequest({
    receipt_id: RECEIPT_ID,
    receipt_hash: state.receipt.receipt_hash,
  });
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.verified, false);
  assert.equal(json.checks.event_chain_verified, false);
});

test("receipt verify route rejects non access.receipted event refs after hash proof", async () => {
  resetState();
  state.receipt = buildReceipt({ eventRef: "22222222-2222-4222-8222-222222222222" });

  const response = await verifyRequest({
    receipt_id: RECEIPT_ID,
    receipt_hash: state.receipt.receipt_hash,
  });
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.checks.access_receipted_event, false);
});

test("receipt verify route rate limits excessive requests uniformly", async () => {
  resetState();
  const body = {
    receipt_id: RECEIPT_ID,
    receipt_hash: state.receipt.receipt_hash,
  };

  for (let index = 0; index < DISCLOSURE_RECEIPT_VERIFY_IP_BURST_LIMIT; index += 1) {
    const allowed = await checkDisclosureReceiptVerifyRateLimit(
      new Request("http://localhost/api/disclosure/receipts/verify", {
        headers: { "x-forwarded-for": "203.0.113.99" },
      })
    );
    assert.equal(allowed.allowed, true);
  }

  const blocked = await checkDisclosureReceiptVerifyRateLimit(
    new Request("http://localhost/api/disclosure/receipts/verify", {
      headers: { "x-forwarded-for": "203.0.113.99" },
    })
  );
  assert.equal(blocked.allowed, false);

  const response = await POST(
    new Request("http://localhost/api/disclosure/receipts/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "203.0.113.99",
      },
      body: JSON.stringify(body),
    })
  );
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.deepEqual(json, buildUniformReceiptVerifyDeniedResponse());
  assert.deepEqual(state.counterCalls, ["vault.disclosure.receipt.verify_rate_limited_total"]);
});

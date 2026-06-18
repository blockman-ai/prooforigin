import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "node:module";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const GRANT_ID = "7d220a9e-c3d2-4cd8-b3b7-5d5cdd128ebf";

const state = {
  responses: {},
};

mock.module("../../app/lib/vaultDocumentClient.js", {
  exports: {
    vaultSignedFetch: async ({ method, path, body = "" }) => {
      const key = `${method} ${path}`;
      const handler = state.responses[key];
      if (!handler) {
        throw new Error(`Unexpected signed fetch: ${key}`);
      }
      return handler({ method, path, body });
    },
  },
});

const {
  buildAccessCountMeter,
  deriveGrantDisplayStatus,
  getOwnerDisclosureGrant,
  getOwnerDisclosureGrantEvents,
  getOwnerDisclosureGrantReceipts,
  listOwnerDisclosureGrants,
  loadOwnerDisclosureGrantDetail,
  revokeOwnerDisclosureGrant,
  summarizeDisclosureGrants,
} = await import("../../app/lib/disclosureOwnerClient.js");

function resetResponses() {
  state.responses = {};
}

test("summarizeDisclosureGrants counts active, receipted, and revoked grants", () => {
  const now = Date.parse("2026-06-18T00:00:00.000Z");
  const grants = [
    {
      status: "active",
      expires_at: "2026-06-25T00:00:00.000Z",
      access_count: 1,
      max_access_count: 1,
    },
    {
      status: "active",
      expires_at: "2026-06-19T00:00:00.000Z",
      access_count: 0,
      max_access_count: 1,
    },
    {
      status: "revoked",
      expires_at: "2026-07-01T00:00:00.000Z",
      access_count: 0,
      max_access_count: 1,
    },
  ];

  const summary = summarizeDisclosureGrants(grants, now);
  assert.equal(summary.total, 3);
  assert.equal(summary.active, 2);
  assert.equal(summary.receipted, 1);
  assert.equal(summary.revoked, 1);
  assert.equal(summary.expiringSoon, 2);
});

test("deriveGrantDisplayStatus marks expired active grants as expired", () => {
  const grant = {
    status: "active",
    expires_at: "2026-06-17T00:00:00.000Z",
  };
  assert.equal(
    deriveGrantDisplayStatus(grant, Date.parse("2026-06-18T00:00:00.000Z")),
    "expired"
  );
});

test("buildAccessCountMeter reports cap reached state", () => {
  const meter = buildAccessCountMeter(1, 1);
  assert.equal(meter.label, "1 of 1");
  assert.equal(meter.percent, 100);
  assert.equal(meter.capReached, true);
});

test("listOwnerDisclosureGrants returns owner grant list", async () => {
  resetResponses();
  state.responses["GET /api/vault/disclosure-grants"] = async () => ({
    ok: true,
    status: 200,
    data: {
      success: true,
      grants: [
        {
          grant_id: GRANT_ID,
          purpose_label: "Phase 10B smoke",
          status: "active",
          access_count: 1,
          max_access_count: 1,
        },
      ],
    },
  });

  const result = await listOwnerDisclosureGrants();
  assert.equal(result.ok, true);
  assert.equal(result.grants.length, 1);
  assert.equal(result.grants[0].grant_id, GRANT_ID);
});

test("loadOwnerDisclosureGrantDetail loads grant, events, and receipts", async () => {
  resetResponses();
  state.responses[`GET /api/vault/disclosure-grants/${GRANT_ID}`] = async () => ({
    ok: true,
    status: 200,
    data: {
      success: true,
      grant: {
        grant_id: GRANT_ID,
        purpose_label: "Phase 10B smoke",
        status: "active",
        access_count: 1,
        max_access_count: 1,
      },
    },
  });
  state.responses[`GET /api/vault/disclosure-grants/${GRANT_ID}/events`] = async () => ({
    ok: true,
    status: 200,
    data: {
      success: true,
      events: [
        {
          event_id: "11111111-1111-4111-8111-111111111111",
          event_type: "access.receipted",
          actor_type: "recipient",
          result: "success",
          timestamp: "2026-06-18T00:48:34.687Z",
        },
      ],
      chain: {
        verified: true,
        event_count: 3,
        broken_at: null,
        reason: null,
      },
    },
  });
  state.responses[`GET /api/vault/disclosure-grants/${GRANT_ID}/receipts`] = async () => ({
    ok: true,
    status: 200,
    data: {
      success: true,
      receipts: [
        {
          receipt_id: "3f2f05a2-91f7-438b-99e0-bd2ce390521a",
          receipt_hash: "cb872a12fbc953760a1b7c7168e2e399b7ede31bf1f187ed8f2ab593b7f811b3",
          event_ref: "22222222-2222-4222-8222-222222222222",
          created_at: "2026-06-18T00:48:34.687Z",
        },
      ],
    },
  });

  const result = await loadOwnerDisclosureGrantDetail(GRANT_ID);
  assert.equal(result.ok, true);
  assert.equal(result.grant.grant_id, GRANT_ID);
  assert.equal(result.events.length, 1);
  assert.equal(result.chain.verified, true);
  assert.equal(result.receipts[0].receipt_hash.length, 64);
});

test("revokeOwnerDisclosureGrant posts signed revoke request", async () => {
  resetResponses();
  state.responses[`POST /api/vault/disclosure-grants/${GRANT_ID}/revoke`] = async ({ body }) => {
    assert.equal(body, "{}");
    return {
      ok: true,
      status: 200,
      data: {
        success: true,
        grant: {
          grant_id: GRANT_ID,
          status: "revoked",
        },
        revoked_sessions: 1,
      },
    };
  };

  const result = await revokeOwnerDisclosureGrant(GRANT_ID);
  assert.equal(result.ok, true);
  assert.equal(result.grant.status, "revoked");
  assert.equal(result.revokedSessions, 1);
});

test("owner grant lookups surface ownership verification errors", async () => {
  resetResponses();
  state.responses[`GET /api/vault/disclosure-grants/${GRANT_ID}`] = async () => ({
    ok: false,
    status: 403,
    data: {
      success: false,
      code: "OWNERSHIP_VERIFICATION_REQUIRED",
      error: "Vault ownership verification is required before disclosure grants.",
    },
  });

  const result = await getOwnerDisclosureGrant(GRANT_ID);
  assert.equal(result.ok, false);
  assert.match(result.error, /ownership verification/i);
});

test("receipt lookup returns empty list for grants without receipts", async () => {
  resetResponses();
  state.responses[`GET /api/vault/disclosure-grants/${GRANT_ID}/receipts`] = async () => ({
    ok: true,
    status: 200,
    data: {
      success: true,
      receipts: [],
    },
  });

  const result = await getOwnerDisclosureGrantReceipts(GRANT_ID);
  assert.equal(result.ok, true);
  assert.deepEqual(result.receipts, []);
});

test("events lookup returns chain verification payload", async () => {
  resetResponses();
  state.responses[`GET /api/vault/disclosure-grants/${GRANT_ID}/events`] = async () => ({
    ok: true,
    status: 200,
    data: {
      success: true,
      events: [],
      chain: {
        verified: false,
        event_count: 2,
        broken_at: "33333333-3333-4333-8333-333333333333",
        reason: "Disclosure event previous_event_hash mismatch.",
      },
    },
  });

  const result = await getOwnerDisclosureGrantEvents(GRANT_ID);
  assert.equal(result.ok, true);
  assert.equal(result.chain.verified, false);
  assert.match(result.chain.reason, /previous_event_hash mismatch/i);
});

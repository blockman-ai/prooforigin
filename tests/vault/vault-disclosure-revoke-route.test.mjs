import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "node:module";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const GRANT_ID = "11111111-1111-4111-8111-111111111111";

function buildGrant(overrides = {}) {
  return {
    grant_id: GRANT_ID,
    grant_type: "verify_only",
    status: "active",
    purpose_label: "Education verification",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    access_count: 0,
    max_access_count: 1,
    created_at: "2026-06-15T12:00:00.000Z",
    updated_at: "2026-06-15T12:00:00.000Z",
    revoked_at: null,
    ...overrides,
  };
}

const state = {
  authority: {
    ok: true,
    vaultRefHash: "v".repeat(64),
  },
  existingGrant: buildGrant(),
  events: [],
};

function resetState() {
  state.authority = {
    ok: true,
    vaultRefHash: "v".repeat(64),
  };
  state.existingGrant = buildGrant();
  state.events = [];
}

mock.module("../../app/lib/vaultDisclosureAuthority.js", {
  exports: {
    authorizeDisclosureOwnerRequest: async () => state.authority,
  },
});

mock.module("../../app/lib/vaultDisclosureGrantStore.js", {
  exports: {
    getDisclosureGrantRecordByIdForVault: async () => ({
      grant: state.existingGrant,
      error: null,
    }),
    revokeDisclosureGrantRecord: async () => ({
      grant: buildGrant({ status: "revoked", revoked_at: "2026-06-15T12:02:00.000Z" }),
      error: null,
    }),
    revokeActiveDisclosureAccessSessionsForGrant: async () => ({
      sessions: [{ session_id: "33333333-3333-4333-8333-333333333333" }],
      error: null,
    }),
    appendDisclosureGrantEvent: async (event) => {
      state.events.push(event);
      return { event, error: null };
    },
  },
});

const { POST } = await import("../../app/api/vault/disclosure-grants/[id]/revoke/route.js");

test("owner can revoke a disclosure grant and invalidate active sessions", async () => {
  resetState();
  const response = await POST(
    new Request(`http://localhost/api/vault/disclosure-grants/${GRANT_ID}/revoke`, {
      method: "POST",
      body: "{}",
    }),
    { params: { id: GRANT_ID } }
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.grant.status, "revoked");
  assert.equal(json.revoked_sessions, 1);
  assert.equal(state.events[0].eventType, "grant.revoked");
  assert.equal(state.events[0].reasonCode, "owner_revoked");
});

test("revoke denies when owner authority fails", async () => {
  resetState();
  state.authority = {
    ok: false,
    status: 403,
    payload: {
      success: false,
      code: "OWNERSHIP_VERIFICATION_REQUIRED",
      error: "Vault ownership verification is required before disclosure grants.",
    },
  };

  const response = await POST(
    new Request(`http://localhost/api/vault/disclosure-grants/${GRANT_ID}/revoke`, {
      method: "POST",
      body: "{}",
    }),
    { params: { id: GRANT_ID } }
  );
  const json = await response.json();

  assert.equal(response.status, 403);
  assert.equal(json.success, false);
  assert.equal(json.code, "OWNERSHIP_VERIFICATION_REQUIRED");
});

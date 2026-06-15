import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "node:module";
import {
  issueDisclosureConfirmationNonce,
  resetDisclosureConfirmationsForTests,
} from "../../app/lib/vaultDisclosureConfirmation.js";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const GRANT_ID = "11111111-1111-4111-8111-111111111111";
const state = {
  authority: {
    ok: true,
    vaultRefHash: "v".repeat(64),
    deviceRefHash: "d".repeat(64),
    registration: {
      vault_id: "22222222-2222-4222-8222-222222222222",
      created_at: "2026-06-15T12:00:00.000Z",
    },
  },
  counterCalls: [],
  createdRecord: null,
  appendedEvent: null,
};

mock.module("../../app/lib/vaultDisclosureAuthority.js", {
  exports: {
    authorizeDisclosureOwnerRequest: async () => state.authority,
  },
});

mock.module("../../app/lib/vaultAdmin.js", {
  exports: {
    listVaultCustodyMigrations: async () => ({ migrations: [], error: null }),
  },
});

mock.module("../../app/lib/vaultDisclosureGrantStore.js", {
  exports: {
    createDisclosureGrantRecord: async (record) => {
      state.createdRecord = record;
      return {
        grant: {
          grant_id: GRANT_ID,
          ...record,
          access_count: 0,
          created_at: "2026-06-15T12:00:00.000Z",
          updated_at: "2026-06-15T12:00:00.000Z",
          revoked_at: null,
        },
        error: null,
      };
    },
    appendDisclosureGrantEvent: async (event) => {
      state.appendedEvent = event;
      return { event: { event_id: "event-1", ...event }, error: null };
    },
  },
});

mock.module("../../app/lib/vaultDisclosureSentinelCounters.js", {
  exports: {
    VAULT_DISCLOSURE_SENTINEL_COUNTERS: {
      GRANT_CREATED_TOTAL: "vault.disclosure.grant.created_total",
    },
    recordVaultDisclosureSentinelCounter: (key) => state.counterCalls.push(key),
    recordVaultDisclosureCreationContextCounters: () => {},
  },
});

const { POST } = await import("../../app/api/vault/disclosure-grants/create/route.js");

function resetState() {
  resetDisclosureConfirmationsForTests();
  state.counterCalls = [];
  state.createdRecord = null;
  state.appendedEvent = null;
  state.authority = {
    ok: true,
    vaultRefHash: "v".repeat(64),
    deviceRefHash: "d".repeat(64),
    registration: {
      vault_id: "22222222-2222-4222-8222-222222222222",
      created_at: "2026-06-15T12:00:00.000Z",
    },
  };
}

test("disclosure create succeeds with owner authority and fresh confirmation", async () => {
  resetState();
  const confirmation = issueDisclosureConfirmationNonce({
    vaultRefHash: state.authority.vaultRefHash,
    deviceRefHash: state.authority.deviceRefHash,
  });
  const response = await POST(
    new Request("http://localhost/api/vault/disclosure-grants/create", {
      method: "POST",
      body: JSON.stringify({
        grant_type: "verify_only",
        purpose_label: "Education verification",
        recipient_challenge: "recipient-challenge-value",
        confirmation_nonce: confirmation.confirmationNonce,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      }),
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.grant.grant_id, GRANT_ID);
  assert.equal(json.grant.public_handle_hash, undefined);
  assert.equal(json.grant.recipient_binding_hash, undefined);
  assert.equal(json.recipient_delivery.recipient_challenge_required, true);
  assert.equal(typeof json.recipient_delivery.grant_handle, "string");
  assert.equal(state.createdRecord.grant_type, "verify_only");
  assert.equal(state.createdRecord.status, "active");
  assert.equal(state.createdRecord.public_handle_hash.length, 64);
  assert.equal(state.createdRecord.recipient_binding_hash.length, 64);
  assert.equal(state.appendedEvent.eventType, "grant.created");
  assert.deepEqual(state.counterCalls, ["vault.disclosure.grant.created_total"]);
});

test("disclosure create denies unsupported grants before persistence", async () => {
  resetState();
  const response = await POST(
    new Request("http://localhost/api/vault/disclosure-grants/create", {
      method: "POST",
      body: JSON.stringify({
        grant_type: "view_only",
        purpose_label: "Bad",
        recipient_challenge: "recipient-challenge-value",
        confirmation_nonce: "fresh-server-issued-nonce",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      }),
    })
  );
  const json = await response.json();

  assert.equal(response.status, 400);
  assert.equal(json.success, false);
  assert.equal(json.code, "INVALID_DISCLOSURE_GRANT_REQUEST");
  assert.equal(state.createdRecord, null);
});

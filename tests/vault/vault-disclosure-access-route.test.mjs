import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "node:module";
import {
  DISCLOSURE_ACTOR_TYPES,
  DISCLOSURE_EVENT_RESULTS,
  DISCLOSURE_GRANT_EVENT_TYPES,
  DISCLOSURE_GRANT_TYPE_SCOPED_VERIFY,
  buildDisclosureGrantEventRecord,
  buildPublicHandleHash,
  buildRecipientBindingHash,
  buildSessionTokenHash,
  generateDisclosureToken,
} from "../../app/lib/vaultDisclosureGrant.js";
import {
  DISCLOSURE_POLICY_SCOPE_VAULT_CLAIM,
  buildDisclosurePolicyRecord,
} from "../../app/lib/vaultDisclosurePolicy.js";
import {
  computeDisclosureCustodySnapshotHash,
  computeDisclosureDigest,
} from "../../app/lib/vaultDisclosureReceipt.js";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const GRANT_ID = "22222222-2222-4222-8222-222222222222";
const POLICY_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const GRANT_HANDLE = generateDisclosureToken();
const SESSION_TOKEN = generateDisclosureToken();
const RECIPIENT_CHALLENGE = "recipient-challenge-value-12345";
const VAULT_REF = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SCOPE_REF = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const RECIPIENT_HASH = buildRecipientBindingHash(RECIPIENT_CHALLENGE);

const policy = buildDisclosurePolicyRecord({
  policyId: POLICY_ID,
  vaultRefHash: VAULT_REF,
  createdByDeviceRef: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  scopeType: DISCLOSURE_POLICY_SCOPE_VAULT_CLAIM,
  scopeRefHash: SCOPE_REF,
  grantType: DISCLOSURE_GRANT_TYPE_SCOPED_VERIFY,
  recipientBindingHash: RECIPIENT_HASH,
  purposeLabel: "Education verification",
  conditionProfile: {
    not_before: null,
    max_access_count: 1,
    require_custody_eligible: true,
  },
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
});

const state = {
  grant: {
    grant_id: GRANT_ID,
    public_handle_hash: buildPublicHandleHash(GRANT_HANDLE),
    vault_ref_hash: VAULT_REF,
    policy_ref: POLICY_ID,
    scope_type: DISCLOSURE_POLICY_SCOPE_VAULT_CLAIM,
    scope_ref_hash: SCOPE_REF,
    grant_type: DISCLOSURE_GRANT_TYPE_SCOPED_VERIFY,
    status: "active",
    purpose_label: policy.purpose_label,
    recipient_binding_hash: RECIPIENT_HASH,
    expires_at: policy.expires_at,
    access_count: 0,
    max_access_count: 1,
  },
  session: {
    session_id: SESSION_ID,
    grant_ref: GRANT_ID,
    recipient_binding_hash: RECIPIENT_HASH,
    session_token_hash: buildSessionTokenHash(SESSION_TOKEN),
    status: "active",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    access_count: 0,
  },
  policy,
  custodyEligible: true,
  accessCalls: 0,
};

function resetState() {
  state.grant.access_count = 0;
  state.session.access_count = 0;
  state.custodyEligible = true;
  state.accessCalls = 0;
}

mock.module("../../app/lib/vaultDisclosureGrantStore.js", {
  exports: {
    getDisclosureGrantRecordByHandleHash: async () => ({ grant: state.grant, error: null }),
    markDisclosureGrantExpiredRecord: async () => ({ grant: null, error: null }),
    appendDisclosureGrantEvent: async (event) => ({ event, error: null }),
    getDisclosureAccessSessionByTokenHash: async ({ sessionTokenHash }) => {
      if (state.session.session_token_hash !== sessionTokenHash) {
        return { session: null, error: null };
      }
      return { session: state.session, error: null };
    },
    completeDisclosureAccessAtomic: async () => {
      state.accessCalls += 1;
      const previousEventHash = buildDisclosureGrantEventRecord({
        grantRef: GRANT_ID,
        eventType: DISCLOSURE_GRANT_EVENT_TYPES.RECIPIENT_ACCEPTED,
        actorType: DISCLOSURE_ACTOR_TYPES.RECIPIENT,
        result: DISCLOSURE_EVENT_RESULTS.SUCCESS,
        timestamp: "2026-06-15T12:00:00.000Z",
      }).event_hash;
      const event = buildDisclosureGrantEventRecord({
        grantRef: GRANT_ID,
        eventType: DISCLOSURE_GRANT_EVENT_TYPES.ACCESS_RECEIPTED,
        actorType: DISCLOSURE_ACTOR_TYPES.RECIPIENT,
        result: DISCLOSURE_EVENT_RESULTS.SUCCESS,
        previousEventHash,
        timestamp: "2026-06-15T12:01:00.000Z",
      });
      const custodySnapshotHash = computeDisclosureCustodySnapshotHash({
        eligible: true,
        compromised: false,
        deleted: false,
        retired: false,
      });
      const disclosureDigest = computeDisclosureDigest({
        grantType: DISCLOSURE_GRANT_TYPE_SCOPED_VERIFY,
        scopeType: policy.scope_type,
        purposeLabel: policy.purpose_label,
        policySnapshotHash: policy.policy_snapshot_hash,
      });
      return {
        event,
        grant: { ...state.grant, access_count: 1 },
        session: { ...state.session, access_count: 1 },
        receipt: {
          receipt_id: "55555555-5555-4555-8555-555555555555",
          receipt_hash: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
          policy_snapshot_hash: policy.policy_snapshot_hash,
          custody_snapshot_hash: custodySnapshotHash,
          disclosure_digest: disclosureDigest,
          created_at: "2026-06-15T12:01:00.000Z",
        },
        error: null,
      };
    },
  },
});

mock.module("../../app/lib/vaultDisclosurePolicyStore.js", {
  exports: {
    getDisclosurePolicyRecordById: async (policyId) => {
      if (policyId !== POLICY_ID) {
        return { policy: null, error: null };
      }
      return { policy: state.policy, error: null };
    },
  },
});

mock.module("../../app/lib/vaultDisclosureCustodyEligibility.js", {
  exports: {
    evaluateDisclosureCustodyEligibility: async () => ({
      eligible: state.custodyEligible,
      reasonCode: state.custodyEligible ? null : "custody_ineligible",
      custodySnapshotHash: computeDisclosureCustodySnapshotHash({
        eligible: state.custodyEligible,
        compromised: !state.custodyEligible,
        deleted: false,
        retired: false,
      }),
      snapshot: { eligible: state.custodyEligible },
    }),
  },
});

mock.module("../../app/lib/vaultDisclosureRateLimit.js", {
  exports: {
    checkDisclosureVerifyRateLimit: () => ({ allowed: true }),
    recordDisclosureRecipientFailure: () => {},
  },
});

mock.module("../../app/lib/vaultDisclosureSentinelCounters.js", {
  exports: {
    recordVaultDisclosureSentinelCounter: () => {},
    VAULT_DISCLOSURE_SENTINEL_COUNTERS: {
      RATE_LIMITED_TOTAL: "vault.disclosure.rate_limited_total",
      FAILED_VERIFY_TOTAL: "vault.disclosure.failed_verify_total",
      EXPIRED_ATTEMPT_TOTAL: "vault.disclosure.expired_attempt_total",
      REVOKED_ATTEMPT_TOTAL: "vault.disclosure.revoked_attempt_total",
      REPEATED_RECIPIENT_TOTAL: "vault.disclosure.repeated_recipient_total",
    },
  },
});

async function accessRequest() {
  const { GET } = await import("../../app/api/disclosure/[grant_handle]/access/route.js");
  return GET(
    new Request(`http://localhost/api/disclosure/${GRANT_HANDLE}/access`, {
      method: "GET",
      headers: {
        "x-prooforigin-disclosure-session": SESSION_TOKEN,
      },
    }),
    { params: { grant_handle: GRANT_HANDLE } }
  );
}

test("scoped verify access returns receipt metadata without privacy leaks", async () => {
  resetState();
  const response = await accessRequest();
  const json = await response.json();
  const serialized = JSON.stringify(json).toLowerCase();

  assert.equal(response.status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.grant_type, DISCLOSURE_GRANT_TYPE_SCOPED_VERIFY);
  assert.equal(json.receipt?.receipt_hash?.length, 64);
  assert.equal(state.accessCalls, 1);
  assert.equal(serialized.includes("vault_id"), false);
  assert.equal(serialized.includes("document_id"), false);
  assert.equal(serialized.includes("ciphertext"), false);
});

test("scoped verify access fails closed when custody is ineligible", async () => {
  resetState();
  state.custodyEligible = false;

  const response = await accessRequest();
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.equal(json.ok, false);
  assert.equal(json.status, "unavailable");
  assert.equal(state.accessCalls, 0);
});

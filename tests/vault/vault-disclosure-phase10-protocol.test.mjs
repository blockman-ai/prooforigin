import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DISCLOSURE_PROTOCOL_INVARIANTS,
  computeDisclosureConditionProfileHash,
  computeDisclosurePolicySnapshotHash,
  DISCLOSURE_CONDITION_PHASE_ACCESS,
  DISCLOSURE_CONDITION_PHASE_CREATE,
  DISCLOSURE_CONDITION_REASON_CODES,
  DISCLOSURE_GRANT_TYPE_SCOPED_VERIFY,
  DISCLOSURE_POLICY_SCOPE_DOCUMENT_REF,
  DISCLOSURE_POLICY_SCOPE_VAULT_CLAIM,
  buildDisclosurePolicyRecord,
  buildDocumentScopeRefHash,
  evaluateDisclosureConditionPhase,
  validateCreateDisclosurePolicyInput,
} from "../../app/lib/vaultDisclosurePolicy.js";
import { compareDisclosureGrantEventsForChain } from "../../app/lib/vaultDisclosureGrant.js";
import {
  buildDisclosureReceiptRecord,
  computeDisclosureCustodySnapshotHash,
  computeDisclosureDigest,
  computeDisclosureReceiptHash,
} from "../../app/lib/vaultDisclosureReceipt.js";

const POLICY_ID = "11111111-1111-4111-8111-111111111111";
const GRANT_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const EVENT_ID = "44444444-4444-4444-8444-444444444444";
const VAULT_REF = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const DEVICE_REF = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const SCOPE_REF = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const RECIPIENT_HASH = "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";

test("protocol invariants document fail-closed and hash-only storage", () => {
  assert.equal(typeof DISCLOSURE_PROTOCOL_INVARIANTS.FAIL_CLOSED, "string");
  assert.match(DISCLOSURE_PROTOCOL_INVARIANTS.HASH_ONLY_STORAGE, /hashes only/);
  assert.match(DISCLOSURE_PROTOCOL_INVARIANTS.LEGACY_VERIFY_ONLY, /verify_only/);
});

test("policy snapshot and condition profile hashes are stable", () => {
  const conditionProfile = {
    not_before: null,
    max_access_count: 2,
    require_custody_eligible: true,
  };
  const conditionProfileHash = computeDisclosureConditionProfileHash(conditionProfile);
  const policy = buildDisclosurePolicyRecord({
    policyId: POLICY_ID,
    vaultRefHash: VAULT_REF,
    createdByDeviceRef: DEVICE_REF,
    scopeType: DISCLOSURE_POLICY_SCOPE_VAULT_CLAIM,
    scopeRefHash: SCOPE_REF,
    grantType: DISCLOSURE_GRANT_TYPE_SCOPED_VERIFY,
    recipientBindingHash: RECIPIENT_HASH,
    purposeLabel: "Education verification",
    conditionProfile,
    expiresAt: "2026-12-31T12:00:00.000Z",
  });

  assert.equal(policy.condition_profile_hash, conditionProfileHash);
  assert.equal(
    policy.policy_snapshot_hash,
    computeDisclosurePolicySnapshotHash({
      policy_id: POLICY_ID,
      policy_version: 1,
      vault_ref_hash: VAULT_REF,
      created_by_device_ref: DEVICE_REF,
      scope_type: DISCLOSURE_POLICY_SCOPE_VAULT_CLAIM,
      scope_ref_hash: SCOPE_REF,
      grant_type: DISCLOSURE_GRANT_TYPE_SCOPED_VERIFY,
      recipient_binding_mode: "challenge_hash",
      recipient_binding_hash: RECIPIENT_HASH,
      purpose_label: "Education verification",
      condition_profile_hash: conditionProfileHash,
      status: "active",
      expires_at: "2026-12-31T12:00:00.000Z",
    })
  );
});

test("validateCreateDisclosurePolicyInput requires document_id for document scope", () => {
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  assert.throws(
    () =>
      validateCreateDisclosurePolicyInput(
        JSON.stringify({
          confirmation_nonce: "nonce-value",
          scope_type: DISCLOSURE_POLICY_SCOPE_DOCUMENT_REF,
          grant_type: DISCLOSURE_GRANT_TYPE_SCOPED_VERIFY,
          purpose_label: "Scoped verify",
          recipient_challenge: "recipient-challenge-value",
          expires_at: expiresAt,
        })
      ),
    /document_id is required/
  );

  const input = validateCreateDisclosurePolicyInput(
    JSON.stringify({
      confirmation_nonce: "nonce-value",
      scope_type: DISCLOSURE_POLICY_SCOPE_VAULT_CLAIM,
      grant_type: DISCLOSURE_GRANT_TYPE_SCOPED_VERIFY,
      purpose_label: "Scoped verify",
      recipient_challenge: "recipient-challenge-value",
      expires_at: expiresAt,
      max_access_count: 1,
    })
  );

  assert.equal(input.scopeType, DISCLOSURE_POLICY_SCOPE_VAULT_CLAIM);
  assert.equal(input.grantType, DISCLOSURE_GRANT_TYPE_SCOPED_VERIFY);
});

test("evaluateDisclosureConditionPhase blocks custody ineligible access", () => {
  const policy = buildDisclosurePolicyRecord({
    policyId: POLICY_ID,
    vaultRefHash: VAULT_REF,
    createdByDeviceRef: DEVICE_REF,
    scopeType: DISCLOSURE_POLICY_SCOPE_DOCUMENT_REF,
    scopeRefHash: SCOPE_REF,
    grantType: DISCLOSURE_GRANT_TYPE_SCOPED_VERIFY,
    recipientBindingHash: RECIPIENT_HASH,
    purposeLabel: "Scoped verify",
    conditionProfile: {
      not_before: null,
      max_access_count: 1,
      require_custody_eligible: true,
    },
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  const createResult = evaluateDisclosureConditionPhase({
    phase: DISCLOSURE_CONDITION_PHASE_CREATE,
    policy,
    custodyEligibility: { eligible: false },
  });
  assert.equal(createResult.allowed, false);
  assert.ok(createResult.reasonCodes.includes(DISCLOSURE_CONDITION_REASON_CODES.CUSTODY_INELIGIBLE));

  const accessResult = evaluateDisclosureConditionPhase({
    phase: DISCLOSURE_CONDITION_PHASE_ACCESS,
    policy,
    grant: {
      status: "active",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      access_count: 0,
      max_access_count: 1,
      recipient_binding_hash: RECIPIENT_HASH,
    },
    session: {
      status: "active",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      recipient_binding_hash: RECIPIENT_HASH,
    },
    custodyEligibility: { eligible: false },
  });
  assert.equal(accessResult.allowed, false);
  assert.ok(accessResult.reasonCodes.includes(DISCLOSURE_CONDITION_REASON_CODES.CUSTODY_INELIGIBLE));
});

test("receipt hash is stable for canonical payload", () => {
  const custodySnapshotHash = computeDisclosureCustodySnapshotHash({
    eligible: true,
    compromised: false,
    deleted: false,
    retired: false,
  });
  const disclosureDigest = computeDisclosureDigest({
    grantType: DISCLOSURE_GRANT_TYPE_SCOPED_VERIFY,
    scopeType: DISCLOSURE_POLICY_SCOPE_VAULT_CLAIM,
    purposeLabel: "Education verification",
    policySnapshotHash: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  });
  const receipt = buildDisclosureReceiptRecord({
    receiptId: "55555555-5555-4555-8555-555555555555",
    grantRef: GRANT_ID,
    policyRef: POLICY_ID,
    sessionRef: SESSION_ID,
    eventRef: EVENT_ID,
    scopeType: DISCLOSURE_POLICY_SCOPE_VAULT_CLAIM,
    scopeRefHash: SCOPE_REF,
    recipientBindingHash: RECIPIENT_HASH,
    policySnapshotHash: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    conditionProfileHash: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    custodySnapshotHash,
    disclosureDigest,
    createdAt: "2026-06-16T12:00:00.000Z",
  });

  assert.equal(
    receipt.receipt_hash,
    computeDisclosureReceiptHash({
      receiptId: "55555555-5555-4555-8555-555555555555",
      grantRef: GRANT_ID,
      policyRef: POLICY_ID,
      sessionRef: SESSION_ID,
      eventRef: EVENT_ID,
      scopeType: DISCLOSURE_POLICY_SCOPE_VAULT_CLAIM,
      scopeRefHash: SCOPE_REF,
      recipientBindingHash: RECIPIENT_HASH,
      policySnapshotHash: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      conditionProfileHash: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      custodySnapshotHash,
      disclosureDigest,
      createdAt: "2026-06-16T12:00:00.000Z",
    })
  );
});

test("document scope ref hash is namespaced and deterministic", () => {
  const documentId = "66666666-6666-4666-8666-666666666666";
  const first = buildDocumentScopeRefHash(documentId);
  const second = buildDocumentScopeRefHash(documentId);
  assert.equal(first, second);
  assert.equal(first.length, 64);
});

test("compareDisclosureGrantEventsForChain tiebreaker still applies for phase 10 events", () => {
  const earlier = { timestamp: "2026-06-16T12:00:00.000Z", event_id: "11111111-1111-4111-8111-111111111111" };
  const later = { timestamp: "2026-06-16T12:00:00.000Z", event_id: "22222222-2222-4222-8222-222222222222" };
  assert.equal(compareDisclosureGrantEventsForChain(earlier, later) < 0, true);
});

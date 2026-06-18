import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDisclosureGrantEventRecord,
  DISCLOSURE_ACTOR_TYPES,
  DISCLOSURE_EVENT_RESULTS,
  DISCLOSURE_GRANT_EVENT_TYPES,
} from "../../app/lib/vaultDisclosureGrant.js";
import {
  buildDisclosureReceiptRecord,
  buildPublicReceiptVerifyResponse,
  buildUniformReceiptVerifyDeniedResponse,
  constantTimeEqualHex,
  isValidReceiptHash,
  serializePublicDisclosureReceipt,
  validateReceiptId,
  verifyPublicDisclosureReceipt,
} from "../../app/lib/vaultDisclosureReceipt.js";
import { DISCLOSURE_POLICY_SCOPE_VAULT_CLAIM } from "../../app/lib/vaultDisclosurePolicy.js";
import {
  buildReceiptVerifyPagePath,
  DISCLOSURE_RECEIPT_VERIFY_COPY,
  getReceiptVerifyPresentation,
  isUniformReceiptVerifyDenial,
  resolveReceiptVerifyPhase,
} from "../../app/lib/disclosureReceiptVerifyClient.js";

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

function buildEventChain({ receiptEventType = DISCLOSURE_GRANT_EVENT_TYPES.ACCESS_RECEIPTED } = {}) {
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
    eventType: receiptEventType,
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

test("validateReceiptId and isValidReceiptHash enforce canonical formats", () => {
  assert.equal(validateReceiptId(RECEIPT_ID), RECEIPT_ID.toLowerCase());
  assert.throws(() => validateReceiptId("not-a-uuid"), /valid UUID/);
  assert.equal(isValidReceiptHash("A".repeat(64)), true);
  assert.equal(isValidReceiptHash("short"), false);
});

test("serializePublicDisclosureReceipt exposes only safe public fields", () => {
  const receipt = buildReceipt();
  const serialized = serializePublicDisclosureReceipt(receipt);
  assert.deepEqual(Object.keys(serialized).sort(), [
    "created_at",
    "custody_snapshot_hash",
    "disclosure_digest",
    "event_ref",
    "policy_snapshot_hash",
    "receipt_hash",
    "receipt_id",
    "result",
    "scope_type",
  ]);
  assert.equal(serialized.grant_ref, undefined);
  assert.equal(serialized.recipient_binding_hash, undefined);
});

test("verifyPublicDisclosureReceipt happy path verifies receipt and chain", () => {
  const receipt = buildReceipt();
  const events = buildEventChain();
  const result = verifyPublicDisclosureReceipt({
    receipt,
    submittedReceiptHash: receipt.receipt_hash,
    events,
  });

  assert.equal(result.kind, "verified");
  assert.equal(result.verified, true);
  assert.deepEqual(result.checks, {
    receipt_hash_match: true,
    receipt_integrity: true,
    event_chain_verified: true,
    access_receipted_event: true,
  });
});

test("verifyPublicDisclosureReceipt denies without hash proof", () => {
  const receipt = buildReceipt();
  const result = verifyPublicDisclosureReceipt({
    receipt,
    submittedReceiptHash: "1".repeat(64),
    events: buildEventChain(),
  });
  assert.equal(result.kind, "denied");
});

test("verifyPublicDisclosureReceipt reports integrity failure after hash proof", () => {
  const receipt = buildReceipt();
  const tampered = {
    ...receipt,
    scope_type: "document_ref",
  };
  const result = verifyPublicDisclosureReceipt({
    receipt: tampered,
    submittedReceiptHash: receipt.receipt_hash,
    events: buildEventChain(),
  });

  assert.equal(result.kind, "integrity_failed");
  assert.equal(result.verified, false);
  assert.equal(result.checks.receipt_hash_match, true);
  assert.equal(result.checks.receipt_integrity, false);
});

test("verifyPublicDisclosureReceipt reports broken event chain after hash proof", () => {
  const receipt = buildReceipt();
  const events = buildEventChain();
  events[2] = { ...events[2], event_hash: "0".repeat(64) };

  const result = verifyPublicDisclosureReceipt({
    receipt,
    submittedReceiptHash: receipt.receipt_hash,
    events,
  });

  assert.equal(result.kind, "integrity_failed");
  assert.equal(result.checks.event_chain_verified, false);
  assert.equal(result.chain.verified, false);
});

test("verifyPublicDisclosureReceipt rejects non access.receipted event refs", () => {
  const receipt = buildReceipt({ eventRef: "22222222-2222-4222-8222-222222222222" });
  const result = verifyPublicDisclosureReceipt({
    receipt,
    submittedReceiptHash: receipt.receipt_hash,
    events: buildEventChain(),
  });

  assert.equal(result.kind, "integrity_failed");
  assert.equal(result.checks.access_receipted_event, false);
});

test("buildPublicReceiptVerifyResponse maps verified and denied states", () => {
  const receipt = buildReceipt();
  const verified = verifyPublicDisclosureReceipt({
    receipt,
    submittedReceiptHash: receipt.receipt_hash,
    events: buildEventChain(),
  });
  const verifiedPayload = buildPublicReceiptVerifyResponse(verified);
  assert.equal(verifiedPayload.ok, true);
  assert.equal(verifiedPayload.verified, true);
  assert.equal(verifiedPayload.receipt.grant_ref, undefined);

  const deniedPayload = buildPublicReceiptVerifyResponse({ kind: "denied" });
  assert.deepEqual(deniedPayload, buildUniformReceiptVerifyDeniedResponse());
});

test("constantTimeEqualHex compares hashes safely", () => {
  const hash = "a".repeat(64);
  assert.equal(constantTimeEqualHex(hash, hash), true);
  assert.equal(constantTimeEqualHex(hash, "b".repeat(64)), false);
  assert.equal(constantTimeEqualHex(hash, "short"), false);
});

test("receipt verify client helpers map phases and copy", () => {
  assert.equal(
    resolveReceiptVerifyPhase(200, { verified: true, status: "verified" }),
    "authentic"
  );
  assert.equal(
    resolveReceiptVerifyPhase(200, { verified: false, status: "integrity_failed" }),
    "integrity_warning"
  );
  assert.equal(resolveReceiptVerifyPhase(404, { status: "unavailable" }), "denied");
  assert.equal(
    getReceiptVerifyPresentation("authentic").headline,
    DISCLOSURE_RECEIPT_VERIFY_COPY.AUTHENTIC_HEADLINE
  );
  assert.equal(
    buildReceiptVerifyPagePath(RECEIPT_ID),
    `/verify/receipt?receipt_id=${encodeURIComponent(RECEIPT_ID)}`
  );
  assert.equal(
    isUniformReceiptVerifyDenial(buildUniformReceiptVerifyDeniedResponse()),
    true
  );
});

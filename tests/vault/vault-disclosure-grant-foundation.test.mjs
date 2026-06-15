import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDisclosureGrantEventRecord,
  buildVerifyOnlyDisclosureResponse,
  DISCLOSURE_ACTOR_TYPES,
  DISCLOSURE_EVENT_RESULTS,
  DISCLOSURE_GRANT_EVENT_TYPES,
  validateCreateVerifyDisclosureGrantInput,
  verifyDisclosureGrantEventChainRecords,
} from "../../app/lib/vaultDisclosureGrant.js";

test("verify-only grant creation input requires confirmation nonce and one recipient", () => {
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const input = validateCreateVerifyDisclosureGrantInput(
    JSON.stringify({
      grant_type: "verify_only",
      purpose_label: "Education verification",
      recipient_challenge: "recipient-challenge-value",
      confirmation_nonce: "fresh-server-issued-nonce",
      expires_at: expiresAt,
      max_access_count: 2,
    })
  );

  assert.equal(input.grantType, "verify_only");
  assert.equal(input.purposeLabel, "Education verification");
  assert.equal(input.confirmationNonce, "fresh-server-issued-nonce");
  assert.equal(input.maxAccessCount, 2);
  assert.equal(input.expiresAt, expiresAt);

  assert.throws(
    () =>
      validateCreateVerifyDisclosureGrantInput(
        JSON.stringify({
          grant_type: "view_only",
          purpose_label: "Nope",
          recipient_challenge: "recipient-challenge-value",
          confirmation_nonce: "fresh-server-issued-nonce",
          expires_at: expiresAt,
        })
      ),
    /Only verify_only/
  );

  assert.throws(
    () =>
      validateCreateVerifyDisclosureGrantInput(
        JSON.stringify({
          grant_type: "verify_only",
          purpose_label: "Nope",
          recipients: [{ challenge: "one" }, { challenge: "two" }],
          confirmation_nonce: "fresh-server-issued-nonce",
          expires_at: expiresAt,
        })
      ),
    /Exactly one recipient/
  );

  assert.throws(
    () =>
      validateCreateVerifyDisclosureGrantInput(
        JSON.stringify({
          grant_type: "verify_only",
          purpose_label: "Nope",
          recipient_challenge: "recipient-challenge-value",
          expires_at: expiresAt,
        })
      ),
    /confirmation_nonce is required/
  );
});

test("verify-only response exposes no raw ids, hashes, storage paths, ciphertext, or secrets", () => {
  const response = buildVerifyOnlyDisclosureResponse({
    purposeLabel: "Medical review",
    expiresAt: "2026-06-20T12:00:00.000Z",
    now: new Date("2026-06-15T12:00:00.000Z"),
  });
  const serialized = JSON.stringify(response).toLowerCase();

  assert.deepEqual(Object.keys(response).sort(), [
    "claim",
    "expires_at",
    "grant_type",
    "ok",
    "status",
    "verified_at",
  ]);
  for (const forbidden of [
    "document_id",
    "vault_id",
    "hash",
    "storage",
    "ciphertext",
    "secret",
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("disclosure grant events are append-only hash-chain verifiable and sanitize metadata", () => {
  const grantRef = "11111111-1111-4111-8111-111111111111";
  const created = buildDisclosureGrantEventRecord({
    grantRef,
    eventType: DISCLOSURE_GRANT_EVENT_TYPES.CREATED,
    actorType: DISCLOSURE_ACTOR_TYPES.OWNER,
    result: DISCLOSURE_EVENT_RESULTS.SUCCESS,
    metadata: {
      grant_type: "verify_only",
      ciphertext: "must-not-store",
      public_handle_hash: "must-not-store",
      safe_count: 1,
    },
    timestamp: "2026-06-15T12:00:00.000Z",
  });
  const verified = buildDisclosureGrantEventRecord({
    grantRef,
    eventType: DISCLOSURE_GRANT_EVENT_TYPES.VERIFIED,
    actorType: DISCLOSURE_ACTOR_TYPES.RECIPIENT,
    result: DISCLOSURE_EVENT_RESULTS.SUCCESS,
    previousEventHash: created.event_hash,
    timestamp: "2026-06-15T12:01:00.000Z",
  });

  assert.equal(created.metadata.ciphertext, undefined);
  assert.equal(created.metadata.public_handle_hash, undefined);
  assert.equal(created.metadata.safe_count, 1);

  const chain = verifyDisclosureGrantEventChainRecords({
    grantRef,
    events: [
      { event_id: "event-1", ...created },
      { event_id: "event-2", ...verified },
    ],
  });
  assert.equal(chain.verified, true);

  const broken = verifyDisclosureGrantEventChainRecords({
    grantRef,
    events: [
      { event_id: "event-1", ...created },
      { event_id: "event-2", ...verified, event_hash: "0".repeat(64) },
    ],
  });
  assert.equal(broken.verified, false);
  assert.equal(broken.broken_at, "event-2");
});

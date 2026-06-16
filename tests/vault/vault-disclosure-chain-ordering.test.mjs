import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDisclosureGrantEventRecord,
  compareDisclosureGrantEventsForChain,
  DISCLOSURE_ACTOR_TYPES,
  DISCLOSURE_EVENT_GENESIS_HASH,
  DISCLOSURE_EVENT_RESULTS,
  DISCLOSURE_GRANT_EVENT_TYPES,
  sortDisclosureGrantEventsForChain,
  verifyDisclosureGrantEventChainRecords,
} from "../../app/lib/vaultDisclosureGrant.js";

const GRANT_REF = "55555555-5555-4555-8555-555555555555";
const SHARED_TIMESTAMP = "2026-06-16T12:00:00.000Z";

test("compareDisclosureGrantEventsForChain uses event_id tiebreaker", () => {
  const earlier = { timestamp: SHARED_TIMESTAMP, event_id: "11111111-1111-4111-8111-111111111111" };
  const later = { timestamp: SHARED_TIMESTAMP, event_id: "22222222-2222-4222-8222-222222222222" };

  assert.equal(compareDisclosureGrantEventsForChain(earlier, later) < 0, true);
  assert.equal(compareDisclosureGrantEventsForChain(later, earlier) > 0, true);
});

test("verifyDisclosureGrantEventChainRecords sorts same-millisecond events by event_id", () => {
  const created = buildDisclosureGrantEventRecord({
    grantRef: GRANT_REF,
    eventType: DISCLOSURE_GRANT_EVENT_TYPES.CREATED,
    actorType: DISCLOSURE_ACTOR_TYPES.OWNER,
    result: DISCLOSURE_EVENT_RESULTS.SUCCESS,
    timestamp: SHARED_TIMESTAMP,
  });
  const accepted = buildDisclosureGrantEventRecord({
    grantRef: GRANT_REF,
    eventType: DISCLOSURE_GRANT_EVENT_TYPES.RECIPIENT_ACCEPTED,
    actorType: DISCLOSURE_ACTOR_TYPES.RECIPIENT,
    result: DISCLOSURE_EVENT_RESULTS.SUCCESS,
    previousEventHash: created.event_hash,
    timestamp: SHARED_TIMESTAMP,
  });

  const chain = verifyDisclosureGrantEventChainRecords({
    grantRef: GRANT_REF,
    events: [
      {
        event_id: "22222222-2222-4222-8222-222222222222",
        grant_ref: GRANT_REF,
        ...accepted,
      },
      {
        event_id: "11111111-1111-4111-8111-111111111111",
        grant_ref: GRANT_REF,
        ...created,
      },
    ],
  });

  assert.equal(chain.verified, true);
});

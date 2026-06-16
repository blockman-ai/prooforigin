import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DISCLOSURE_ACTOR_TYPES,
  DISCLOSURE_EVENT_RESULTS,
  DISCLOSURE_GRANT_EVENT_TYPES,
} from "../../app/lib/vaultDisclosureGrant.js";

test("appendDisclosureGrantEvent retries after hash-chain fork errors", async () => {
  const grantRef = "33333333-3333-4333-8333-333333333333";
  const previousHashes = [
    "1111111111111111111111111111111111111111111111111111111111111111",
    "2222222222222222222222222222222222222222222222222222222222222222",
  ];
  let latestIndex = 0;
  let insertAttempts = 0;

  const supabase = {
    from(table) {
      assert.equal(table, "disclosure_grant_events");
      return {
        select() {
          return {
            eq() {
              return {
                order() {
                  return {
                    limit() {
                      return {
                        async maybeSingle() {
                          return {
                            data: { event_hash: previousHashes[latestIndex] },
                            error: null,
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
        insert(record) {
          insertAttempts += 1;
          if (insertAttempts === 1) {
            latestIndex = 1;
            return {
              select() {
                return {
                  async single() {
                    return {
                      data: null,
                      error: {
                        code: "23505",
                        message: "duplicate key value violates unique constraint disclosure_grant_events_grant_prev_hash_uidx",
                      },
                    };
                  },
                };
              },
            };
          }

          return {
            select() {
              return {
                async single() {
                  return {
                    data: {
                      event_id: "event-retry-success",
                      grant_ref: record.grant_ref,
                      event_type: record.event_type,
                      actor_type: record.actor_type,
                      result: record.result,
                      reason_code: record.reason_code,
                      timestamp: record.timestamp,
                      previous_event_hash: record.previous_event_hash,
                      event_hash: record.event_hash,
                      metadata: record.metadata,
                    },
                    error: null,
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  const { appendDisclosureGrantEvent } = await import("../../app/lib/vaultDisclosureGrantStore.js");
  const result = await appendDisclosureGrantEvent({
    grantRef,
    eventType: DISCLOSURE_GRANT_EVENT_TYPES.VERIFIED,
    actorType: DISCLOSURE_ACTOR_TYPES.RECIPIENT,
    result: DISCLOSURE_EVENT_RESULTS.SUCCESS,
    supabase,
  });

  assert.equal(insertAttempts, 2);
  assert.equal(result.error, null);
  assert.equal(result.event.event_id, "event-retry-success");
  assert.equal(result.event.previous_event_hash, previousHashes[1]);
});

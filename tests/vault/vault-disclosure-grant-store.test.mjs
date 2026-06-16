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

test("getLatestDisclosureGrantEventHash orders by timestamp desc then event_id desc", async () => {
  const grantRef = "66666666-6666-4666-8666-666666666666";
  const orders = [];

  const supabase = {
    from(table) {
      assert.equal(table, "disclosure_grant_events");
      return {
        select(columns) {
          assert.equal(columns, "event_id, event_hash");
          return {
            eq(_column, value) {
              assert.equal(value, grantRef);
              return {
                order(column, { ascending }) {
                  orders.push({ column, ascending });
                  return {
                    order(nextColumn, { ascending: nextAscending }) {
                      orders.push({ column: nextColumn, ascending: nextAscending });
                      return {
                        limit(count) {
                          assert.equal(count, 1);
                          return {
                            async maybeSingle() {
                              return {
                                data: {
                                  event_id: "22222222-2222-4222-8222-222222222222",
                                  event_hash: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
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
            },
          };
        },
      };
    },
  };

  const { getLatestDisclosureGrantEventHash } = await import("../../app/lib/vaultDisclosureGrantStore.js");
  const latestHash = await getLatestDisclosureGrantEventHash(grantRef, { supabase });

  assert.deepEqual(orders, [
    { column: "timestamp", ascending: false },
    { column: "event_id", ascending: false },
  ]);
  assert.equal(latestHash, "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc");
});

test("completeDisclosureVerifyAtomic retries rpc unique violations", async () => {
  const grantRef = "77777777-7777-4777-8777-777777777777";
  const sessionRef = "88888888-8888-4888-8888-888888888888";
  let rpcCalls = 0;

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
                    order() {
                      return {
                        limit() {
                          return {
                            async maybeSingle() {
                              return {
                                data: {
                                  event_id: "11111111-1111-4111-8111-111111111111",
                                  event_hash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
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
            },
          };
        },
      };
    },
    async rpc(name) {
      assert.equal(name, "disclosure_verify_grant_atomic");
      rpcCalls += 1;
      if (rpcCalls === 1) {
        return {
          data: null,
          error: {
            code: "23505",
            message:
              "duplicate key value violates unique constraint disclosure_grant_events_grant_prev_hash_uidx",
          },
        };
      }

      return {
        data: {
          event: {
            event_id: "99999999-9999-4999-8999-999999999999",
            grant_ref: grantRef,
            event_type: "grant.verified",
            actor_type: "recipient",
            result: "success",
            reason_code: null,
            timestamp: "2026-06-16T12:01:00.000Z",
            previous_event_hash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            event_hash: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
            metadata: {},
          },
          grant: { grant_id: grantRef, access_count: 1, max_access_count: 2 },
          session: { session_id: sessionRef, access_count: 1 },
        },
        error: null,
      };
    },
  };

  const { completeDisclosureVerifyAtomic } = await import("../../app/lib/vaultDisclosureGrantStore.js");
  const result = await completeDisclosureVerifyAtomic({
    grantRef,
    sessionRef,
    eventType: DISCLOSURE_GRANT_EVENT_TYPES.VERIFIED,
    actorType: DISCLOSURE_ACTOR_TYPES.RECIPIENT,
    result: DISCLOSURE_EVENT_RESULTS.SUCCESS,
    supabase,
  });

  assert.equal(rpcCalls, 2);
  assert.equal(result.error, null);
  assert.equal(result.event.event_type, "grant.verified");
});

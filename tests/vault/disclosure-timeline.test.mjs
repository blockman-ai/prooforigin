import assert from "node:assert/strict";
import { test } from "node:test";
import { register } from "node:module";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const {
  buildDisclosureChainBadge,
  buildDisclosureTimelineDetail,
  formatDisclosureEventLabel,
  getDisclosureEventVariant,
  sortDisclosureEventsNewestFirst,
} = await import("../../app/lib/disclosureTimeline.js");

test("formatDisclosureEventLabel maps known disclosure event types", () => {
  assert.equal(formatDisclosureEventLabel("access.receipted"), "Access receipted");
  assert.equal(formatDisclosureEventLabel("grant.revoked"), "Grant revoked");
});

test("getDisclosureEventVariant maps receipted events to success", () => {
  assert.equal(getDisclosureEventVariant("access.receipted"), "success");
  assert.equal(getDisclosureEventVariant("custody.blocked"), "warning");
});

test("sortDisclosureEventsNewestFirst orders by timestamp descending", () => {
  const events = [
    {
      event_id: "1",
      event_type: "grant.created",
      timestamp: "2026-06-18T00:38:47.710Z",
    },
    {
      event_id: "2",
      event_type: "access.receipted",
      timestamp: "2026-06-18T00:48:34.687Z",
    },
  ];

  const sorted = sortDisclosureEventsNewestFirst(events);
  assert.equal(sorted[0].event_type, "access.receipted");
  assert.equal(sorted[1].event_type, "grant.created");
});

test("buildDisclosureTimelineDetail includes reason and metadata", () => {
  const detail = buildDisclosureTimelineDetail({
    reason_code: "owner_revoked",
    metadata: {
      revoked_sessions: 2,
    },
  });
  assert.match(detail, /owner_revoked/);
  assert.match(detail, /Revoked sessions 2/);
});

test("buildDisclosureChainBadge reports verified and broken chains", () => {
  const verified = buildDisclosureChainBadge({
    verified: true,
    event_count: 3,
  });
  assert.equal(verified.variant, "success");
  assert.match(verified.label, /verified/i);

  const broken = buildDisclosureChainBadge({
    verified: false,
    event_count: 2,
    reason: "Disclosure event previous_event_hash mismatch.",
  });
  assert.equal(broken.variant, "warning");
  assert.match(broken.detail, /previous_event_hash mismatch/i);
});

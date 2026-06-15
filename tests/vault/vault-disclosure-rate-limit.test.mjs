import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkDisclosureAcceptRateLimit,
  checkDisclosureRecipientLockout,
  DISCLOSURE_ACCEPT_IP_BURST_LIMIT,
  DISCLOSURE_FAILURE_LOCKOUT_THRESHOLD,
  recordDisclosureRecipientFailure,
  resetDisclosureRateLimitsForTests,
} from "../../app/lib/vaultDisclosureRateLimit.js";

const HANDLE_HASH = "a".repeat(64);

function mockReq(ip = "203.0.113.10") {
  return {
    headers: {
      get(name) {
        if (name === "x-forwarded-for") return ip;
        return null;
      },
    },
  };
}

test("disclosure accept rate limit blocks burst attempts and locks out repeated failures", () => {
  resetDisclosureRateLimitsForTests();
  const req = mockReq();

  for (let i = 0; i < DISCLOSURE_ACCEPT_IP_BURST_LIMIT; i += 1) {
    const allowed = checkDisclosureAcceptRateLimit(req, HANDLE_HASH);
    assert.equal(allowed.allowed, true, `attempt ${i + 1} should be allowed`);
  }

  const blocked = checkDisclosureAcceptRateLimit(req, HANDLE_HASH);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, "rate_limited");

  resetDisclosureRateLimitsForTests();
  for (let i = 0; i < DISCLOSURE_FAILURE_LOCKOUT_THRESHOLD; i += 1) {
    recordDisclosureRecipientFailure(req, HANDLE_HASH);
  }

  const lockout = checkDisclosureRecipientLockout(req, HANDLE_HASH);
  assert.equal(lockout.locked, true);
  assert.ok(lockout.retryAfterMs > 0);

  const lockedAccept = checkDisclosureAcceptRateLimit(req, HANDLE_HASH);
  assert.equal(lockedAccept.allowed, false);
  assert.equal(lockedAccept.reason, "lockout");
});

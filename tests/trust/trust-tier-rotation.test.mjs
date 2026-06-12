import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TIER_ROTATION_SECONDS,
  getTierRotationSeconds,
  getVerifyWindowOffsets,
  usesStrictVerifyWindow,
} from "../../app/lib/identityCardShared.js";

test("TIER_ROTATION_SECONDS matches product matrix", () => {
  assert.deepEqual(TIER_ROTATION_SECONDS, {
    free: 60,
    plus: 30,
    professional: 20,
    business: 10,
    enterprise: 10,
  });
});

test("getTierRotationSeconds resolves known tiers", () => {
  assert.equal(getTierRotationSeconds("free"), 60);
  assert.equal(getTierRotationSeconds("plus"), 30);
  assert.equal(getTierRotationSeconds("professional"), 20);
  assert.equal(getTierRotationSeconds("business"), 10);
  assert.equal(getTierRotationSeconds("enterprise"), 10);
});

test("standard tiers accept current, previous, and future verification windows", () => {
  assert.deepEqual(getVerifyWindowOffsets(60, "free"), [-1, 0, 1]);
  assert.deepEqual(getVerifyWindowOffsets(30, "plus"), [-1, 0, 1]);
  assert.deepEqual(getVerifyWindowOffsets(20, "professional"), [-1, 0, 1]);
});

test("business and enterprise accept current and previous windows only", () => {
  assert.equal(usesStrictVerifyWindow("business"), true);
  assert.equal(usesStrictVerifyWindow("enterprise"), true);
  assert.deepEqual(getVerifyWindowOffsets(10, "business"), [-1, 0]);
  assert.deepEqual(getVerifyWindowOffsets(10, "enterprise"), [-1, 0]);
});

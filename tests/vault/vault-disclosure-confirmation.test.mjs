import assert from "node:assert/strict";
import { test } from "node:test";
import {
  consumeDisclosureConfirmationNonce,
  issueDisclosureConfirmationNonce,
  resetDisclosureConfirmationsForTests,
} from "../../app/lib/vaultDisclosureConfirmation.js";

const VAULT_REF = "v".repeat(64);
const DEVICE_REF = "d".repeat(64);
const OTHER_VAULT_REF = "u".repeat(64);

test("disclosure confirmation nonce is single-use, scoped, and expires", async () => {
  resetDisclosureConfirmationsForTests();

  const issued = await issueDisclosureConfirmationNonce({
    vaultRefHash: VAULT_REF,
    deviceRefHash: DEVICE_REF,
  });
  assert.equal(typeof issued.confirmationNonce, "string");
  assert.equal(Date.parse(issued.expiresAt) > Date.now(), true);

  const consumed = await consumeDisclosureConfirmationNonce({
    nonce: issued.confirmationNonce,
    vaultRefHash: VAULT_REF,
    deviceRefHash: DEVICE_REF,
  });
  assert.equal(consumed.ok, true);

  const replay = await consumeDisclosureConfirmationNonce({
    nonce: issued.confirmationNonce,
    vaultRefHash: VAULT_REF,
    deviceRefHash: DEVICE_REF,
  });
  assert.equal(replay.ok, false);
  assert.equal(replay.code, "CONFIRMATION_NONCE_INVALID");

  const fresh = await issueDisclosureConfirmationNonce({
    vaultRefHash: VAULT_REF,
    deviceRefHash: DEVICE_REF,
  });
  const mismatch = await consumeDisclosureConfirmationNonce({
    nonce: fresh.confirmationNonce,
    vaultRefHash: OTHER_VAULT_REF,
    deviceRefHash: DEVICE_REF,
  });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.code, "CONFIRMATION_NONCE_SCOPE_MISMATCH");

  resetDisclosureConfirmationsForTests();
  const expired = await issueDisclosureConfirmationNonce({
    vaultRefHash: VAULT_REF,
    deviceRefHash: DEVICE_REF,
    nowMs: Date.now() - 10 * 60 * 1000,
  });
  const expiredConsume = await consumeDisclosureConfirmationNonce({
    nonce: expired.confirmationNonce,
    vaultRefHash: VAULT_REF,
    deviceRefHash: DEVICE_REF,
    nowMs: Date.now(),
  });
  assert.equal(expiredConsume.ok, false);
  assert.equal(expiredConsume.code, "CONFIRMATION_NONCE_EXPIRED");
});

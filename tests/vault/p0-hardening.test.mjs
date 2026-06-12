import assert from "node:assert/strict";
import crypto from "node:crypto";
import { register } from "node:module";
import { test } from "node:test";
import {
  checkRateLimit,
  resetVaultRateLimitsForTests,
} from "../../app/lib/vaultRateLimit.js";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const { buildVaultSignaturePayload, verifyVaultSignature, VAULT_AUTH_HEADER_NONCE } = await import(
  "../../app/lib/vaultAuth.js"
);

const { reserveVaultRequestNonce, resetVaultReplayGuardForTests } = await import(
  "../../app/lib/vaultReplayGuard.js"
);

const DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const NONCE = "44444444-4444-4444-8444-444444444444";
const AUTH_SECRET_HASH = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

test("buildVaultSignaturePayload includes request nonce", () => {
  const payload = buildVaultSignaturePayload({
    method: "POST",
    path: "/api/vault/document",
    bodyHash: "b".repeat(64),
    timestamp: 1710000000000,
    nonce: NONCE,
  });

  assert.match(payload, /44444444-4444-4444-8444-444444444444$/);
});

test("reserveVaultRequestNonce rejects replayed nonce for same device", async () => {
  resetVaultReplayGuardForTests();

  const first = await reserveVaultRequestNonce({
    vaultDeviceId: DEVICE_ID,
    nonce: NONCE,
  });
  const second = await reserveVaultRequestNonce({
    vaultDeviceId: DEVICE_ID,
    nonce: NONCE,
  });

  assert.equal(first.ok, true);
  assert.equal(first.replay, false);
  assert.equal(second.ok, false);
  assert.equal(second.replay, true);
});

test("checkRateLimit blocks registration attempts after limit", () => {
  resetVaultRateLimitsForTests();

  let lastResult = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    lastResult = checkRateLimit({
      key: "vault-register:test-ip",
      limit: 2,
      windowMs: 60_000,
    });
  }

  assert.equal(lastResult.allowed, false);
  assert.ok(lastResult.retryAfterMs >= 0);
});

test("verifyVaultSignature validates nonce-aware payload", () => {
  const bodyHash = "c".repeat(64);
  const timestamp = "1710000000000";
  const payload = buildVaultSignaturePayload({
    method: "GET",
    path: "/api/vault/document",
    bodyHash,
    timestamp,
    nonce: NONCE,
  });
  const signature = crypto
    .createHmac("sha256", Buffer.from(AUTH_SECRET_HASH, "hex"))
    .update(payload)
    .digest("hex");

  assert.equal(
    verifyVaultSignature({
      authSecretHash: AUTH_SECRET_HASH,
      method: "GET",
      path: "/api/vault/document",
      bodyHash,
      timestamp,
      nonce: NONCE,
      signature,
    }),
    true
  );
});

test("VAULT_AUTH_HEADER_NONCE is exported for clients", () => {
  assert.equal(VAULT_AUTH_HEADER_NONCE, "x-prooforigin-vault-nonce");
});

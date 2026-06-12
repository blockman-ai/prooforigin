import assert from "node:assert/strict";
import crypto from "node:crypto";
import { afterEach, mock, test } from "node:test";
import { register } from "node:module";
import {
  getVaultAuthSentinelCounterCallsForTests,
  resetVaultAuthSentinelCountersForTests,
  setVaultAuthSentinelCounterIncrementForTests,
  VAULT_AUTH_SENTINEL_COUNTERS,
} from "../../app/lib/vaultAuthSentinelCounters.js";
import {
  SENTINEL_OPERATIONAL_COUNTER_KEYS,
  validateSentinelCounterKey,
} from "../../app/lib/sentinelCounters.js";
import {
  resetVaultRateLimitsForTests,
  VAULT_REGISTRATION_IP_LIMIT,
} from "../../app/lib/vaultRateLimit.js";
import { resetVaultReplayGuardForTests } from "../../app/lib/vaultReplayGuard.js";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const NONCE = "44444444-4444-4444-8444-444444444444";
const AUTH_SECRET_HASH = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

let mockRegistration = null;
let mockReplayResult = null;

mock.module("../../app/lib/vaultAdmin.js", {
  exports: {
    isVaultAdminConfigured: () => true,
    getVaultDeviceRegistration: async () => ({ registration: mockRegistration, error: null }),
    touchVaultDeviceLastSeen: async () => {},
    vaultDeviceRegistered: async () => false,
    registerVaultDevice: async ({ vaultDeviceId }) => ({
      registration: {
        vault_device_id: vaultDeviceId,
        device_public_id: "pub-test",
        created_at: new Date().toISOString(),
      },
      error: null,
    }),
  },
});

mock.module("../../app/lib/vaultReplayGuard.js", {
  exports: {
    reserveVaultRequestNonce: async () =>
      mockReplayResult ?? { ok: true, replay: false, expired: false },
    resetVaultReplayGuardForTests: () => {},
    REPLAY_CACHE_TTL_MS: 5 * 60 * 1000,
  },
});

const {
  authorizeVaultRequest,
  buildVaultSignaturePayload,
  hashVaultRequestBody,
  VAULT_AUTH_HEADER_BODY_HASH,
  VAULT_AUTH_HEADER_DEVICE_ID,
  VAULT_AUTH_HEADER_NONCE,
  VAULT_AUTH_HEADER_SIGNATURE,
  VAULT_AUTH_HEADER_TIMESTAMP,
} = await import("../../app/lib/vaultAuth.js");

const { POST: registerDevicePost } = await import("../../app/api/vault/register-device/route.js");

function buildSignedVaultRequest({
  deviceId = DEVICE_ID,
  nonce = NONCE,
  authSecretHash = AUTH_SECRET_HASH,
  method = "POST",
  path = "/api/vault/document",
  bodyText = "",
  timestamp = String(Date.now()),
} = {}) {
  const bodyHash = hashVaultRequestBody(bodyText);
  const payload = buildVaultSignaturePayload({
    method,
    path,
    bodyHash,
    timestamp,
    nonce,
  });
  const signature = crypto
    .createHmac("sha256", Buffer.from(authSecretHash, "hex"))
    .update(payload)
    .digest("hex");

  return new Request("http://localhost/api/vault/document", {
    method,
    headers: {
      [VAULT_AUTH_HEADER_DEVICE_ID]: deviceId,
      [VAULT_AUTH_HEADER_TIMESTAMP]: timestamp,
      [VAULT_AUTH_HEADER_BODY_HASH]: bodyHash,
      [VAULT_AUTH_HEADER_SIGNATURE]: signature,
      [VAULT_AUTH_HEADER_NONCE]: nonce,
    },
    body: bodyText,
  });
}

function buildRegistration(overrides = {}) {
  return {
    vault_device_id: DEVICE_ID,
    device_public_id: "pub-test",
    auth_secret_hash: AUTH_SECRET_HASH,
    ...overrides,
  };
}

afterEach(() => {
  mockRegistration = null;
  mockReplayResult = null;
  resetVaultAuthSentinelCountersForTests();
  resetVaultRateLimitsForTests();
  resetVaultReplayGuardForTests();
});

test("operational vault auth counter keys pass validation", () => {
  for (const counterKey of SENTINEL_OPERATIONAL_COUNTER_KEYS) {
    if (!counterKey.startsWith("vault.auth.")) {
      continue;
    }

    assert.equal(validateSentinelCounterKey(counterKey).valid, true, counterKey);
  }
});

test("authorizeVaultRequest records missing_headers when auth headers absent", async () => {
  const req = new Request("http://localhost/api/vault/document", { method: "POST" });
  const auth = await authorizeVaultRequest(req, {
    method: "POST",
    path: "/api/vault/document",
  });

  assert.equal(auth.ok, false);
  assert.equal(auth.code, "VAULT_AUTH_REQUIRED");
  assert.deepEqual(getVaultAuthSentinelCounterCallsForTests(), [
    VAULT_AUTH_SENTINEL_COUNTERS.MISSING_HEADERS,
  ]);
});

test("authorizeVaultRequest records device_not_registered", async () => {
  mockRegistration = null;

  const req = buildSignedVaultRequest();
  const auth = await authorizeVaultRequest(req, {
    method: "POST",
    path: "/api/vault/document",
  });

  assert.equal(auth.ok, false);
  assert.equal(auth.code, "VAULT_DEVICE_NOT_REGISTERED");
  assert.deepEqual(getVaultAuthSentinelCounterCallsForTests(), [
    VAULT_AUTH_SENTINEL_COUNTERS.DEVICE_NOT_REGISTERED,
  ]);
});

test("authorizeVaultRequest records signature_failed", async () => {
  mockRegistration = buildRegistration({
    auth_secret_hash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  });

  const req = buildSignedVaultRequest();
  const auth = await authorizeVaultRequest(req, {
    method: "POST",
    path: "/api/vault/document",
  });

  assert.equal(auth.ok, false);
  assert.equal(auth.code, "VAULT_AUTH_REQUIRED");
  assert.match(auth.message, /signature verification failed/i);
  assert.deepEqual(getVaultAuthSentinelCounterCallsForTests(), [
    VAULT_AUTH_SENTINEL_COUNTERS.SIGNATURE_FAILED,
  ]);
});

test("authorizeVaultRequest records replay_rejected", async () => {
  mockRegistration = buildRegistration();
  mockReplayResult = { ok: false, replay: true, expired: false };

  const req = buildSignedVaultRequest();
  const auth = await authorizeVaultRequest(req, {
    method: "POST",
    path: "/api/vault/document",
  });

  assert.equal(auth.ok, false);
  assert.equal(auth.code, "VAULT_AUTH_REPLAY");
  assert.deepEqual(getVaultAuthSentinelCounterCallsForTests(), [
    VAULT_AUTH_SENTINEL_COUNTERS.REPLAY_REJECTED,
  ]);
});

test("authorizeVaultRequest records replay_expired_nonce", async () => {
  mockRegistration = buildRegistration();
  mockReplayResult = { ok: false, replay: true, expired: true };

  const req = buildSignedVaultRequest();
  const auth = await authorizeVaultRequest(req, {
    method: "POST",
    path: "/api/vault/document",
  });

  assert.equal(auth.ok, false);
  assert.equal(auth.code, "VAULT_AUTH_REPLAY");
  assert.deepEqual(getVaultAuthSentinelCounterCallsForTests(), [
    VAULT_AUTH_SENTINEL_COUNTERS.REPLAY_EXPIRED_NONCE,
  ]);
});

test("authorizeVaultRequest still returns auth failure when counter increment throws", async () => {
  mockRegistration = null;
  setVaultAuthSentinelCounterIncrementForTests(() => {
    throw new Error("counter write failed");
  });

  const req = buildSignedVaultRequest();
  const auth = await authorizeVaultRequest(req, {
    method: "POST",
    path: "/api/vault/document",
  });

  assert.equal(auth.ok, false);
  assert.equal(auth.code, "VAULT_DEVICE_NOT_REGISTERED");
});

test("register-device records rate_limited when IP limit exceeded", async () => {
  const clientIp = "203.0.113.55";
  const body = JSON.stringify({
    vault_device_id: "55555555-5555-4555-8555-555555555555",
    auth_secret_hash: AUTH_SECRET_HASH,
  });

  let lastResponse = null;
  for (let attempt = 0; attempt <= VAULT_REGISTRATION_IP_LIMIT; attempt += 1) {
    const req = new Request("http://localhost/api/vault/register-device", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": clientIp,
      },
      body,
    });
    lastResponse = await registerDevicePost(req);
  }

  assert.equal(lastResponse.status, 429);
  const payload = await lastResponse.json();
  assert.equal(payload.code, "RATE_LIMITED");
  assert.ok(
    getVaultAuthSentinelCounterCallsForTests().includes(VAULT_AUTH_SENTINEL_COUNTERS.RATE_LIMITED)
  );
});

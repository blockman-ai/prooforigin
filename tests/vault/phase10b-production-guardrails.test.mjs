import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "node:module";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

let configured = false;
let client = null;

mock.module("../../app/lib/vaultAdmin.js", {
  exports: {
    isVaultAdminConfigured: () => configured,
    createVaultAdminClient: () => {
      if (!client) {
        throw new Error("store unavailable");
      }
      return client;
    },
  },
});

const { checkRateLimit, resetVaultRateLimitsForTests } = await import(
  "../../app/lib/vaultRateLimit.js"
);
const { issueDisclosureConfirmationNonce, resetDisclosureConfirmationsForTests } = await import(
  "../../app/lib/vaultDisclosureConfirmation.js"
);
const { reserveVaultRequestNonce, resetVaultReplayGuardForTests } = await import(
  "../../app/lib/vaultReplayGuard.js"
);

function withProductionEnv(env, fn) {
  return async (t) => {
    const previous = {};
    for (const [key, value] of Object.entries({ NODE_ENV: "production", ...env })) {
      previous[key] = process.env[key];
      process.env[key] = value;
    }

    configured = false;
    client = null;
    resetVaultRateLimitsForTests();
    resetDisclosureConfirmationsForTests();
    resetVaultReplayGuardForTests();

    try {
      await fn(t);
    } finally {
      for (const key of Object.keys({ NODE_ENV: "production", ...env })) {
        if (previous[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = previous[key];
        }
      }
      configured = false;
      client = null;
    }
  };
}

test(
  "production ignores rate-limit memory override and fails closed",
  withProductionEnv({ PROOFORIGIN_RATE_LIMIT_MEMORY: "1" }, async () => {
    const result = await checkRateLimit({
      key: "phase10b:guardrail",
      scope: "test",
      limit: 1,
      windowMs: 60_000,
    });

    assert.equal(result.allowed, false);
    assert.equal(result.error?.message, "rate_limit_store_unavailable");
  })
);

test(
  "production ignores disclosure confirmation memory override",
  withProductionEnv({ DISCLOSURE_CONFIRMATION_MEMORY: "1" }, async () => {
    await assert.rejects(
      () =>
        issueDisclosureConfirmationNonce({
          vaultRefHash: "a".repeat(64),
          deviceRefHash: "b".repeat(64),
        }),
      /store unavailable/
    );
  })
);

test(
  "production ignores replay-guard memory override and fails closed",
  withProductionEnv({ VAULT_REPLAY_GUARD_MEMORY: "1" }, async () => {
    const result = await reserveVaultRequestNonce({
      vaultDeviceId: "33333333-3333-4333-8333-333333333333",
      nonce: "44444444-4444-4444-8444-444444444444",
    });

    assert.equal(result.ok, false);
    assert.equal(result.mode, "database");
    assert.match(result.error?.message || "", /store unavailable/);
  })
);

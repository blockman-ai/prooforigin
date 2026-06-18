import assert from "node:assert/strict";
import { test } from "node:test";
import { register } from "node:module";
import { webcrypto } from "node:crypto";
import {
  buildVaultOwnershipChallengeMessage,
  VAULT_OWNERSHIP_CHALLENGE_TYPE_OWNERSHIP_KEY_REGISTER,
} from "../../app/lib/vaultOwnershipVerification.js";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const CHALLENGE_ID = "22222222-2222-4222-8222-222222222222";
const VAULT_ID = "44444444-4444-4444-8444-444444444444";
const DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const NONCE = "ZmFrZS1ub25jZS0xMjM0";

test("challenge message canonicalizes postgres-style timestamps for signing", async () => {
  const clientMessage = buildVaultOwnershipChallengeMessage({
    challengeId: CHALLENGE_ID,
    challengeType: VAULT_OWNERSHIP_CHALLENGE_TYPE_OWNERSHIP_KEY_REGISTER,
    vaultId: VAULT_ID,
    vaultDeviceId: DEVICE_ID,
    challengeNonce: NONCE,
    issuedAt: "2026-06-14T17:00:00.000Z",
    expiresAt: "2099-06-14T17:05:00.000Z",
  });

  const serverMessage = buildVaultOwnershipChallengeMessage({
    challengeId: CHALLENGE_ID,
    challengeType: VAULT_OWNERSHIP_CHALLENGE_TYPE_OWNERSHIP_KEY_REGISTER,
    vaultId: VAULT_ID,
    vaultDeviceId: DEVICE_ID,
    challengeNonce: NONCE,
    issuedAt: "2026-06-14 17:00:00+00",
    expiresAt: "2099-06-14 17:05:00+00",
  });

  assert.equal(clientMessage, serverMessage);

  const keyPair = await webcrypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const signatureBuffer = await webcrypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keyPair.privateKey,
    new TextEncoder().encode(clientMessage)
  );
  const valid = await webcrypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    keyPair.publicKey,
    signatureBuffer,
    new TextEncoder().encode(serverMessage)
  );
  assert.equal(valid, true);
});

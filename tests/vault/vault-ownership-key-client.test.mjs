import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  VAULT_OWNERSHIP_PRIVATE_JWK_STORAGE_KEY,
  computeVaultOwnershipPublicKeyFingerprint,
  exportVaultOwnershipPublicJwk,
  generateVaultOwnershipKeyPair,
  signVaultOwnershipChallenge,
  storeWrappedVaultOwnershipPrivateJwk,
  loadWrappedVaultOwnershipPrivateJwk,
  clearWrappedVaultOwnershipPrivateJwk,
} from "../../app/lib/vaultOwnershipKey.js";
import { generateMasterVaultKey } from "../../app/lib/vaultKeyRing.js";

const TEST_VAULT_ID = "11111111-1111-4111-8111-111111111111";
const storage = new Map();

beforeEach(() => {
  storage.clear();
  globalThis.window = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => {
        storage.set(key, value);
      },
      removeItem: (key) => {
        storage.delete(key);
      },
    },
  };
});

afterEach(() => {
  clearWrappedVaultOwnershipPrivateJwk();
  delete globalThis.window;
});

test("ownership key helper generates public jwk and challenge signature", async () => {
  const pair = await generateVaultOwnershipKeyPair();
  const publicJwk = await exportVaultOwnershipPublicJwk(pair.publicKey);
  const fingerprint = await computeVaultOwnershipPublicKeyFingerprint(publicJwk);
  const signature = await signVaultOwnershipChallenge({
    privateKey: pair.privateKey,
    challenge: "prooforigin-vault-ownership-test",
  });

  assert.equal(publicJwk.kty, "EC");
  assert.equal(publicJwk.crv, "P-256");
  assert.equal(typeof publicJwk.x, "string");
  assert.equal(typeof publicJwk.y, "string");
  assert.equal(publicJwk.d, undefined);
  assert.equal(typeof fingerprint, "string");
  assert.equal(fingerprint.length, 64);
  assert.equal(typeof signature, "string");
  assert.ok(signature.length > 20);
});

test("wrapped ownership private jwk is encrypted in local storage", async () => {
  const pair = await generateVaultOwnershipKeyPair();
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const masterVaultKey = generateMasterVaultKey();

  await storeWrappedVaultOwnershipPrivateJwk({
    vaultId: TEST_VAULT_ID,
    privateJwk,
    masterVaultKey,
  });

  const raw = storage.get(VAULT_OWNERSHIP_PRIVATE_JWK_STORAGE_KEY);
  assert.equal(typeof raw, "string");
  assert.equal(raw.includes(String(privateJwk.d)), false);

  const loaded = await loadWrappedVaultOwnershipPrivateJwk({
    vaultId: TEST_VAULT_ID,
    masterVaultKey,
  });
  assert.equal(typeof loaded?.d, "string");
  assert.equal(loaded?.crv, "P-256");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { generateMasterVaultKey } from "../../app/lib/vaultKeyRing.js";
import {
  buildPasskeyWrapRecord,
  computePasskeyPrfSalt,
  detectPasskeyCapabilities,
  exportPasskeyWrapRecord,
  importPasskeyWrapRecord,
  isWebAuthnAvailable,
  normalizePasskeyWrapKey,
  probePasskeyPrfSupport,
  unwrapLegacyPinKeyWithPasskeyKey,
  unwrapMasterVaultKeyWithPasskeyKey,
  unwrapVaultKeysFromPasskeyWrapRecord,
  VAULT_PASSKEY_WRAP_KEY_BYTES,
  VAULT_PASSKEY_WRAP_METHOD,
  VAULT_PASSKEY_WRAP_VERSION,
  wrapLegacyPinKeyWithPasskeyKey,
  wrapMasterVaultKeyWithPasskeyKey,
} from "../../app/lib/vaultPasskey.js";
import { generateRandomBytes } from "../../app/lib/vaultCrypto.js";

const TEST_VAULT_ID = "11111111-1111-4111-8111-111111111111";
const TEST_CREDENTIAL_ID = "test-credential-id-base64url";

test("capability detection returns false in Node test runtime", async () => {
  assert.equal(isWebAuthnAvailable(), false);
  assert.equal(await probePasskeyPrfSupport(), false);

  const capabilities = await detectPasskeyCapabilities();
  assert.deepEqual(capabilities, {
    webauthn: false,
    platformAuthenticator: false,
    prf: false,
    passkeyUnlockSupported: false,
  });
});

test("computePasskeyPrfSalt is stable for vault and credential ids", async () => {
  const first = await computePasskeyPrfSalt(TEST_VAULT_ID, TEST_CREDENTIAL_ID);
  const second = await computePasskeyPrfSalt(TEST_VAULT_ID, TEST_CREDENTIAL_ID);

  assert.equal(first.length, 32);
  assert.deepEqual(Array.from(first), Array.from(second));
});

test("normalizePasskeyWrapKey accepts 32-byte PRF output and hashes longer output", async () => {
  const exact = generateRandomBytes(32);
  const normalizedExact = await normalizePasskeyWrapKey(exact);
  assert.deepEqual(Array.from(normalizedExact), Array.from(exact));

  const long = generateRandomBytes(64);
  const normalizedLong = await normalizePasskeyWrapKey(long);
  assert.equal(normalizedLong.length, VAULT_PASSKEY_WRAP_KEY_BYTES);
  assert.notDeepEqual(Array.from(normalizedLong), Array.from(long.slice(0, 32)));
});

test("passkey wrap and unwrap round trip restores MVK and legacy PIN key", async () => {
  const passkeyWrapKey = generateRandomBytes(32);
  const masterVaultKey = generateMasterVaultKey();
  const legacyPinKey = generateRandomBytes(32);

  const wrappedMvk = await wrapMasterVaultKeyWithPasskeyKey(masterVaultKey, passkeyWrapKey);
  const wrappedLegacy = await wrapLegacyPinKeyWithPasskeyKey(legacyPinKey, passkeyWrapKey);

  const unwrappedMvk = await unwrapMasterVaultKeyWithPasskeyKey(wrappedMvk, passkeyWrapKey);
  const unwrappedLegacy = await unwrapLegacyPinKeyWithPasskeyKey(wrappedLegacy, passkeyWrapKey);

  assert.deepEqual(Array.from(unwrappedMvk), Array.from(masterVaultKey));
  assert.deepEqual(Array.from(unwrappedLegacy), Array.from(legacyPinKey));
});

test("wrong passkey wrap key fails unwrap", async () => {
  const passkeyWrapKey = generateRandomBytes(32);
  const masterVaultKey = generateMasterVaultKey();
  const wrappedMvk = await wrapMasterVaultKeyWithPasskeyKey(masterVaultKey, passkeyWrapKey);
  const wrongKey = generateRandomBytes(32);

  const unwrapped = await unwrapMasterVaultKeyWithPasskeyKey(wrappedMvk, wrongKey);
  assert.equal(unwrapped, null);
});

test("buildPasskeyWrapRecord stores MVK and legacy key without exposing plaintext", async () => {
  const passkeyWrapKey = generateRandomBytes(32);
  const masterVaultKey = generateMasterVaultKey();
  const legacyPinKey = generateRandomBytes(32);
  const prfSalt = await computePasskeyPrfSalt(TEST_VAULT_ID, TEST_CREDENTIAL_ID);

  const record = await buildPasskeyWrapRecord({
    vaultId: TEST_VAULT_ID,
    credentialId: TEST_CREDENTIAL_ID,
    masterVaultKey,
    legacyPinKey,
    passkeyWrapKey,
    prfSalt,
  });

  const exported = exportPasskeyWrapRecord(record);
  assert.ok(!exported.includes(Buffer.from(masterVaultKey).toString("base64")));
  assert.ok(!exported.includes(Buffer.from(legacyPinKey).toString("base64")));
  assert.equal(record.version, VAULT_PASSKEY_WRAP_VERSION);
  assert.equal(record.wrap_method, VAULT_PASSKEY_WRAP_METHOD);

  const imported = importPasskeyWrapRecord(exported);
  const unwrapped = await unwrapVaultKeysFromPasskeyWrapRecord(imported, passkeyWrapKey);

  assert.ok(unwrapped);
  assert.deepEqual(Array.from(unwrapped.masterVaultKey), Array.from(masterVaultKey));
  assert.deepEqual(Array.from(unwrapped.legacyPinKey), Array.from(legacyPinKey));
});

test("passkey version constants are stable", () => {
  assert.equal(VAULT_PASSKEY_WRAP_VERSION, "passkey-wrap-v1");
  assert.equal(VAULT_PASSKEY_WRAP_METHOD, "webauthn_prf_aes_gcm_v1");
  assert.equal(VAULT_PASSKEY_WRAP_KEY_BYTES, 32);
});

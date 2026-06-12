import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { generateMasterVaultKey } from "../../app/lib/vaultKeyRing.js";
import {
  buildPasskeyWrapRecord,
  computePasskeyPrfSalt,
  exportPasskeyWrapRecord,
  VAULT_PASSKEY_WRAP_METHOD,
  VAULT_PASSKEY_WRAP_VERSION,
} from "../../app/lib/vaultPasskey.js";
import { enrollVaultPasskey } from "../../app/lib/vaultPasskeyEnroll.js";
import {
  clearPasskeyWrapRecord,
  isVaultPasskeyEnrolled,
  loadPasskeyWrapRecord,
  resetPasskeyWrapStorageForTests,
  storePasskeyWrapRecord,
  VAULT_PASSKEY_WRAP_STORAGE_KEY,
  validatePasskeyWrapRecord,
} from "../../app/lib/vaultPasskeyStorage.js";
import { generateRandomBytes } from "../../app/lib/vaultCrypto.js";

const TEST_VAULT_ID = "11111111-1111-4111-8111-111111111111";
const TEST_CREDENTIAL_ID = "dGVzdC1jcmVkZW50aWFsLWlk";
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
  resetPasskeyWrapStorageForTests();
  delete globalThis.window;
});

function buildValidRecord() {
  return {
    version: VAULT_PASSKEY_WRAP_VERSION,
    wrap_method: VAULT_PASSKEY_WRAP_METHOD,
    vault_id: TEST_VAULT_ID,
    credential_id: TEST_CREDENTIAL_ID,
    prf_salt: "cHJmLXNhbHQtZXhhbXBsZS1kYXRhLWJ5dGVz",
    wrapped_mvk: {
      iv: "AAAAAAAAAAA=",
      ciphertext: "YmFzZTY0LWNpcGhlcnRleHQ=",
    },
    wrapped_legacy_pin_key: {
      iv: "BBBBBBBBBBB=",
      ciphertext: "YmFzZTY0LWNpcGhlcnRleHQy",
    },
    enrolled_at: "2026-06-11T00:00:00.000Z",
  };
}

test("store and load passkey wrap record round trip", async () => {
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

  storePasskeyWrapRecord(record);
  const loaded = loadPasskeyWrapRecord();

  assert.ok(loaded);
  assert.equal(loaded.vault_id, TEST_VAULT_ID);
  assert.equal(loaded.credential_id, TEST_CREDENTIAL_ID);
  assert.equal(isVaultPasskeyEnrolled(), true);
  assert.ok(storage.has(VAULT_PASSKEY_WRAP_STORAGE_KEY));
});

test("clearPasskeyWrapRecord removes enrolled state", async () => {
  storePasskeyWrapRecord(buildValidRecord());
  clearPasskeyWrapRecord();

  assert.equal(isVaultPasskeyEnrolled(), false);
  assert.equal(loadPasskeyWrapRecord(), null);
});

test("validatePasskeyWrapRecord rejects invalid records", () => {
  assert.throws(() => validatePasskeyWrapRecord(null), /invalid/i);
  assert.throws(
    () => validatePasskeyWrapRecord({ ...buildValidRecord(), version: "bad" }),
    /Unsupported passkey wrap version/
  );
  assert.throws(
    () => validatePasskeyWrapRecord({ ...buildValidRecord(), wrapped_mvk: {} }),
    /wrapped_mvk/
  );
});

test("stored passkey wrap record does not expose MVK or legacy key plaintext", async () => {
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

  storePasskeyWrapRecord(record);
  const raw = storage.get(VAULT_PASSKEY_WRAP_STORAGE_KEY);
  const exported = exportPasskeyWrapRecord(record);

  assert.ok(typeof raw === "string");
  assert.ok(!raw.includes(Buffer.from(masterVaultKey).toString("base64")));
  assert.ok(!raw.includes(Buffer.from(legacyPinKey).toString("base64")));
  assert.equal(JSON.parse(raw).master_vault_key, undefined);
  assert.equal(JSON.parse(raw).legacy_pin_key, undefined);
  assert.ok(!exported.includes(Buffer.from(masterVaultKey).toString("base64")));
});

test("enrollVaultPasskey fails closed when PRF is unavailable", async () => {
  await assert.rejects(
    () =>
      enrollVaultPasskey({
        vaultId: TEST_VAULT_ID,
        masterVaultKey: generateMasterVaultKey(),
        legacyPinKey: generateRandomBytes(32),
        detectCapabilities: async () => ({
          webauthn: true,
          platformAuthenticator: true,
          prf: false,
          passkeyUnlockSupported: false,
        }),
      }),
    /requires WebAuthn PRF support/
  );

  assert.equal(isVaultPasskeyEnrolled(), false);
});

test("enrollVaultPasskey fails closed when credential creation fails", async () => {
  await assert.rejects(
    () =>
      enrollVaultPasskey({
        vaultId: TEST_VAULT_ID,
        masterVaultKey: generateMasterVaultKey(),
        legacyPinKey: generateRandomBytes(32),
        rpId: "vault.prooforigin.test",
        detectCapabilities: async () => ({
          webauthn: true,
          platformAuthenticator: true,
          prf: true,
          passkeyUnlockSupported: true,
        }),
        createCredential: async () => {
          throw new Error("User cancelled passkey creation.");
        },
      }),
    /User cancelled passkey creation/
  );

  assert.equal(isVaultPasskeyEnrolled(), false);
});

test("enrollVaultPasskey stores safe record when enrollment is mocked", async () => {
  const masterVaultKey = generateMasterVaultKey();
  const legacyPinKey = generateRandomBytes(32);
  const prfOutput = generateRandomBytes(32);
  const rawId = new TextEncoder().encode("mock-credential-id");

  const metadata = await enrollVaultPasskey({
    vaultId: TEST_VAULT_ID,
    masterVaultKey,
    legacyPinKey,
    rpId: "vault.prooforigin.test",
    detectCapabilities: async () => ({
      webauthn: true,
      platformAuthenticator: true,
      prf: true,
      passkeyUnlockSupported: true,
    }),
    createCredential: async () => ({
      rawId,
      getClientExtensionResults: () => ({}),
    }),
    evaluatePrf: async () => prfOutput,
  });

  assert.equal(metadata.enrolled, true);
  assert.equal(metadata.vault_id, TEST_VAULT_ID);
  assert.ok(metadata.credential_id);
  assert.equal(metadata.master_vault_key, undefined);
  assert.equal(metadata.legacy_pin_key, undefined);
  assert.equal(metadata.passkey_wrap_key, undefined);
  assert.equal(isVaultPasskeyEnrolled(), true);

  const loaded = loadPasskeyWrapRecord();
  assert.equal(loaded.vault_id, TEST_VAULT_ID);
  assert.equal(loaded.credential_id, metadata.credential_id);
});

test("enrollVaultPasskey rejects duplicate enrollment", async () => {
  storePasskeyWrapRecord(buildValidRecord());

  await assert.rejects(
    () =>
      enrollVaultPasskey({
        vaultId: TEST_VAULT_ID,
        masterVaultKey: generateMasterVaultKey(),
        legacyPinKey: generateRandomBytes(32),
        detectCapabilities: async () => ({
          webauthn: true,
          platformAuthenticator: true,
          prf: true,
          passkeyUnlockSupported: true,
        }),
      }),
    /already enrolled/
  );
});

import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { generateMasterVaultKey } from "../../app/lib/vaultKeyRing.js";
import {
  VAULT_PASSKEY_WRAP_METHOD,
  VAULT_PASSKEY_WRAP_VERSION,
} from "../../app/lib/vaultPasskey.js";
import { enrollVaultPasskey } from "../../app/lib/vaultPasskeyEnroll.js";
import {
  isVaultPasskeyEnrolled,
  loadPasskeyWrapRecord,
  resetPasskeyWrapStorageForTests,
  storePasskeyWrapRecord,
} from "../../app/lib/vaultPasskeyStorage.js";
import {
  canEnrollVaultPasskey,
  formatPasskeyEnrolledAt,
  getPasskeyStatusSummary,
  isPasskeyUnlockButtonVisible,
  mapPasskeyEnrollmentError,
} from "../../app/lib/vaultPasskeyStatus.js";
import { generateRandomBytes } from "../../app/lib/vaultCrypto.js";

const TEST_VAULT_ID = "11111111-1111-4111-8111-111111111111";
const TEST_CREDENTIAL_ID = "dGVzdC1jcmVkZW50aWFsLWlk";
const storage = new Map();

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
    enrolled_at: "2026-06-11T12:34:56.000Z",
  };
}

const supportedCapabilities = {
  webauthn: true,
  platformAuthenticator: true,
  prf: true,
  passkeyUnlockSupported: true,
};

function buildMockEnrollDeps({ prfOutput, rawIdSuffix = "mock-credential-id" }) {
  const rawId = new TextEncoder().encode(rawIdSuffix);

  return {
    rpId: "vault.prooforigin.test",
    detectCapabilities: async () => supportedCapabilities,
    createCredential: async () => ({
      rawId,
      getClientExtensionResults: () => ({}),
    }),
    evaluatePrf: async () => prfOutput,
  };
}

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

test("getPasskeyStatusSummary reports not enrolled without a record", () => {
  const summary = getPasskeyStatusSummary(null);

  assert.equal(summary.enrolled, false);
  assert.equal(summary.statusLabel, "Not enrolled");
  assert.equal(summary.enrolledAtDisplay, null);
});

test("getPasskeyStatusSummary reports enrolled status and timestamp", () => {
  const record = buildValidRecord();
  const summary = getPasskeyStatusSummary(record);

  assert.equal(summary.enrolled, true);
  assert.equal(summary.statusLabel, "Enrolled");
  assert.equal(summary.enrolledAt, record.enrolled_at);
  assert.equal(summary.enrolledAtDisplay, formatPasskeyEnrolledAt(record.enrolled_at));
});

test("canEnrollVaultPasskey requires unlocked MVK session keys", () => {
  const masterVaultKey = generateMasterVaultKey();
  const legacyPinKey = generateRandomBytes(32);

  assert.equal(
    canEnrollVaultPasskey({
      mvkVault: true,
      unlockKeys: { mode: "mvk", masterVaultKey, legacyPinKey },
    }),
    true
  );

  assert.equal(
    canEnrollVaultPasskey({
      mvkVault: false,
      unlockKeys: { mode: "mvk", masterVaultKey, legacyPinKey },
    }),
    false
  );

  assert.equal(
    canEnrollVaultPasskey({
      mvkVault: true,
      unlockKeys: { mode: "legacy", masterVaultKey: null, legacyPinKey },
    }),
    false
  );
});

test("isPasskeyUnlockButtonVisible hides during setup and when not enrolled", () => {
  assert.equal(
    isPasskeyUnlockButtonVisible({ isSetupMode: true, enrolled: true }),
    false
  );
  assert.equal(
    isPasskeyUnlockButtonVisible({ isSetupMode: false, enrolled: false }),
    false
  );
  assert.equal(
    isPasskeyUnlockButtonVisible({ isSetupMode: false, enrolled: true }),
    true
  );
});

test("mapPasskeyEnrollmentError returns user-friendly messages", () => {
  const cancelError = new Error("Denied");
  cancelError.name = "NotAllowedError";

  assert.match(mapPasskeyEnrollmentError(cancelError), /cancelled/i);
  assert.match(
    mapPasskeyEnrollmentError(new Error("Passkey enrollment requires WebAuthn PRF support on this device.")),
    /does not support vault passkeys/i
  );
});

test("enrollVaultPasskey replace flow stores a new wrap record", async () => {
  storePasskeyWrapRecord(buildValidRecord());

  const masterVaultKey = generateMasterVaultKey();
  const legacyPinKey = generateRandomBytes(32);
  const prfOutput = generateRandomBytes(32);
  const previous = loadPasskeyWrapRecord();

  const metadata = await enrollVaultPasskey({
    vaultId: TEST_VAULT_ID,
    masterVaultKey,
    legacyPinKey,
    replace: true,
    ...buildMockEnrollDeps({ prfOutput, rawIdSuffix: "replacement-credential" }),
  });

  assert.equal(isVaultPasskeyEnrolled(), true);
  assert.notEqual(metadata.credential_id, previous.credential_id);
  assert.equal(loadPasskeyWrapRecord().vault_id, TEST_VAULT_ID);
});

test("enrollVaultPasskey success stores enrolled metadata", async () => {
  const masterVaultKey = generateMasterVaultKey();
  const legacyPinKey = generateRandomBytes(32);
  const prfOutput = generateRandomBytes(32);

  const metadata = await enrollVaultPasskey({
    vaultId: TEST_VAULT_ID,
    masterVaultKey,
    legacyPinKey,
    ...buildMockEnrollDeps({ prfOutput }),
  });

  assert.equal(metadata.enrolled, true);
  assert.equal(metadata.vault_id, TEST_VAULT_ID);
  assert.ok(metadata.enrolled_at);
  assert.equal(getPasskeyStatusSummary(loadPasskeyWrapRecord()).enrolled, true);
});

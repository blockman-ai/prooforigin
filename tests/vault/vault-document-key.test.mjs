import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deriveVaultDocumentKey,
  encryptVaultBytes,
  decryptVaultBytes,
  generateRandomBytes,
} from "../../app/lib/vaultCrypto.js";
import {
  resolveDocumentRootKey,
  resolveUploadEncryptionParams,
  VAULT_ENCRYPTION_VERSION_LEGACY,
  VAULT_ENCRYPTION_VERSION_MVK,
} from "../../app/lib/vaultDocumentClient.js";

test("resolveUploadEncryptionParams uses legacy key and v1 for legacy mode", () => {
  const legacyPinKey = generateRandomBytes(32);

  const params = resolveUploadEncryptionParams({
    mode: "legacy",
    masterVaultKey: null,
    legacyPinKey,
  });

  assert.deepEqual(Array.from(params.rootKey), Array.from(legacyPinKey));
  assert.equal(params.encryptionVersion, VAULT_ENCRYPTION_VERSION_LEGACY);
});

test("resolveUploadEncryptionParams uses MVK and v2 for mvk mode", () => {
  const masterVaultKey = generateRandomBytes(32);
  const legacyPinKey = generateRandomBytes(32);

  const params = resolveUploadEncryptionParams({
    mode: "mvk",
    masterVaultKey,
    legacyPinKey,
  });

  assert.deepEqual(Array.from(params.rootKey), Array.from(masterVaultKey));
  assert.equal(params.encryptionVersion, VAULT_ENCRYPTION_VERSION_MVK);
});

test("v1 document decrypt uses legacy PIN key", async () => {
  const legacyPinKey = generateRandomBytes(32);
  const masterVaultKey = generateRandomBytes(32);
  const document = { id: "doc-1", encryption_version: 1, content_type_hint: "application/pdf" };
  const aad = "device|doc-1|application/pdf";

  const documentKey = await deriveVaultDocumentKey(legacyPinKey);
  const encrypted = await encryptVaultBytes(new TextEncoder().encode("legacy-doc"), documentKey, aad);

  const rootKey = resolveDocumentRootKey(document, {
    mode: "mvk",
    masterVaultKey,
    legacyPinKey,
  });
  const decryptKey = await deriveVaultDocumentKey(rootKey);
  const plaintext = await decryptVaultBytes(
    encrypted.ciphertext,
    decryptKey,
    encrypted.iv,
    aad
  );

  assert.equal(new TextDecoder().decode(plaintext), "legacy-doc");
});

test("v2 document decrypt uses MVK", async () => {
  const legacyPinKey = generateRandomBytes(32);
  const masterVaultKey = generateRandomBytes(32);
  const document = { id: "doc-2", encryption_version: 2, content_type_hint: "application/pdf" };
  const aad = "device|doc-2|application/pdf";

  const documentKey = await deriveVaultDocumentKey(masterVaultKey);
  const encrypted = await encryptVaultBytes(new TextEncoder().encode("mvk-doc"), documentKey, aad);

  const rootKey = resolveDocumentRootKey(document, {
    mode: "mvk",
    masterVaultKey,
    legacyPinKey,
  });
  const decryptKey = await deriveVaultDocumentKey(rootKey);
  const plaintext = await decryptVaultBytes(
    encrypted.ciphertext,
    decryptKey,
    encrypted.iv,
    aad
  );

  assert.equal(new TextDecoder().decode(plaintext), "mvk-doc");
});

test("v1 document does not decrypt with MVK root", async () => {
  const legacyPinKey = generateRandomBytes(32);
  const masterVaultKey = generateRandomBytes(32);
  const document = { id: "doc-3", encryption_version: 1, content_type_hint: "application/pdf" };
  const aad = "device|doc-3|application/pdf";

  const documentKey = await deriveVaultDocumentKey(legacyPinKey);
  const encrypted = await encryptVaultBytes(new TextEncoder().encode("legacy-only"), documentKey, aad);

  const wrongKey = await deriveVaultDocumentKey(masterVaultKey);

  await assert.rejects(() =>
    decryptVaultBytes(encrypted.ciphertext, wrongKey, encrypted.iv, aad)
  );
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  VAULT_ENCRYPTION_VERSION_LEGACY,
  buildVaultDocumentAad,
  resolveUploadEncryptionParams,
} from "../../app/lib/vaultDocumentClient.js";

test("phase 3 route does not invoke document migration execution helpers", () => {
  const routeSource = readFileSync(
    new URL("../../app/api/vault/ownership/register/route.js", import.meta.url),
    "utf8"
  );

  assert.equal(routeSource.includes("createVaultDocumentMigrationRecord"), false);
  assert.equal(routeSource.includes("vault_complete_document_atomic"), false);
  assert.equal(routeSource.includes("completeVaultDocument"), false);
});

test("phase 3 ownership helper does not change upload/decrypt aad behavior", () => {
  const ownershipSource = readFileSync(
    new URL("../../app/lib/vaultOwnershipClient.js", import.meta.url),
    "utf8"
  );

  assert.equal(ownershipSource.includes("aad_version"), false);
  assert.equal(ownershipSource.includes("uploadEncryptedVaultDocument"), false);
  assert.equal(ownershipSource.includes("decryptVaultDocumentPayload"), false);
});

test("upload/decrypt helpers remain device-scoped and legacy-safe defaults", () => {
  const aad = buildVaultDocumentAad(
    "33333333-3333-4333-8333-333333333333",
    "11111111-1111-4111-8111-111111111111",
    "application/pdf"
  );
  assert.equal(aad.includes("33333333-3333-4333-8333-333333333333"), true);

  const params = resolveUploadEncryptionParams({
    mode: "legacy",
    legacyPinKey: new Uint8Array(32),
  });
  assert.equal(params.encryptionVersion, VAULT_ENCRYPTION_VERSION_LEGACY);
});

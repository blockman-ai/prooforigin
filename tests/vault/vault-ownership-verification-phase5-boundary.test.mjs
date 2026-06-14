import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

test("phase 5 ownership challenge/verify routes remain non-migration execution paths", () => {
  const challengeSource = readFileSync(
    new URL("../../app/api/vault/ownership/challenge/route.js", import.meta.url),
    "utf8"
  );
  const verifySource = readFileSync(
    new URL("../../app/api/vault/ownership/verify/route.js", import.meta.url),
    "utf8"
  );

  for (const source of [challengeSource, verifySource]) {
    assert.equal(source.includes("createVaultDocumentMigrationRecord"), false);
    assert.equal(source.includes("createVaultSignedUploadUrl"), false);
    assert.equal(source.includes("createVaultSignedDownloadUrl"), false);
    assert.equal(source.includes("completeVaultDocument"), false);
    assert.equal(source.includes("vault_complete_document_atomic"), false);
    assert.equal(source.includes("resolveUploadEncryptionParams"), false);
    assert.equal(source.includes("decryptVaultDocumentPayload"), false);
    assert.equal(source.includes("aad_version"), false);
  }
});

test("phase 5 verify route does not persist raw signature material", () => {
  const verifySource = readFileSync(
    new URL("../../app/api/vault/ownership/verify/route.js", import.meta.url),
    "utf8"
  );

  assert.equal(verifySource.includes("signature_hash"), true);
  assert.equal(verifySource.includes("signature_verified"), true);
  assert.equal(verifySource.includes("'signature':"), false);
});

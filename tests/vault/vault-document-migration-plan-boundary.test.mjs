import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

test("phase 6A migration planning route remains planning-only", () => {
  const routeSource = readFileSync(
    new URL("../../app/api/vault/document-migration/plan/route.js", import.meta.url),
    "utf8"
  );

  assert.equal(routeSource.includes("createVaultDocumentMigrationRecord"), true);
  assert.equal(routeSource.includes("VAULT_DOCUMENT_MIGRATION_STATES"), true);
  assert.equal(routeSource.includes("validateVaultDocumentMigrationRecord"), true);

  assert.equal(routeSource.includes("createVaultSignedUploadUrl"), false);
  assert.equal(routeSource.includes("createVaultSignedDownloadUrl"), false);
  assert.equal(routeSource.includes("verifyVaultCiphertextObject"), false);
  assert.equal(routeSource.includes("completeVaultDocument"), false);
  assert.equal(routeSource.includes("completeVaultDocumentAtomic"), false);
  assert.equal(routeSource.includes("vault_complete_document_atomic"), false);
  assert.equal(routeSource.includes("rollbackVaultDocumentInsert"), false);
  assert.equal(routeSource.includes("deleteVaultDocument"), false);
  assert.equal(routeSource.includes("SOURCE_RETIRED"), false);
  assert.equal(routeSource.includes("sourceRetiredAt: new Date"), false);
  assert.equal(routeSource.includes("buildVaultScopedDocumentAad("), false);
  assert.equal(routeSource.includes("aad_version: 3"), false);
  assert.equal(routeSource.includes("VAULT_SCOPED_DOCUMENT_AAD"), false);
});

test("phase 6A does not modify the vault-scoped AAD v3 builder contract", () => {
  const migrationSource = readFileSync(
    new URL("../../app/lib/vaultDocumentMigration.js", import.meta.url),
    "utf8"
  );

  const builderStart = migrationSource.indexOf("export function buildVaultScopedDocumentAad");
  assert.notEqual(builderStart, -1);
  const builderSource = migrationSource.slice(builderStart);

  assert.equal(builderSource.includes("vault_id=${normalizedVaultId}"), true);
  assert.equal(builderSource.includes("doc_id=${normalizedDocId}"), true);
  assert.equal(builderSource.includes("content_type=${normalizedContentType}"), true);
  assert.equal(builderSource.includes("vault_device_id"), false);
  assert.equal(builderSource.includes("migration_job_id"), false);
  assert.equal(builderSource.includes("source_document_id"), false);
});

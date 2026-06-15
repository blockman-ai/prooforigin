import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

const SOURCE_ROUTE = new URL(
  "../../app/api/vault/document-migration/source-url/route.js",
  import.meta.url
);
const STAGING_UPLOAD_ROUTE = new URL(
  "../../app/api/vault/document-migration/staging-upload-url/route.js",
  import.meta.url
);
const STAGING_VERIFY_ROUTE = new URL(
  "../../app/api/vault/document-migration/staging-verify/route.js",
  import.meta.url
);

test("phase 6B routes avoid final commit, retirement, and live slot upload flow", () => {
  const source = readFileSync(SOURCE_ROUTE, "utf8");
  const upload = readFileSync(STAGING_UPLOAD_ROUTE, "utf8");
  const verify = readFileSync(STAGING_VERIFY_ROUTE, "utf8");

  for (const routeSource of [source, upload, verify]) {
    assert.equal(routeSource.includes("completeVaultDocument"), false);
    assert.equal(routeSource.includes("completeVaultDocumentAtomic"), false);
    assert.equal(routeSource.includes("vault_complete_document_atomic"), false);
    assert.equal(routeSource.includes("SOURCE_RETIRED"), false);
    assert.equal(routeSource.includes("source_retired"), false);
    assert.equal(routeSource.includes("buildVaultScopedDocumentAad("), false);
  }

  assert.equal(upload.includes("createVaultSignedUploadUrl("), false);
  assert.equal(upload.includes("buildVaultDocumentStoragePath("), false);
  assert.equal(upload.includes("createVaultSignedUploadUrlForStoragePath("), true);
});

test("phase 6B keeps vault-scoped AAD helper contract unchanged", () => {
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

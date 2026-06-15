import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const CLEANUP_ROUTE = new URL(
  "../../app/api/vault/document-migration/staging-cleanup/route.js",
  import.meta.url
);

test("staging cleanup route stays within Phase 7B cleanup boundary", () => {
  const source = readFileSync(CLEANUP_ROUTE, "utf8");

  assert.equal(source.includes("deleteVaultDocument("), false);
  assert.equal(source.includes("revokeVaultDevice("), false);
  assert.equal(source.includes("SOURCE_RETIRED"), false);
  assert.equal(source.includes("source_retired_at"), false);
  assert.equal(source.includes("orphan_live"), false);
  assert.equal(source.includes("buildVaultDocumentStoragePath"), false);
  assert.equal(source.includes("dataset-capture"), false);
  assert.equal(source.includes("buildVaultMigrationStagingStoragePath"), true);
  assert.equal(source.includes("deleteVaultStorageObject(expectedStagingPath)"), true);
});

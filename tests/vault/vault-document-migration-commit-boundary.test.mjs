import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

const COMMIT_ROUTE = new URL(
  "../../app/api/vault/document-migration/commit/route.js",
  import.meta.url
);

test("phase 6C commit route preserves source authority and retirement boundary", () => {
  const source = readFileSync(COMMIT_ROUTE, "utf8");

  assert.equal(source.includes("deleteVaultDocument("), false);
  assert.equal(source.includes("revokeVaultDevice("), false);
  assert.equal(source.includes("SOURCE_RETIRED"), false);
  assert.equal(source.includes("source_retired_at: new Date"), false);
  assert.equal(source.includes("source_retirement_eligible"), true);
  assert.equal(source.includes("RETENTION_WINDOW_DAYS = 7"), true);
  assert.equal(source.includes("buildVaultScopedDocumentAad("), false);
  assert.equal(source.includes("copyVaultStorageObject"), true);
  assert.equal(source.includes("buildVaultDocumentStoragePath"), true);
});

test("phase 6C commit SQL keeps source retirement inactive", () => {
  const sql = readFileSync(
    new URL("../../docs/sql/vault_document_migration_phase6c_commit.sql", import.meta.url),
    "utf8"
  );

  assert.equal(sql.includes("state = 'completed'"), true);
  assert.equal(sql.includes("source_retirement_state = 'active'"), true);
  assert.equal(sql.includes("source_retired_at = null"), true);
  assert.equal(sql.includes("delete from public.vault_documents"), false);
  assert.equal(sql.includes("public.vault_device_registrations"), false);
});

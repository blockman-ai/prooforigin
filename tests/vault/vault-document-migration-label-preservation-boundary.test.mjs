import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const ROUTES = [
  "../../app/api/vault/document-migration/source-url/route.js",
  "../../app/api/vault/document-migration/staging-verify/route.js",
  "../../app/api/vault/document-migration/commit/route.js",
];

test("migration label preservation never decrypts labels on the server", () => {
  for (const routePath of ROUTES) {
    const source = readFileSync(new URL(routePath, import.meta.url), "utf8");

    assert.equal(source.includes("decryptVaultBytes"), false);
    assert.equal(source.includes("crypto.subtle.decrypt"), false);
    assert.equal(source.includes("decryptLabel"), false);
  }
});

test("migration commit rejects source label envelope reuse", () => {
  const route = readFileSync(
    new URL("../../app/api/vault/document-migration/commit/route.js", import.meta.url),
    "utf8"
  );
  const sql = readFileSync(
    new URL("../../docs/sql/vault_document_migration_phase6c_commit.sql", import.meta.url),
    "utf8"
  );

  assert.equal(route.includes("SOURCE_LABEL_REUSE_REJECTED"), true);
  assert.equal(sql.includes("SOURCE_LABEL_REUSE_REJECTED"), true);
  assert.equal(route.includes("labelCiphertext: sourceDocument.label_ciphertext"), false);
});

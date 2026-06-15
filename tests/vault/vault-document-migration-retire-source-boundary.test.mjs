import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const RETIRE_ROUTE = new URL(
  "../../app/api/vault/document-migration/retire-source/route.js",
  import.meta.url
);
const RETIRE_SQL = new URL(
  "../../docs/sql/vault_document_migration_phase7c_retirement.sql",
  import.meta.url
);

test("retire-source route preserves rollback boundary", () => {
  const source = readFileSync(RETIRE_ROUTE, "utf8");

  assert.equal(source.includes("deleteVaultStorageObject"), false);
  assert.equal(source.includes("deleteVaultDocument("), false);
  assert.equal(source.includes("revokeVaultDevice("), false);
  assert.equal(source.includes("deleted_at:"), false);
  assert.equal(source.includes("source_retired_at"), true);
});

test("retirement SQL uses source_retired_at without storage deletion or device revoke", () => {
  const sql = readFileSync(RETIRE_SQL, "utf8").toLowerCase();

  assert.equal(sql.includes("source_retired_at"), true);
  assert.equal(sql.includes("delete from"), false);
  assert.equal(sql.includes(".remove"), false);
  assert.equal(sql.includes("vault_device_registrations"), false);
  assert.equal(sql.includes("deleted_at ="), false);
});

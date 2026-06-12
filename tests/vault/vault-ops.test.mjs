import assert from "node:assert/strict";
import { test } from "node:test";
import { computeVaultStorageAudit } from "../../app/lib/vaultOps.js";

test("computeVaultStorageAudit detects orphan and missing ciphertext paths", () => {
  const audit = computeVaultStorageAudit(
    ["device-a/doc-1.enc"],
    ["device-a/doc-1.enc", "device-b/orphan.enc"]
  );

  assert.equal(audit.active_document_count, 1);
  assert.equal(audit.storage_object_count, 2);
  assert.equal(audit.orphan_count, 1);
  assert.equal(audit.missing_ciphertext_count, 0);
  assert.deepEqual(audit.orphan_paths_sample, ["device-b/orphan.enc"]);
});

test("computeVaultStorageAudit detects missing storage objects", () => {
  const audit = computeVaultStorageAudit(
    ["device-a/doc-1.enc", "device-a/doc-2.enc"],
    ["device-a/doc-1.enc"]
  );

  assert.equal(audit.missing_ciphertext_count, 1);
  assert.deepEqual(audit.missing_paths_sample, ["device-a/doc-2.enc"]);
});

test("computeVaultStorageAudit reports clean storage when paths match", () => {
  const audit = computeVaultStorageAudit(
    ["device-a/doc-1.enc"],
    ["device-a/doc-1.enc"]
  );

  assert.equal(audit.orphan_count, 0);
  assert.equal(audit.missing_ciphertext_count, 0);
});

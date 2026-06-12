import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "node:module";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const DOC_ID = "11111111-1111-4111-8111-111111111111";

function buildCompleteMocks({ encryptionVersion = 2 } = {}) {
  mock.module("../../app/lib/vaultAuth.js", {
    exports: {
      authorizeVaultRequest: async () => ({
        ok: true,
        vault_device_id: DEVICE_ID,
      }),
      isVaultDocumentCompromised: () => false,
      vaultAuthFailureResponse: (auth) => auth,
    },
  });

  mock.module("../../app/lib/vaultAdmin.js", {
    exports: {
      isVaultAdminConfigured: () => true,
      buildVaultDocumentStoragePath: () => `${DEVICE_ID}/${DOC_ID}.enc`,
      getVaultDocumentByDevice: async () => ({ document: null, error: null }),
      verifyVaultCiphertextObject: async () => ({ ok: true }),
      completeVaultDocumentAtomic: async () => ({
        document: {
          id: DOC_ID,
          vault_device_id: DEVICE_ID,
          storage_path: `${DEVICE_ID}/${DOC_ID}.enc`,
          ciphertext_sha256: "a".repeat(64),
          ciphertext_bytes: 128,
          content_type_hint: "application/pdf",
          encryption_version: encryptionVersion,
          compromised_at: null,
          deleted_at: null,
          created_at: "2026-06-11T12:00:00.000Z",
          updated_at: "2026-06-11T12:00:00.000Z",
          label_present: false,
        },
        error: null,
        usedRpc: true,
      }),
      completeVaultDocument: async () => ({ document: null, error: null }),
      rollbackVaultDocumentInsert: async () => ({ error: null }),
      VAULT_ENCRYPTION_VERSION_LEGACY: 1,
      VAULT_ENCRYPTION_VERSION_MVK: 2,
      VAULT_ALLOWED_ENCRYPTION_VERSIONS: [1, 2],
      VAULT_ENCRYPTION_VERSION: 1,
    },
  });

  mock.module("../../app/lib/vaultDocumentState.js", {
    exports: {
      appendVaultDocumentEvent: async () => ({ event: { id: "evt" }, error: null }),
      computeVaultDocumentStateHash: () => "b".repeat(64),
      VAULT_DOCUMENT_EVENT_TYPES: { CREATED: "created" },
      VAULT_DOCUMENT_GENESIS_STATE_HASH: "c".repeat(64),
    },
  });
}

test("complete route accepts encryption_version 2 and rejects unsupported version", async (t) => {
  buildCompleteMocks({ encryptionVersion: 2 });

  const { POST } = await import("../../app/api/vault/document/complete/route.js");

  const successResponse = await POST(
    new Request("http://localhost/api/vault/document/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        doc_id: DOC_ID,
        storage_path: `${DEVICE_ID}/${DOC_ID}.enc`,
        ciphertext_sha256: "a".repeat(64),
        ciphertext_bytes: 128,
        content_type_hint: "application/pdf",
        encryption_version: 2,
      }),
    })
  );

  assert.equal(successResponse.status, 200);
  const successJson = await successResponse.json();
  assert.equal(successJson.success, true);
  assert.equal(successJson.document.encryption_version, 2);

  const rejectResponse = await POST(
    new Request("http://localhost/api/vault/document/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        doc_id: DOC_ID,
        storage_path: `${DEVICE_ID}/${DOC_ID}.enc`,
        ciphertext_sha256: "a".repeat(64),
        ciphertext_bytes: 128,
        content_type_hint: "application/pdf",
        encryption_version: 3,
      }),
    })
  );

  assert.equal(rejectResponse.status, 400);
  const rejectJson = await rejectResponse.json();
  assert.equal(rejectJson.code, "INVALID_REQUEST");
  assert.match(rejectJson.error, /encryption_version must be one of/);

  t.mock.restoreAll();
});

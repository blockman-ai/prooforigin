import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "node:module";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const DOC_ID = "11111111-1111-4111-8111-111111111111";

test("complete route rolls back document when legacy created event fails", async (t) => {
  let deleteCalled = false;

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
        document: null,
        error: { code: "42883", message: "function not found" },
        usedRpc: true,
      }),
      completeVaultDocument: async () => ({
        document: {
          id: DOC_ID,
          vault_device_id: DEVICE_ID,
          storage_path: `${DEVICE_ID}/${DOC_ID}.enc`,
          ciphertext_sha256: "a".repeat(64),
          ciphertext_bytes: 128,
          content_type_hint: "application/pdf",
          encryption_version: 1,
          compromised_at: null,
          deleted_at: null,
          created_at: "2026-06-11T12:00:00.000Z",
          updated_at: "2026-06-11T12:00:00.000Z",
          label_present: false,
        },
        error: null,
      }),
      rollbackVaultDocumentInsert: async () => {
        deleteCalled = true;
        return { error: null };
      },
      VAULT_ENCRYPTION_VERSION: 1,
    },
  });

  mock.module("../../app/lib/vaultDocumentState.js", {
    exports: {
      appendVaultDocumentEvent: async () => ({
        event: null,
        error: { message: "state event failed" },
      }),
      computeVaultDocumentStateHash: () => "b".repeat(64),
      VAULT_DOCUMENT_EVENT_TYPES: { CREATED: "created" },
      VAULT_DOCUMENT_GENESIS_STATE_HASH: "c".repeat(64),
    },
  });

  const { POST } = await import("../../app/api/vault/document/complete/route.js");

  const response = await POST(
    new Request("http://localhost/api/vault/document/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        doc_id: DOC_ID,
        storage_path: `${DEVICE_ID}/${DOC_ID}.enc`,
        ciphertext_sha256: "a".repeat(64),
        ciphertext_bytes: 128,
        content_type_hint: "application/pdf",
        encryption_version: 1,
      }),
    })
  );

  assert.equal(response.status, 502);
  assert.equal(deleteCalled, true);

  const json = await response.json();
  assert.equal(json.code, "DOCUMENT_STATE_EVENT_FAILED");

  t.mock.restoreAll();
});

import assert from "node:assert/strict";
import { register } from "node:module";
import { mock, test } from "node:test";
import { pathToFileURL } from "node:url";
import { createInMemoryVaultStateStore } from "../helpers/inMemoryVaultStateStore.mjs";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const DOCUMENT_ID = "11111111-1111-4111-8111-111111111111";
const VIEW_SESSION_ID = "22222222-2222-4222-8222-222222222222";
const VAULT_DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const ROUTE_PATH = "/api/vault/document/view-started";

const mockDocument = {
  id: DOCUMENT_ID,
  vault_device_id: VAULT_DEVICE_ID,
  ciphertext_sha256: "a".repeat(64),
  ciphertext_bytes: 1280,
  content_type_hint: "application/pdf",
  encryption_version: 1,
  compromised_at: null,
  deleted_at: null,
};

function buildViewStartedRequest(startedAt = "2026-06-11T12:00:00.000Z") {
  const body = JSON.stringify({
    document_id: DOCUMENT_ID,
    view_session_id: VIEW_SESSION_ID,
    started_at: startedAt,
  });

  return new Request(`http://localhost${ROUTE_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
  });
}

async function setupRouteTest(store) {
  mock.module("../../app/lib/vaultAuth.js", {
    exports: {
      authorizeVaultRequest: async () => ({
        ok: true,
        vault_device_id: VAULT_DEVICE_ID,
      }),
      vaultAuthFailureResponse: (auth) => auth,
    },
  });

  mock.module("../../app/lib/vaultAdmin.js", {
    exports: {
      isVaultAdminConfigured: () => true,
      createVaultAdminClient: () => store.client,
      getVaultDocumentByDevice: async () => ({
        document: mockDocument,
        error: null,
      }),
      getVaultDocumentById: async () => ({
        document: mockDocument,
        error: null,
      }),
    },
  });

  return import("../../app/api/vault/document/view-started/route.js");
}

test("POST /api/vault/document/view-started deduplicates by view_session_id", async (t) => {
  const store = createInMemoryVaultStateStore();
  const { POST } = await setupRouteTest(store);

  const firstResponse = await POST(buildViewStartedRequest());
  assert.equal(firstResponse.status, 200);

  const firstJson = await firstResponse.json();
  assert.equal(firstJson.success, true);
  assert.equal(firstJson.view_started, true);
  assert.equal(firstJson.duplicate, false);
  assert.equal(firstJson.document_id, DOCUMENT_ID);
  assert.equal(firstJson.view_session_id, VIEW_SESSION_ID);
  assert.ok(firstJson.event_id);

  assert.equal(store.insertCount, 1);
  assert.equal(store.events.length, 1);
  assert.equal(store.events[0].event_type, "view_started");
  assert.equal(store.events[0].metadata.view_session_id, VIEW_SESSION_ID);

  const firstEventId = firstJson.event_id;
  const firstStateHash = store.events[0].state_hash;

  const secondResponse = await POST(buildViewStartedRequest());
  assert.equal(secondResponse.status, 200);

  const secondJson = await secondResponse.json();
  assert.equal(secondJson.success, true);
  assert.equal(secondJson.view_started, true);
  assert.equal(secondJson.duplicate, true);
  assert.equal(secondJson.document_id, DOCUMENT_ID);
  assert.equal(secondJson.view_session_id, VIEW_SESSION_ID);
  assert.equal(secondJson.event_id, firstEventId);

  assert.equal(store.insertCount, 1, "duplicate request must not append another hash-chain event");
  assert.equal(store.events.length, 1);
  assert.equal(store.events[0].state_hash, firstStateHash);

  t.mock.restoreAll();
});

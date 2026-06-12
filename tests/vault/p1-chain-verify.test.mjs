import assert from "node:assert/strict";
import { register } from "node:module";
import { test } from "node:test";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const {
  computeVaultDocumentStateHash,
  verifyVaultDocumentStateChainRecords,
  VAULT_DOCUMENT_EVENT_TYPES,
  VAULT_DOCUMENT_GENESIS_STATE_HASH,
} = await import("../../app/lib/vaultDocumentState.js");

const DOCUMENT_ID = "11111111-1111-4111-8111-111111111111";
const DEVICE_ID = "33333333-3333-4333-8333-333333333333";

const document = {
  id: DOCUMENT_ID,
  vault_device_id: DEVICE_ID,
  ciphertext_sha256: "a".repeat(64),
  ciphertext_bytes: 2048,
  content_type_hint: "application/pdf",
  encryption_version: 1,
  compromised_at: null,
  deleted_at: null,
};

test("verifyVaultDocumentStateChainRecords passes a valid created chain", () => {
  const createdAt = "2026-06-11T12:00:00.000Z";
  const metadata = { source: "test" };
  const stateHash = computeVaultDocumentStateHash({
    documentId: DOCUMENT_ID,
    eventType: VAULT_DOCUMENT_EVENT_TYPES.CREATED,
    previousStateHash: VAULT_DOCUMENT_GENESIS_STATE_HASH,
    document: {
      ...document,
      compromised_at: null,
      deleted_at: null,
    },
    metadata,
    createdAt,
  });

  const result = verifyVaultDocumentStateChainRecords({
    documentId: DOCUMENT_ID,
    document,
    events: [
      {
        id: "event-1",
        event_type: VAULT_DOCUMENT_EVENT_TYPES.CREATED,
        previous_state_hash: VAULT_DOCUMENT_GENESIS_STATE_HASH,
        state_hash: stateHash,
        created_at: createdAt,
        metadata,
      },
    ],
  });

  assert.equal(result.verified, true);
  assert.equal(result.event_count, 1);
  assert.equal(result.broken_at, null);
});

test("verifyVaultDocumentStateChainRecords fails when state_hash is tampered", () => {
  const createdAt = "2026-06-11T12:00:00.000Z";
  const metadata = { source: "test" };
  const stateHash = computeVaultDocumentStateHash({
    documentId: DOCUMENT_ID,
    eventType: VAULT_DOCUMENT_EVENT_TYPES.CREATED,
    previousStateHash: VAULT_DOCUMENT_GENESIS_STATE_HASH,
    document: {
      ...document,
      compromised_at: null,
      deleted_at: null,
    },
    metadata,
    createdAt,
  });

  const result = verifyVaultDocumentStateChainRecords({
    documentId: DOCUMENT_ID,
    document,
    events: [
      {
        id: "event-1",
        event_type: VAULT_DOCUMENT_EVENT_TYPES.CREATED,
        previous_state_hash: VAULT_DOCUMENT_GENESIS_STATE_HASH,
        state_hash: `${stateHash.slice(0, -1)}0`,
        created_at: createdAt,
        metadata,
      },
    ],
  });

  assert.equal(result.verified, false);
  assert.equal(result.broken_at, "event-1");
  assert.match(result.reason, /state_hash mismatch/);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { buildVaultCustodyTimeline } from "../../app/lib/vaultCustodyTimeline.js";

const VAULT_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_VAULT_ID = "77777777-7777-4777-8777-777777777777";
const DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const SOURCE_DEVICE_ID = "55555555-5555-4555-8555-555555555555";
const DOC_ID = "11111111-1111-4111-8111-111111111111";
const MIGRATION_ID = "99999999-9999-4999-8999-999999999999";

test("custody timeline builder derives grouped migration and document events", () => {
  const result = buildVaultCustodyTimeline({
    vaultId: VAULT_ID,
    currentVaultDeviceId: DEVICE_ID,
    devices: [
      {
        vault_device_id: DEVICE_ID,
        device_public_id: "vdp_target",
        vault_id: VAULT_ID,
        vault_id_bound_at: "2026-01-02T00:00:00.000Z",
        created_at: "2026-01-01T00:00:00.000Z",
        revoked_at: null,
        verified: true,
      },
      {
        vault_device_id: SOURCE_DEVICE_ID,
        device_public_id: "vdp_source",
        vault_id: OTHER_VAULT_ID,
        created_at: "2026-01-03T00:00:00.000Z",
        revoked_at: null,
        verified: false,
      },
    ],
    documents: [
      {
        id: DOC_ID,
        vault_device_id: DEVICE_ID,
        vault_id: VAULT_ID,
        content_type_hint: "application/pdf",
        created_at: "2026-01-10T00:00:00.000Z",
        updated_at: "2026-01-10T00:00:00.000Z",
        deleted_at: null,
        compromised_at: null,
        source_retired_at: null,
      },
    ],
    documentStateEvents: [
      {
        document_id: DOC_ID,
        event_type: "created",
        created_at: "2026-01-10T00:00:00.000Z",
      },
      {
        document_id: DOC_ID,
        event_type: "compromised",
        created_at: "2026-01-11T00:00:00.000Z",
      },
    ],
    ownershipVerifications: [
      {
        vault_device_id: DEVICE_ID,
        vault_id: VAULT_ID,
        verified_at: "2026-01-12T00:00:00.000Z",
      },
    ],
    ownershipKey: {
      vault_id: VAULT_ID,
      created_at: "2026-01-05T00:00:00.000Z",
    },
    migrations: [
      {
        id: MIGRATION_ID,
        vault_id: VAULT_ID,
        source_vault_device_id: SOURCE_DEVICE_ID,
        target_vault_device_id: DEVICE_ID,
        state: "completed",
        failure_reason: null,
        source_retirement_state: "source_retired",
        upload_started_at: "2026-01-14T08:00:00.000Z",
        completed_at: "2026-01-15T09:00:00.000Z",
        source_retired_at: "2026-01-15T10:00:00.000Z",
        created_at: "2026-01-14T07:00:00.000Z",
        updated_at: "2026-01-15T10:00:00.000Z",
        metadata: {
          staging_verified: true,
          staging_verified_at: "2026-01-14T08:30:00.000Z",
          staging_cleanup_state: "deleted",
          staging_cleanup_completed_at: "2026-01-22T12:00:00.000Z",
          source_retirement_eligible: true,
          source_retirement_not_before: "2026-01-15T09:00:00.000Z",
          live_storage_path: "secret/path.enc",
          staging_ciphertext_sha256: "a".repeat(64),
        },
      },
    ],
  });

  const kinds = result.timeline.entries.map((entry) => entry.kind);
  assert.equal(kinds.includes("document.created"), true);
  assert.equal(kinds.includes("document.compromised"), true);
  assert.equal(kinds.includes("device.registered"), true);
  assert.equal(kinds.includes("device.bound"), true);
  assert.equal(kinds.includes("ownership.key_registered"), true);
  assert.equal(kinds.includes("ownership.verified"), true);
  assert.equal(kinds.includes("migration.planned"), true);
  assert.equal(kinds.includes("migration.upload_started"), true);
  assert.equal(kinds.includes("migration.staging_verified"), true);
  assert.equal(kinds.includes("migration.committed"), true);
  assert.equal(kinds.includes("cleanup.completed"), true);
  assert.equal(kinds.includes("retirement.completed"), true);
  assert.equal(result.timeline.groups.length, 1);
  assert.equal(result.timeline.groups[0].title, "Migration to vdp_target");

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("ciphertext"), false);
  assert.equal(serialized.includes("storage_path"), false);
  assert.equal(serialized.includes("sha256"), false);
  assert.equal(serialized.includes(VAULT_ID), false);
  assert.equal(serialized.includes("vdp_source"), false);
});

test("custody timeline orders newest first and respects limit", () => {
  const result = buildVaultCustodyTimeline({
    vaultId: VAULT_ID,
    currentVaultDeviceId: DEVICE_ID,
    documentStateEvents: [
      { document_id: DOC_ID, event_type: "created", created_at: "2026-01-01T00:00:00.000Z" },
      { document_id: DOC_ID, event_type: "deleted", created_at: "2026-02-01T00:00:00.000Z" },
    ],
    documents: [
      {
        id: DOC_ID,
        vault_device_id: DEVICE_ID,
        vault_id: VAULT_ID,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-02-01T00:00:00.000Z",
        deleted_at: "2026-02-01T00:00:00.000Z",
      },
    ],
    limit: 1,
  });

  assert.equal(result.timeline.entries.length, 1);
  assert.equal(result.timeline.entries[0].kind, "document.deleted");
});

test("custody timeline ignores null entries from missing timestamps", () => {
  const result = buildVaultCustodyTimeline({
    vaultId: VAULT_ID,
    currentVaultDeviceId: DEVICE_ID,
    ownershipVerifications: [
      {
        vault_device_id: DEVICE_ID,
        vault_id: VAULT_ID,
        verified_at: null,
      },
    ],
    documentStateEvents: [
      { document_id: DOC_ID, event_type: "created", created_at: "2026-01-01T00:00:00.000Z" },
    ],
    documents: [
      {
        id: DOC_ID,
        vault_device_id: DEVICE_ID,
        vault_id: VAULT_ID,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
  });

  assert.equal(result.timeline.entries.some((entry) => entry.kind === "ownership.verified"), false);
  assert.equal(result.timeline.entries.some((entry) => entry.kind === "document.created"), true);
});

test("custody timeline health markers use full vault history not display window", () => {
  const fillerEvents = Array.from({ length: 5 }, (_, index) => ({
    document_id: DOC_ID,
    event_type: "created",
    created_at: `2026-03-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
  }));

  const result = buildVaultCustodyTimeline({
    vaultId: VAULT_ID,
    currentVaultDeviceId: DEVICE_ID,
    documentStateEvents: [
      ...fillerEvents,
      {
        document_id: DOC_ID,
        event_type: "compromised",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    documents: [
      {
        id: DOC_ID,
        vault_device_id: DEVICE_ID,
        vault_id: VAULT_ID,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    limit: 1,
  });

  assert.equal(result.timeline.entries.length, 1);
  assert.equal(result.timeline.entries[0].kind, "document.created");
  assert.equal(
    result.timeline.health_markers.some((marker) => marker.kind === "compromised_active"),
    true
  );
});

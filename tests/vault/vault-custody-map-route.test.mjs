import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "node:module";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const SOURCE_DEVICE_ID = "55555555-5555-4555-8555-555555555555";
const VAULT_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_VAULT_ID = "77777777-7777-4777-8777-777777777777";

function request() {
  return new Request("http://localhost/api/vault/custody-map", {
    method: "GET",
  });
}

test("custody map enforces auth scope and returns sanitized summary", async (t) => {
  const scenario = {
    auth: { ok: true, vault_device_id: DEVICE_ID },
    registration: {
      vault_device_id: DEVICE_ID,
      device_public_id: "vdp_current",
      vault_id: VAULT_ID,
    },
    verified: true,
    devices: [],
    documents: [],
    migrations: [],
  };

  mock.module("../../app/lib/vaultAuth.js", {
    exports: {
      authorizeVaultRequest: async () => scenario.auth,
      vaultAuthFailureResponse: (auth) => auth,
    },
  });

  mock.module("../../app/lib/vaultAdmin.js", {
    exports: {
      isVaultAdminConfigured: () => true,
      getBoundVaultDeviceRegistration: async () => ({
        registration: scenario.registration,
        error: null,
      }),
      hasVerifiedVaultOwnershipForDevice: async () => ({
        verified: scenario.verified,
        error: null,
      }),
      listVaultCustodyDevices: async () => ({ devices: scenario.devices, error: null }),
      listVaultCustodyDocuments: async () => ({ documents: scenario.documents, error: null }),
      listVaultCustodyMigrations: async () => ({
        migrations: scenario.migrations,
        error: null,
      }),
    },
  });

  const { GET } = await import("../../app/api/vault/custody-map/route.js");

  scenario.auth = { ok: false, status: 401, code: "AUTH_FAILED" };
  let response = await GET(request());
  let json = await response.json();
  assert.equal(response.status, 401);
  assert.equal(json.code, "AUTH_FAILED");

  scenario.auth = { ok: true, vault_device_id: DEVICE_ID };
  scenario.registration = null;
  response = await GET(request());
  json = await response.json();
  assert.equal(response.status, 403);
  assert.equal(json.code, "VAULT_DEVICE_NOT_BOUND");

  scenario.registration = {
    vault_device_id: DEVICE_ID,
    device_public_id: "vdp_current",
    vault_id: VAULT_ID,
  };
  scenario.verified = false;
  response = await GET(request());
  json = await response.json();
  assert.equal(response.status, 403);
  assert.equal(json.code, "OWNERSHIP_VERIFICATION_REQUIRED");

  scenario.verified = true;
  scenario.devices = [
    {
      vault_device_id: DEVICE_ID,
      device_public_id: "vdp_current",
      vault_id: VAULT_ID,
      auth_secret_hash: "secret_should_not_return",
      created_at: "2026-01-01T00:00:00.000Z",
      last_seen_at: "2026-01-02T00:00:00.000Z",
      revoked_at: null,
      verified: true,
    },
    {
      vault_device_id: SOURCE_DEVICE_ID,
      device_public_id: "vdp_source",
      vault_id: VAULT_ID,
      created_at: "2026-01-03T00:00:00.000Z",
      last_seen_at: null,
      revoked_at: null,
      verified: false,
    },
    {
      vault_device_id: "66666666-6666-4666-8666-666666666666",
      device_public_id: "vdp_revoked",
      vault_id: VAULT_ID,
      created_at: "2026-01-04T00:00:00.000Z",
      last_seen_at: null,
      revoked_at: "2026-01-05T00:00:00.000Z",
      verified: true,
    },
    {
      vault_device_id: "88888888-8888-4888-8888-888888888888",
      device_public_id: "other_should_not_return",
      vault_id: OTHER_VAULT_ID,
      created_at: "2026-01-06T00:00:00.000Z",
      last_seen_at: null,
      revoked_at: null,
      verified: true,
    },
  ];
  scenario.documents = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      vault_device_id: DEVICE_ID,
      vault_id: VAULT_ID,
      content_type_hint: "application/pdf",
      label_present: true,
      label_ciphertext: "label_ciphertext_should_not_return",
      storage_path: "storage/path/should-not-return.enc",
      ciphertext_sha256: "a".repeat(64),
      compromised_at: null,
      source_retired_at: null,
      created_at: "2026-02-01T00:00:00.000Z",
      updated_at: "2026-02-02T00:00:00.000Z",
      deleted_at: null,
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      vault_device_id: SOURCE_DEVICE_ID,
      vault_id: VAULT_ID,
      content_type_hint: "image/png",
      label_present: false,
      compromised_at: null,
      source_retired_at: "2026-02-03T00:00:00.000Z",
      created_at: "2026-02-03T00:00:00.000Z",
      updated_at: "2026-02-03T00:00:00.000Z",
      deleted_at: null,
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      vault_device_id: SOURCE_DEVICE_ID,
      vault_id: VAULT_ID,
      content_type_hint: "image/jpeg",
      label_present: false,
      compromised_at: "2026-02-04T00:00:00.000Z",
      source_retired_at: null,
      created_at: "2026-02-04T00:00:00.000Z",
      updated_at: "2026-02-04T00:00:00.000Z",
      deleted_at: null,
    },
    {
      id: "99999999-9999-4999-8999-999999999999",
      vault_device_id: DEVICE_ID,
      vault_id: OTHER_VAULT_ID,
      content_type_hint: "application/pdf",
      label_present: false,
      compromised_at: null,
      source_retired_at: null,
      created_at: "2026-02-05T00:00:00.000Z",
      updated_at: "2026-02-05T00:00:00.000Z",
      deleted_at: null,
    },
  ];
  scenario.migrations = [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      vault_id: VAULT_ID,
      source_document_id: "22222222-2222-4222-8222-222222222222",
      target_document_id: "11111111-1111-4111-8111-111111111111",
      source_vault_device_id: SOURCE_DEVICE_ID,
      target_vault_device_id: DEVICE_ID,
      state: "completed",
      failure_reason: null,
      source_retirement_state: "active",
      source_retired_at: null,
      created_at: "2026-03-01T00:00:00.000Z",
      updated_at: "2026-03-02T00:00:00.000Z",
      completed_at: "2026-03-02T00:00:00.000Z",
      metadata: {
        source_retirement_eligible: true,
        staging_cleanup_state: "pending",
        live_storage_path: "storage/path/should-not-return.enc",
        staging_ciphertext_sha256: "b".repeat(64),
      },
    },
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      vault_id: VAULT_ID,
      source_vault_device_id: SOURCE_DEVICE_ID,
      target_vault_device_id: DEVICE_ID,
      state: "failed",
      failure_reason: "upload_failed",
      source_retirement_state: "active",
      source_retired_at: null,
      created_at: "2026-03-03T00:00:00.000Z",
      updated_at: "2026-03-03T00:00:00.000Z",
      completed_at: null,
      metadata: {},
    },
    {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      vault_id: OTHER_VAULT_ID,
      source_vault_device_id: SOURCE_DEVICE_ID,
      target_vault_device_id: DEVICE_ID,
      state: "completed",
      failure_reason: null,
      source_retirement_state: "active",
      source_retired_at: null,
      created_at: "2026-03-04T00:00:00.000Z",
      updated_at: "2026-03-04T00:00:00.000Z",
      completed_at: "2026-03-04T00:00:00.000Z",
      metadata: { source_retirement_eligible: true },
    },
  ];

  response = await GET(request());
  json = await response.json();
  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.deepEqual(json.vault.summary, {
    active_documents: 2,
    retired_documents: 1,
    compromised_documents: 1,
    verified_devices: 1,
    revoked_devices: 1,
    completed_migrations: 1,
    failed_migrations: 1,
    cleanup_pending: 1,
    retirement_eligible: 1,
  });
  assert.equal(json.devices.length, 3);
  assert.equal(json.documents.length, 3);
  assert.equal(json.migrations.length, 2);
  assert.deepEqual(
    json.pending_actions.map((action) => action.type).sort(),
    [
      "cleanup_pending",
      "compromised_document_review",
      "ownership_verification_required",
      "retirement_eligible",
    ].sort()
  );
  assert.deepEqual(json.sentinel_summary, {
    migration_success_count: 1,
    migration_failure_count: 1,
    cleanup_pending_count: 1,
    retirement_pending_count: 1,
    compromised_document_count: 1,
  });

  const serialized = JSON.stringify(json);
  assert.equal(serialized.includes("ciphertext"), false);
  assert.equal(serialized.includes("storage_path"), false);
  assert.equal(serialized.includes("storage/path"), false);
  assert.equal(serialized.includes("sha256"), false);
  assert.equal(serialized.includes("hash"), false);
  assert.equal(serialized.includes("secret"), false);
  assert.equal(serialized.includes("auth_secret"), false);
  assert.equal(serialized.includes(VAULT_ID), false);
  assert.equal(serialized.includes(OTHER_VAULT_ID), false);
  assert.equal(serialized.includes("other_should_not_return"), false);

  t.mock.restoreAll();
});

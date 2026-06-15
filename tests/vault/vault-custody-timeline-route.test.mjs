import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "node:module";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const VAULT_ID = "44444444-4444-4444-8444-444444444444";
const DOC_ID = "11111111-1111-4111-8111-111111111111";
const MIGRATION_ID = "99999999-9999-4999-8999-999999999999";

function request() {
  return new Request("http://localhost/api/vault/custody-timeline?limit=50", {
    method: "GET",
  });
}

test("custody timeline route enforces auth and returns sanitized entries", async (t) => {
  const scenario = {
    auth: { ok: true, vault_device_id: DEVICE_ID },
    registration: {
      vault_device_id: DEVICE_ID,
      device_public_id: "vdp_target",
      vault_id: VAULT_ID,
    },
    verified: true,
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
      listVaultCustodyDevices: async () => ({
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
        ],
        error: null,
      }),
      listVaultCustodyDocumentsForTimeline: async () => ({
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
        error: null,
      }),
      listVaultCustodyMigrations: async () => ({
        migrations: [
          {
            id: MIGRATION_ID,
            vault_id: VAULT_ID,
            source_vault_device_id: "55555555-5555-4555-8555-555555555555",
            target_vault_device_id: DEVICE_ID,
            state: "completed",
            failure_reason: null,
            source_retirement_state: "active",
            upload_started_at: "2026-01-14T08:00:00.000Z",
            completed_at: "2026-01-15T09:00:00.000Z",
            source_retired_at: null,
            created_at: "2026-01-14T07:00:00.000Z",
            updated_at: "2026-01-15T09:00:00.000Z",
            metadata: {
              staging_verified: true,
              staging_verified_at: "2026-01-14T08:30:00.000Z",
              staging_cleanup_state: "pending",
              source_retirement_eligible: true,
              source_retirement_not_before: "2026-01-16T00:00:00.000Z",
              live_storage_path: "secret/path.enc",
            },
          },
        ],
        error: null,
      }),
      listVaultCustodyDocumentStateEvents: async () => ({
        events: [
          {
            document_id: DOC_ID,
            event_type: "created",
            created_at: "2026-01-10T00:00:00.000Z",
          },
        ],
        error: null,
      }),
      listVaultCustodyOwnershipVerifications: async () => ({
        verifications: [
          {
            vault_device_id: DEVICE_ID,
            vault_id: VAULT_ID,
            verified_at: "2026-01-12T00:00:00.000Z",
          },
        ],
        error: null,
      }),
      getVaultOwnershipKey: async () => ({
        ownershipKey: { vault_id: VAULT_ID, created_at: "2026-01-05T00:00:00.000Z" },
        error: null,
      }),
    },
  });

  const { GET } = await import("../../app/api/vault/custody-timeline/route.js");

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
    device_public_id: "vdp_target",
    vault_id: VAULT_ID,
  };
  scenario.verified = false;
  response = await GET(request());
  json = await response.json();
  assert.equal(response.status, 403);
  assert.equal(json.code, "OWNERSHIP_VERIFICATION_REQUIRED");

  scenario.verified = true;
  response = await GET(request());
  json = await response.json();
  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.timeline.scope, "verified_vault");
  assert.equal(json.timeline.entries.length > 0, true);
  assert.equal(
    json.timeline.entries.some((entry) => entry.kind === "migration.committed"),
    true
  );
  assert.equal(
    json.timeline.entries.some((entry) => entry.kind === "cleanup.pending"),
    true
  );

  const serialized = JSON.stringify(json);
  assert.equal(serialized.includes("ciphertext"), false);
  assert.equal(serialized.includes("storage_path"), false);
  assert.equal(serialized.includes("sha256"), false);
  assert.equal(serialized.includes("hash"), false);
  assert.equal(serialized.includes("secret"), false);
  assert.equal(serialized.includes(VAULT_ID), false);
  assert.equal(serialized.includes(DOC_ID), false);
  assert.equal(serialized.includes(MIGRATION_ID), false);

  t.mock.restoreAll();
});

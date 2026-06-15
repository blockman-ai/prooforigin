import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "node:module";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const VAULT_ID = "44444444-4444-4444-8444-444444444444";
const DOC_ID = "11111111-1111-4111-8111-111111111111";

function request() {
  return new Request("http://localhost/api/vault/custody-intelligence", {
    method: "GET",
  });
}

test("custody intelligence route enforces auth and returns sanitized intelligence", async (t) => {
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
            verified: false,
            created_at: "2026-03-14T00:00:00.000Z",
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
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ],
        error: null,
      }),
      listVaultCustodyMigrations: async () => ({
        migrations: [
          {
            vault_id: VAULT_ID,
            state: "completed",
            created_at: "2026-03-01T00:00:00.000Z",
            updated_at: "2026-03-01T00:00:00.000Z",
            metadata: { staging_cleanup_state: "pending" },
          },
        ],
        error: null,
      }),
      listVaultCustodyDocumentStateEvents: async () => ({
        events: [],
        error: null,
      }),
      listVaultCustodyOwnershipVerifications: async () => ({
        verifications: [],
        error: null,
      }),
    },
  });

  const { GET } = await import("../../app/api/vault/custody-intelligence/route.js");

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
  assert.equal(json.sentinel_version, 1);
  assert.equal(json.health?.score >= 0, true);
  assert.equal(json.signals?.cleanup_hygiene?.score < 100, true);
  assert.equal(json.anomalies.some((anomaly) => anomaly.kind === "cleanup.backlog"), true);

  const serialized = JSON.stringify(json);
  assert.equal(serialized.includes("ciphertext"), false);
  assert.equal(serialized.includes("storage_path"), false);
  assert.equal(serialized.includes("sha256"), false);
  assert.equal(serialized.includes("hash"), false);
  assert.equal(serialized.includes("secret"), false);
  assert.equal(serialized.includes(VAULT_ID), false);
  assert.equal(serialized.includes(DOC_ID), false);

  t.mock.restoreAll();
});

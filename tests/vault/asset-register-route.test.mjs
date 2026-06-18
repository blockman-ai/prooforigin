import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "node:module";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const VAULT_REF = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const DEVICE_REF = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const VAULT_ID = "44444444-4444-4444-8444-444444444444";

test("asset register route creates registry record with custody event", async (t) => {
  let registerPayload = null;

  mock.module("../../app/lib/vaultDisclosureAuthority.js", {
    exports: {
      authorizeDisclosureOwnerRequest: async () => ({
        ok: true,
        vaultRefHash: VAULT_REF,
        deviceRefHash: DEVICE_REF,
        registration: { vault_id: VAULT_ID },
      }),
    },
  });

  mock.module("../../app/lib/vaultAdmin.js", {
    exports: {
      getVaultDocumentById: async () => ({ document: null, error: null }),
    },
  });

  mock.module("../../app/lib/assetRegistryStore.js", {
    exports: {
      registerAssetRecord: async (payload) => {
        registerPayload = payload;
        return {
          asset: {
            asset_id: "11111111-1111-4111-8111-111111111111",
            asset_type: "psa_card",
            asset_status: "registered",
            display_name: "2021 PSA 10 Charizard",
            public_summary: "Registered collectible card",
            asset_fingerprint: "c".repeat(64),
            provenance_record_hash: "d".repeat(64),
            verification_slug: "verify-slug",
            verification_url: "http://localhost/verify/asset/verify-slug",
            visibility: "verification_public",
            created_at: "2026-06-18T12:00:00.000Z",
            updated_at: "2026-06-18T12:00:00.000Z",
            retired_at: null,
          },
          provenance: {
            provenance_record_id: "22222222-2222-4222-8222-222222222222",
            provenance_record_hash: "d".repeat(64),
            evidence_bundle_hash: "e".repeat(64),
            owner_claim_hash: "f".repeat(64),
            created_at: "2026-06-18T12:00:00.000Z",
          },
          event: {
            event_id: "33333333-3333-4333-8333-333333333333",
            event_type: "registered",
            event_result: "success",
            actor_type: "owner",
            event_hash: "1".repeat(64),
            previous_event_hash: "0".repeat(64),
            created_at: "2026-06-18T12:00:00.000Z",
          },
          error: null,
        };
      },
    },
  });

  const { POST } = await import("../../app/api/assets/register/route.js");
  const response = await POST(
    new Request("http://localhost/api/assets/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asset_type: "psa_card",
        display_name: "2021 PSA 10 Charizard",
        public_summary: "Registered collectible card",
        serial_or_cert_hash: "a".repeat(64),
      }),
    })
  );

  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.success, true);
  assert.equal(json.asset.asset_type, "psa_card");
  assert.equal(json.asset.asset_fingerprint.length, 64);
  assert.equal(json.provenance_record.provenance_record_hash.length, 64);
  assert.equal(json.custody_event.event_type, "registered");
  assert.equal(registerPayload.vaultRefHash, VAULT_REF);
  assert.equal(registerPayload.deviceRefHash, DEVICE_REF);

  t.mock.restoreAll();
});

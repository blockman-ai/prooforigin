import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "node:module";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

test("public asset verify route scenarios", async (t) => {
  const state = {
    visibility: "verification_public",
  };

  mock.module("../../app/lib/assetRegistryStore.js", {
    exports: {
      getAssetRecordByVerificationSlug: async () => ({
        asset: {
          asset_id: "11111111-1111-4111-8111-111111111111",
          asset_type: "document",
          asset_status: "registered",
          display_name: "Contract",
          public_summary: "Registered document asset",
          asset_fingerprint: "a".repeat(64),
          provenance_record_hash: "b".repeat(64),
          verification_slug: "verify-slug",
          verification_url: "http://localhost/verify/asset/verify-slug",
          visibility: state.visibility,
          created_at: "2026-06-18T12:00:00.000Z",
          retired_at: null,
        },
        provenance: {
          provenance_record_hash: "b".repeat(64),
          evidence_bundle_hash: "c".repeat(64),
          created_at: "2026-06-18T12:00:00.000Z",
          public_claims: { display_name: "Contract" },
        },
        error: null,
      }),
      listAssetCustodyEvents: async () => ({
        events: [
          {
            event_id: "22222222-2222-4222-8222-222222222222",
            event_type: "registered",
            event_result: "success",
            actor_type: "owner",
            event_hash: "d".repeat(64),
            previous_event_hash: "0".repeat(64),
            created_at: "2026-06-18T12:00:00.000Z",
          },
        ],
        error: null,
      }),
    },
  });

  mock.module("../../app/lib/assetTransferStore.js", {
    exports: {
      listOwnershipClaimsForAsset: async () => ({ claims: [], error: null }),
    },
  });

  const { GET } = await import("../../app/api/assets/verify/[verification_slug]/route.js");

  state.visibility = "verification_public";
  const publicResponse = await GET(
    new Request("http://localhost/api/assets/verify/verify-slug"),
    { params: { verification_slug: "verify-slug" } }
  );
  assert.equal(publicResponse.status, 200);
  const publicJson = await publicResponse.json();
  assert.equal(publicJson.success, true);
  assert.equal(publicJson.asset.asset_fingerprint, "a".repeat(64));
  assert.equal(publicJson.custody_timeline.length, 1);

  state.visibility = "private";
  const privateResponse = await GET(
    new Request("http://localhost/api/assets/verify/private-slug"),
    { params: { verification_slug: "private-slug" } }
  );
  assert.equal(privateResponse.status, 404);

  t.mock.restoreAll();
});

import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "node:module";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const VAULT_REF = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const DEVICE_REF = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const ASSET_ID = "11111111-1111-4111-8111-111111111111";

const state = {
  asset: {
    asset_id: ASSET_ID,
    vault_ref_hash: VAULT_REF,
    provenance_record_hash: "d".repeat(64),
    retired_at: null,
  },
  pending: null,
  offerError: null,
};

mock.module("../../app/lib/vaultDisclosureAuthority.js", {
  exports: {
    authorizeDisclosureOwnerRequest: async () => ({
      ok: true,
      vaultRefHash: VAULT_REF,
      deviceRefHash: DEVICE_REF,
      registration: { vault_id: "44444444-4444-4444-8444-444444444444" },
      auth: { vault_device_id: "device-1" },
    }),
  },
});

mock.module("../../app/lib/assetRegistryStore.js", {
  exports: {
    getAssetRecordByIdForVault: async () => ({ asset: state.asset, error: null }),
  },
});

mock.module("../../app/lib/assetTransferStore.js", {
  exports: {
    getPendingTransferForAsset: async () => ({ transfer: state.pending, error: null }),
    createAssetTransferOffer: async (args) => {
      if (state.offerError) {
        return { transfer: null, event: null, error: state.offerError };
      }
      return {
        transfer: {
          transfer_id: "22222222-2222-4222-8222-222222222222",
          asset_id: ASSET_ID,
          status: "pending",
          transfer_terms: args.transferTerms,
          transfer_terms_hash: args.transferTermsHash,
          expires_at: args.expiresAt,
          created_at: "2026-06-18T12:00:00.000Z",
          updated_at: "2026-06-18T12:00:00.000Z",
        },
        event: { event_type: "transfer_initiated" },
        error: null,
      };
    },
    listOwnershipClaimsForAsset: async () => ({ claims: [], error: null }),
    listTransfersForAsset: async () => ({ transfers: [], error: null }),
  },
});

const { POST } = await import("../../app/api/assets/[asset_id]/transfer/route.js");

test("transfer offer route creates a pending transfer and returns a one-time handle", async () => {
  state.pending = null;
  state.offerError = null;

  const response = await POST(
    new Request(`http://localhost/api/assets/${ASSET_ID}/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient_challenge: "x".repeat(20) }),
    }),
    { params: { asset_id: ASSET_ID } }
  );

  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.success, true);
  assert.equal(json.transfer.status, "pending");
  assert.ok(json.transfer_handle && json.transfer_handle.length > 10);
  assert.equal(json.transfer.transfer_handle, json.transfer_handle);
});

test("transfer offer route rejects when a pending transfer already exists", async () => {
  state.pending = { transfer_id: "existing", status: "pending" };

  const response = await POST(
    new Request(`http://localhost/api/assets/${ASSET_ID}/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient_challenge: "x".repeat(20) }),
    }),
    { params: { asset_id: ASSET_ID } }
  );

  assert.equal(response.status, 409);
  const json = await response.json();
  assert.equal(json.code, "TRANSFER_ALREADY_PENDING");
});

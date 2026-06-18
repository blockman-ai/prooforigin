import assert from "node:assert/strict";
import { test } from "node:test";
import { register } from "node:module";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const { acceptAssetTransfer } = await import("../../app/lib/assetTransferStore.js");

const ASSET_ID = "33333333-3333-4333-8333-333333333333";
const TRANSFER_ID = "22222222-2222-4222-8222-222222222222";
const PREV_CLAIM_ID = "11111111-1111-4111-8111-111111111111";
const FROM = "a".repeat(64);
const TO = "b".repeat(64);
const TO_DEVICE = "c".repeat(64);

function currentClaim(overrides = {}) {
  return {
    claim_id: PREV_CLAIM_ID,
    asset_id: ASSET_ID,
    claim_version: 1,
    claimant_vault_ref_hash: FROM,
    claim_source: "registration",
    transfer_ref: null,
    previous_claim_id: null,
    status: "current",
    claim_hash: "9".repeat(64),
    created_at: "2026-06-18T11:00:00.000Z",
    ...overrides,
  };
}

// Minimal chainable fake supabase client. Routes terminal reads by table name and
// delegates rpc to a per-test handler.
function makeClient({ claim, latestEvent = null, rpc }) {
  function builder(table) {
    const b = {
      select: () => b,
      eq: () => b,
      order: () => b,
      limit: () => b,
      maybeSingle: async () => {
        if (table === "asset_ownership_claims") return { data: claim, error: null };
        if (table === "asset_custody_events") return { data: latestEvent, error: null };
        return { data: null, error: null };
      },
      single: async () => ({ data: null, error: null }),
    };
    return b;
  }
  return { from: builder, rpc };
}

function successRpc(captured) {
  return async (name, params) => {
    captured.name = name;
    captured.params = params;
    return {
      data: {
        transfer: {
          transfer_id: TRANSFER_ID,
          asset_id: ASSET_ID,
          status: "accepted",
          transfer_terms: "custody_and_ownership",
          from_vault_ref_hash: FROM,
          to_vault_ref_hash: params.p_to_vault_ref_hash,
          transfer_receipt_id: params.p_receipt_id,
          transfer_receipt_hash: params.p_receipt_hash,
          accepted_at: params.p_accepted_at,
        },
        claim: {
          claim_id: params.p_new_claim_id,
          asset_id: ASSET_ID,
          claim_version: params.p_new_claim_version,
          claimant_vault_ref_hash: params.p_to_vault_ref_hash,
          claim_source: "transfer_accept",
          status: "current",
          claim_hash: params.p_new_claim_hash,
          created_at: params.p_accepted_at,
        },
        previous_claim: currentClaim({ status: "superseded" }),
        event: {
          event_id: "ev-1",
          event_type: "transfer_accepted",
          event_hash: params.p_event_hash,
          created_at: params.p_accepted_at,
        },
      },
      error: null,
    };
  };
}

const baseArgs = {
  transfer: {
    transfer_id: TRANSFER_ID,
    asset_id: ASSET_ID,
    from_vault_ref_hash: FROM,
    transfer_terms: "custody_and_ownership",
    transfer_terms_hash: "t".repeat(64),
  },
  asset: {
    asset_id: ASSET_ID,
    vault_ref_hash: FROM,
    provenance_record_hash: "p".repeat(64),
    created_at: "2026-06-18T11:00:00.000Z",
  },
  toVaultRefHash: TO,
  toDeviceRefHash: TO_DEVICE,
  acceptanceSignatureHash: "5".repeat(64),
  acceptedAt: "2026-06-18T12:30:00.000Z",
};

test("atomic accept reassigns custody so asset owner equals the single new current claim", async () => {
  const captured = {};
  const client = makeClient({ claim: currentClaim(), rpc: successRpc(captured) });

  const result = await acceptAssetTransfer(baseArgs, { supabase: client });

  assert.equal(result.error, null);
  assert.equal(result.transfer.status, "accepted");
  assert.equal(result.claim.status, "current");
  assert.equal(result.claim.claimant_vault_ref_hash, TO);
  // Asset owner (transfer to_vault) equals the new current claim claimant.
  assert.equal(result.transfer.to_vault_ref_hash, result.claim.claimant_vault_ref_hash);

  // The RPC received a consistent, single-source-of-truth handoff payload.
  assert.equal(captured.name, "asset_transfer_accept_atomic");
  assert.equal(captured.params.p_from_vault_ref_hash, FROM);
  assert.equal(captured.params.p_to_vault_ref_hash, TO);
  assert.equal(captured.params.p_previous_claim_id, PREV_CLAIM_ID);
  assert.equal(captured.params.p_new_claim_version, 2);
  assert.equal(captured.params.p_asset_status, "custody_transfer");
  assert.equal(captured.params.p_claim_source, "transfer_accept");
});

test("accept rejects when the current claim owner no longer matches the offer source", async () => {
  let rpcCalled = false;
  const client = makeClient({
    claim: currentClaim({ claimant_vault_ref_hash: "9".repeat(64) }),
    rpc: async () => {
      rpcCalled = true;
      return { data: null, error: null };
    },
  });

  const result = await acceptAssetTransfer(baseArgs, { supabase: client });
  assert.equal(result.error.code, "SOURCE_OWNERSHIP_MISMATCH");
  assert.equal(rpcCalled, false, "RPC must not run when the source assertion fails");
});

test("accept rejects when the registered asset owner no longer matches the offer source", async () => {
  let rpcCalled = false;
  const client = makeClient({
    claim: currentClaim(),
    rpc: async () => {
      rpcCalled = true;
      return { data: null, error: null };
    },
  });

  const result = await acceptAssetTransfer(
    { ...baseArgs, asset: { ...baseArgs.asset, vault_ref_hash: "9".repeat(64) } },
    { supabase: client }
  );
  assert.equal(result.error.code, "SOURCE_OWNERSHIP_MISMATCH");
  assert.equal(rpcCalled, false);
});

test("accept maps an RPC source mismatch to SOURCE_OWNERSHIP_MISMATCH", async () => {
  const client = makeClient({
    claim: currentClaim(),
    rpc: async () => ({ data: null, error: { message: "source_claim_mismatch" } }),
  });
  const result = await acceptAssetTransfer(baseArgs, { supabase: client });
  assert.equal(result.error.code, "SOURCE_OWNERSHIP_MISMATCH");
  assert.equal(result.transfer, undefined);
});

test("accept maps an RPC not-pending error and returns no partial success", async () => {
  const client = makeClient({
    claim: currentClaim(),
    rpc: async () => ({ data: null, error: { message: "transfer_not_pending" } }),
  });
  const result = await acceptAssetTransfer(baseArgs, { supabase: client });
  assert.equal(result.error.code, "TRANSFER_NOT_PENDING");
  assert.equal(result.transfer, undefined);
  assert.equal(result.claim, undefined);
});

test("accept surfaces an atomic failure with no partial state (all-or-nothing)", async () => {
  // A mid-function DB failure rolls back entirely inside the RPC; the caller sees only
  // an error, never a partial transfer/claim result.
  const client = makeClient({
    claim: currentClaim(),
    rpc: async () => ({
      data: null,
      error: { message: 'new row violates check constraint "x"' },
    }),
  });
  const result = await acceptAssetTransfer(baseArgs, { supabase: client });
  assert.ok(result.error);
  assert.equal(result.transfer, undefined);
  assert.equal(result.claim, undefined);
});

test("accept retries on event_chain_desync then succeeds", async () => {
  let calls = 0;
  const captured = {};
  const ok = successRpc(captured);
  const client = makeClient({
    claim: currentClaim(),
    rpc: async (name, params) => {
      calls += 1;
      if (calls === 1) {
        return { data: null, error: { message: "event_chain_desync" } };
      }
      return ok(name, params);
    },
  });

  const result = await acceptAssetTransfer(baseArgs, { supabase: client });
  assert.equal(result.error, null);
  assert.equal(result.transfer.status, "accepted");
  assert.ok(calls >= 2);
});

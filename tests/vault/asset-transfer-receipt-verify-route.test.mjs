import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "node:module";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const { buildTransferReceiptRecord } = await import("../../app/lib/assetTransfer.js");

const RECEIPT_ID = "66666666-6666-4666-8666-666666666666";

const receipt = buildTransferReceiptRecord({
  receiptId: RECEIPT_ID,
  transferId: "22222222-2222-4222-8222-222222222222",
  assetId: "33333333-3333-4333-8333-333333333333",
  fromVaultRefHash: "a".repeat(64),
  toVaultRefHash: "b".repeat(64),
  transferTermsHash: "d".repeat(64),
  previousClaimId: "11111111-1111-4111-8111-111111111111",
  newClaimId: "99999999-9999-4999-8999-999999999999",
  custodyEventHash: "e".repeat(64),
  provenanceRecordHash: "f".repeat(64),
  createdAt: "2026-06-18T12:30:00.000Z",
});

const state = {
  transfer: {
    transfer_receipt_id: RECEIPT_ID,
    transfer_id: receipt.transfer_id,
    asset_id: receipt.asset_id,
    from_vault_ref_hash: receipt.from_vault_ref_hash,
    to_vault_ref_hash: receipt.to_vault_ref_hash,
    transfer_terms_hash: receipt.transfer_terms_hash,
    previous_claim_id: receipt.previous_claim_id,
    new_claim_id: receipt.new_claim_id,
    custody_event_hash: receipt.custody_event_hash,
    provenance_record_hash: receipt.provenance_record_hash,
    transfer_receipt_hash: receipt.receipt_hash,
    accepted_at: receipt.created_at,
  },
};

mock.module("../../app/lib/assetTransferStore.js", {
  exports: {
    getTransferRecordByReceiptId: async () => ({ transfer: state.transfer, error: null }),
  },
});

const { POST } = await import("../../app/api/assets/transfers/receipt/verify/route.js");

function verifyRequest(receiptHash) {
  return new Request("http://localhost/api/assets/transfers/receipt/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ receipt_id: RECEIPT_ID, receipt_hash: receiptHash }),
  });
}

test("transfer receipt verify confirms an authentic receipt", async () => {
  const response = await POST(verifyRequest(receipt.receipt_hash));
  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.ok, true);
  assert.equal(json.verified, true);
  assert.equal(json.status, "verified");
});

test("transfer receipt verify denies a wrong hash", async () => {
  const response = await POST(verifyRequest("0".repeat(64)));
  const json = await response.json();
  assert.equal(json.verified, false);
  assert.equal(json.status, "unavailable");
});

test("transfer receipt verify flags tampered stored fields", async () => {
  const original = state.transfer.to_vault_ref_hash;
  state.transfer = { ...state.transfer, to_vault_ref_hash: "7".repeat(64) };
  const response = await POST(verifyRequest(receipt.receipt_hash));
  const json = await response.json();
  assert.equal(json.verified, false);
  assert.equal(json.status, "integrity_failed");
  state.transfer = { ...state.transfer, to_vault_ref_hash: original };
});

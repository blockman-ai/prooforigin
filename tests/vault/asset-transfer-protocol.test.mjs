import assert from "node:assert/strict";
import { test } from "node:test";
import { register } from "node:module";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const {
  ASSET_TRANSFER_STATES,
  ASSET_TRANSFER_TERMS_CUSTODY_AND_OWNERSHIP,
  ASSET_OWNERSHIP_CLAIM_SOURCE_REGISTRATION,
  ASSET_OWNERSHIP_CLAIM_SOURCE_TRANSFER_ACCEPT,
  ASSET_OWNERSHIP_CLAIM_STATUS_CURRENT,
  ASSET_OWNERSHIP_CLAIM_STATUS_SUPERSEDED,
  buildTransferReceiptRecord,
  computeOwnershipClaimHash,
  computeTransferTermsHash,
  serializePublicOwnershipChain,
  validateCreateTransferInput,
  verifyTransferReceipt,
} = await import("../../app/lib/assetTransfer.js");

test("transfer states are exactly the five locked states", () => {
  assert.deepEqual(
    [...ASSET_TRANSFER_STATES].sort(),
    ["accepted", "declined", "expired", "pending", "revoked"]
  );
});

test("transfer term and claim hashing are deterministic", () => {
  const a = computeTransferTermsHash({ transferTerms: "custody_and_ownership" });
  const b = computeTransferTermsHash({ transferTerms: "custody_and_ownership" });
  assert.equal(a, b);
  assert.equal(a.length, 64);

  const claimA = computeOwnershipClaimHash({
    assetId: "asset-1",
    claimVersion: 2,
    claimantVaultRefHash: "b".repeat(64),
    claimSource: ASSET_OWNERSHIP_CLAIM_SOURCE_TRANSFER_ACCEPT,
    transferRef: "transfer-1",
    previousClaimId: "claim-1",
    createdAt: "2026-06-18T12:00:00.000Z",
  });
  const claimB = computeOwnershipClaimHash({
    assetId: "asset-1",
    claimVersion: 2,
    claimantVaultRefHash: "b".repeat(64),
    claimSource: ASSET_OWNERSHIP_CLAIM_SOURCE_TRANSFER_ACCEPT,
    transferRef: "transfer-1",
    previousClaimId: "claim-1",
    createdAt: "2026-06-18T12:00:00.000Z",
  });
  assert.equal(claimA, claimB);
  assert.equal(claimA.length, 64);
});

test("validateCreateTransferInput enforces challenge and terms", () => {
  const valid = validateCreateTransferInput(
    JSON.stringify({ recipient_challenge: "x".repeat(20) })
  );
  assert.equal(valid.transferTerms, ASSET_TRANSFER_TERMS_CUSTODY_AND_OWNERSHIP);
  assert.ok(valid.expiresAt);

  assert.throws(() => validateCreateTransferInput(JSON.stringify({})), /recipient_challenge/);
  assert.throws(
    () => validateCreateTransferInput(JSON.stringify({ recipient_challenge: "short" })),
    /16 to 256/
  );
  assert.throws(
    () =>
      validateCreateTransferInput(
        JSON.stringify({ recipient_challenge: "x".repeat(20), transfer_terms: "bogus" })
      ),
    /transfer_terms/
  );
});

test("transfer receipt verifies and rejects tampering", () => {
  const receipt = buildTransferReceiptRecord({
    receiptId: "11111111-1111-4111-8111-111111111111",
    transferId: "22222222-2222-4222-8222-222222222222",
    assetId: "33333333-3333-4333-8333-333333333333",
    fromVaultRefHash: "a".repeat(64),
    toVaultRefHash: "b".repeat(64),
    transferTermsHash: "c".repeat(64),
    previousClaimId: "claim-1",
    newClaimId: "claim-2",
    custodyEventHash: "d".repeat(64),
    provenanceRecordHash: "e".repeat(64),
    createdAt: "2026-06-18T12:00:00.000Z",
  });

  assert.equal(receipt.receipt_hash.length, 64);

  const ok = verifyTransferReceipt({ receipt, submittedReceiptHash: receipt.receipt_hash });
  assert.equal(ok.kind, "verified");
  assert.equal(ok.verified, true);

  const wrongHash = verifyTransferReceipt({
    receipt,
    submittedReceiptHash: "f".repeat(64),
  });
  assert.equal(wrongHash.kind, "denied");

  const tampered = { ...receipt, to_vault_ref_hash: "9".repeat(64) };
  const integrity = verifyTransferReceipt({
    receipt: tampered,
    submittedReceiptHash: receipt.receipt_hash,
  });
  assert.equal(integrity.kind, "integrity_failed");
  assert.equal(integrity.verified, false);
});

test("serializePublicOwnershipChain renders ordered owners without identities", () => {
  const chain = serializePublicOwnershipChain([
    {
      claim_version: 2,
      claimant_vault_ref_hash: "b".repeat(64),
      claim_source: ASSET_OWNERSHIP_CLAIM_SOURCE_TRANSFER_ACCEPT,
      status: ASSET_OWNERSHIP_CLAIM_STATUS_CURRENT,
      created_at: "2026-06-18T13:00:00.000Z",
    },
    {
      claim_version: 1,
      claimant_vault_ref_hash: "a".repeat(64),
      claim_source: ASSET_OWNERSHIP_CLAIM_SOURCE_REGISTRATION,
      status: ASSET_OWNERSHIP_CLAIM_STATUS_SUPERSEDED,
      created_at: "2026-06-18T12:00:00.000Z",
    },
  ]);

  assert.equal(chain.length, 2);
  assert.equal(chain[0].owner_label, "Owner 1");
  assert.equal(chain[0].verified_transfer, false);
  assert.equal(chain[1].owner_label, "Owner 2");
  assert.equal(chain[1].verified_transfer, true);
  assert.equal(chain[1].is_current, true);
  const currentCount = chain.filter((entry) => entry.is_current).length;
  assert.equal(currentCount, 1);
  assert.ok(!chain[0].owner_ref.includes("a".repeat(64)));
});

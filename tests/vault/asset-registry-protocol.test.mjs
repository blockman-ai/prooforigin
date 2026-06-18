import assert from "node:assert/strict";
import { test } from "node:test";
import { register } from "node:module";
import {
  ASSET_TYPES,
  ASSET_TYPE_PSA_CARD,
  buildAssetProvenanceRecord,
  computeAssetFingerprint,
  computeEvidenceBundleHash,
  validateRegisterAssetInput,
} from "../../app/lib/assetRegistry.js";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

test("asset registry protocol validates PSA card registration input", () => {
  const input = validateRegisterAssetInput(
    JSON.stringify({
      asset_type: "psa_card",
      display_name: "2021 PSA 10 Charizard",
      public_summary: "Registered collectible card",
      serial_or_cert_hash: "a".repeat(64),
    })
  );

  assert.equal(input.assetType, ASSET_TYPE_PSA_CARD);
  assert.equal(input.displayName, "2021 PSA 10 Charizard");
  assert.equal(input.serialOrCertHash, "a".repeat(64));
});

test("asset registry protocol rejects physical asset without evidence hash", () => {
  assert.throws(
    () =>
      validateRegisterAssetInput(
        JSON.stringify({
          asset_type: "psa_card",
          display_name: "Missing evidence",
        })
      ),
    /require at least one evidence hash/
  );
});

test("asset registry protocol computes stable fingerprint", () => {
  const createdAt = "2026-06-18T12:00:00.000Z";
  const assetId = "11111111-1111-4111-8111-111111111111";
  const vaultRefHash = "a".repeat(64);
  const deviceRefHash = "b".repeat(64);
  const verificationSlug = "slug-123";
  const evidenceBundleHash = computeEvidenceBundleHash({
    serialOrCertHash: "c".repeat(64),
  });
  const provenance = buildAssetProvenanceRecord({
    assetId,
    assetType: ASSET_TYPE_PSA_CARD,
    vaultRefHash,
    createdByDeviceRef: deviceRefHash,
    evidenceBundleHash,
    ownerClaimHash: "d".repeat(64),
    publicClaims: { display_name: "Card" },
    createdAt,
  });
  const fingerprint = computeAssetFingerprint({
    assetId,
    assetType: ASSET_TYPE_PSA_CARD,
    vaultRefHash,
    createdByDeviceRef: deviceRefHash,
    provenanceRecordHash: provenance.provenance_record_hash,
    evidenceBundleHash,
    verificationSlug,
    visibility: "verification_public",
    createdAt,
  });

  assert.equal(fingerprint.length, 64);
  assert.equal(provenance.provenance_record_hash.length, 64);
  assert.equal(ASSET_TYPES.includes(ASSET_TYPE_PSA_CARD), true);
});

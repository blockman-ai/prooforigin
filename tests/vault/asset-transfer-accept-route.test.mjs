import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mock, test } from "node:test";
import { register } from "node:module";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const { buildTransferRecipientBindingHash } = await import("../../app/lib/assetTransfer.js");

const FROM_VAULT_REF = "a".repeat(64);
const TO_VAULT_REF = "b".repeat(64);
const TO_DEVICE_REF = "c".repeat(64);
const RECIPIENT_CHALLENGE = "recipient-secret-12345";
const CHALLENGE_ID = "55555555-5555-4555-8555-555555555555";
const CHALLENGE_NONCE = "nonce-abc";
const B_VAULT_ID = "44444444-4444-4444-8444-444444444444";
const B_DEVICE_ID = "device-b";

const nonceHash = crypto.createHash("sha256").update(CHALLENGE_NONCE).digest("hex");

const state = {
  transfer: null,
  verification: null,
  ownershipKey: { id: "key-1", public_key_jwk: {}, algorithm: "ECDSA-P256-SHA256" },
  signatureValid: true,
  consumeError: null,
  acceptResult: null,
  authVaultRef: TO_VAULT_REF,
};

function freshTransfer() {
  return {
    transfer_id: "22222222-2222-4222-8222-222222222222",
    asset_id: "33333333-3333-4333-8333-333333333333",
    status: "pending",
    transfer_terms: "custody_and_ownership",
    transfer_terms_hash: "d".repeat(64),
    from_vault_ref_hash: FROM_VAULT_REF,
    recipient_binding_hash: buildTransferRecipientBindingHash(RECIPIENT_CHALLENGE),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
}

function freshVerification() {
  return {
    id: "verif-1",
    status: "pending",
    consumed_at: null,
    challenge_type: "asset_transfer_accept",
    vault_id: B_VAULT_ID,
    vault_device_id: B_DEVICE_ID,
    challenge_nonce_hash: nonceHash,
    issued_at: "2026-06-18T12:00:00.000Z",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
}

mock.module("../../app/lib/vaultDisclosureAuthority.js", {
  exports: {
    authorizeDisclosureOwnerRequest: async () => ({
      ok: true,
      vaultRefHash: state.authVaultRef,
      deviceRefHash: TO_DEVICE_REF,
      registration: { vault_id: B_VAULT_ID },
      auth: { vault_device_id: B_DEVICE_ID },
    }),
  },
});

mock.module("../../app/lib/vaultAdmin.js", {
  exports: {
    getVaultOwnershipVerificationChallengeById: async () => ({
      verification: state.verification,
      error: null,
    }),
    getVaultOwnershipKey: async () => ({ ownershipKey: state.ownershipKey, error: null }),
    verifyVaultOwnershipChallenge: async () => ({
      verification: state.consumeError ? null : { id: "verif-1" },
      error: state.consumeError,
    }),
    VAULT_OWNERSHIP_KEY_ALGORITHM: "ECDSA-P256-SHA256",
  },
});

mock.module("../../app/lib/vaultOwnershipVerification.js", {
  exports: {
    buildVaultOwnershipChallengeMessage: () => "challenge-message",
    verifyOwnershipSignature: async () => state.signatureValid,
    VAULT_OWNERSHIP_CHALLENGE_TYPE_ASSET_TRANSFER_ACCEPT: "asset_transfer_accept",
  },
});

mock.module("../../app/lib/assetRegistryStore.js", {
  exports: {
    getAssetRecordById: async () => ({
      asset: {
        asset_id: "33333333-3333-4333-8333-333333333333",
        provenance_record_hash: "e".repeat(64),
        vault_ref_hash: FROM_VAULT_REF,
        created_at: "2026-06-18T11:00:00.000Z",
      },
      error: null,
    }),
  },
});

mock.module("../../app/lib/assetTransferStore.js", {
  exports: {
    getTransferRecordByHandleHash: async () => ({ transfer: state.transfer, error: null }),
    acceptAssetTransfer: async () =>
      state.acceptResult || {
        transfer: {
          transfer_id: "22222222-2222-4222-8222-222222222222",
          asset_id: "33333333-3333-4333-8333-333333333333",
          status: "accepted",
          transfer_terms: "custody_and_ownership",
          transfer_receipt_id: "66666666-6666-4666-8666-666666666666",
          transfer_receipt_hash: "f".repeat(64),
          accepted_at: "2026-06-18T12:30:00.000Z",
        },
        event: { event_type: "transfer_accepted", event_hash: "1".repeat(64), created_at: "x" },
        error: null,
      },
  },
});

const { POST } = await import("../../app/api/assets/transfers/[handle]/accept/route.js");

function acceptRequest() {
  return new Request("http://localhost/api/assets/transfers/handle-1/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient_challenge: RECIPIENT_CHALLENGE,
      challenge_id: CHALLENGE_ID,
      challenge_nonce: CHALLENGE_NONCE,
      signature: "c2ln",
      challenge: { version: "v1" },
    }),
  });
}

function resetState() {
  state.transfer = freshTransfer();
  state.verification = freshVerification();
  state.ownershipKey = { id: "key-1", public_key_jwk: {}, algorithm: "ECDSA-P256-SHA256" };
  state.signatureValid = true;
  state.consumeError = null;
  state.acceptResult = null;
  state.authVaultRef = TO_VAULT_REF;
}

test("accept route completes a verified two-party transfer", async () => {
  resetState();
  const response = await POST(acceptRequest(), { params: { handle: "handle-1" } });
  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.success, true);
  assert.equal(json.status, "accepted");
  assert.equal(json.transfer.status, "accepted");
  assert.equal(json.transfer_receipt.receipt_id, "66666666-6666-4666-8666-666666666666");
});

test("accept route rejects a replayed (already consumed) challenge", async () => {
  resetState();
  state.verification = { ...freshVerification(), status: "verified", consumed_at: "x" };
  const response = await POST(acceptRequest(), { params: { handle: "handle-1" } });
  assert.equal(response.status, 409);
  const json = await response.json();
  assert.equal(json.code, "CHALLENGE_ALREADY_USED");
});

test("accept route rejects an expired challenge", async () => {
  resetState();
  state.verification = {
    ...freshVerification(),
    expires_at: new Date(Date.now() - 60_000).toISOString(),
  };
  const response = await POST(acceptRequest(), { params: { handle: "handle-1" } });
  assert.equal(response.status, 410);
  const json = await response.json();
  assert.equal(json.code, "CHALLENGE_EXPIRED");
});

test("accept route rejects a recipient binding mismatch", async () => {
  resetState();
  state.transfer = { ...freshTransfer(), recipient_binding_hash: "9".repeat(64) };
  const response = await POST(acceptRequest(), { params: { handle: "handle-1" } });
  assert.equal(response.status, 401);
  const json = await response.json();
  assert.equal(json.code, "RECIPIENT_BINDING_MISMATCH");
});

test("accept route rejects an invalid ownership signature", async () => {
  resetState();
  state.signatureValid = false;
  const response = await POST(acceptRequest(), { params: { handle: "handle-1" } });
  assert.equal(response.status, 401);
  const json = await response.json();
  assert.equal(json.code, "OWNERSHIP_SIGNATURE_INVALID");
});

test("accept route rejects a self-transfer", async () => {
  resetState();
  state.authVaultRef = FROM_VAULT_REF;
  const response = await POST(acceptRequest(), { params: { handle: "handle-1" } });
  assert.equal(response.status, 409);
  const json = await response.json();
  assert.equal(json.code, "SELF_TRANSFER_REJECTED");
});

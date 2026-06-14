import assert from "node:assert/strict";
import { test, mock } from "node:test";

const DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const VAULT_ID = "44444444-4444-4444-8444-444444444444";
const DOC_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_DOC_ID = "22222222-2222-4222-8222-222222222222";
const TARGET_DEVICE_ID = "55555555-5555-4555-8555-555555555555";

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function createSupabaseStub({ onInsert, onUpdate, singleResult, maybeSingleResult, onRpc }) {
  let tableName = null;
  let operation = null;
  let payload = null;
  const filters = [];
  let rpcFn = null;
  let rpcPayload = null;

  const chain = {
    select() {
      return chain;
    },
    single() {
      return Promise.resolve(
        singleResult
          ? singleResult({ tableName, operation, payload, filters, rpcFn, rpcPayload })
          : { data: null, error: null }
      );
    },
    maybeSingle() {
      return Promise.resolve(
        maybeSingleResult
          ? maybeSingleResult({ tableName, operation, payload, filters, rpcFn, rpcPayload })
          : { data: null, error: null }
      );
    },
    eq(column, value) {
      filters.push({ type: "eq", column, value });
      return chain;
    },
    is(column, value) {
      filters.push({ type: "is", column, value });
      return chain;
    },
    not(column, operator, value) {
      filters.push({ type: "not", column, operator, value });
      return chain;
    },
    limit(value) {
      filters.push({ type: "limit", value });
      return chain;
    },
    insert(nextPayload) {
      operation = "insert";
      payload = nextPayload;
      if (onInsert) onInsert({ tableName, payload });
      return chain;
    },
    update(nextPayload) {
      operation = "update";
      payload = nextPayload;
      if (onUpdate) onUpdate({ tableName, payload });
      return chain;
    },
  };

  return {
    from(name) {
      tableName = name;
      operation = "from";
      payload = null;
      filters.length = 0;
      return chain;
    },
    rpc(fnName, args) {
      rpcFn = fnName;
      rpcPayload = args;
      if (onRpc) onRpc({ fnName, args });
      return Promise.resolve({ data: null, error: { code: "42883", message: "function not found" } });
    },
  };
}

test("vault admin persistence helpers pass Phase 2 fields", async (t) => {
  const inserts = [];
  const updates = [];
  const rpcs = [];
  const supabaseStub = createSupabaseStub({
    onInsert({ tableName, payload }) {
      inserts.push({ tableName, payload });
    },
    onUpdate({ tableName, payload }) {
      updates.push({ tableName, payload });
    },
    onRpc(call) {
      rpcs.push(call);
    },
    singleResult: ({ tableName, payload }) => ({
      data: {
        id: "row-1",
        vault_device_id: payload.vault_device_id || DEVICE_ID,
        device_public_id: "vdp_test",
        auth_secret_hash: "a".repeat(64),
        vault_id: hasOwn(payload, "vault_id") ? payload.vault_id : VAULT_ID,
        vault_id_bound_at: hasOwn(payload, "vault_id_bound_at")
          ? payload.vault_id_bound_at
          : "2026-06-14T17:00:00.000Z",
        vault_ownership_proof_metadata: hasOwn(payload, "vault_ownership_proof_metadata")
          ? payload.vault_ownership_proof_metadata
          : {},
        public_key_jwk: payload.public_key_jwk,
        algorithm: payload.algorithm || "ECDSA-P256-SHA256",
        status: hasOwn(payload, "status") ? payload.status : "pending",
        challenge_type: hasOwn(payload, "challenge_type")
          ? payload.challenge_type
          : "migration_authority_verify",
        challenge_id: hasOwn(payload, "challenge_id")
          ? payload.challenge_id
          : "66666666-6666-4666-8666-666666666666",
        challenge_nonce_hash: hasOwn(payload, "challenge_nonce_hash")
          ? payload.challenge_nonce_hash
          : "f".repeat(64),
        issued_at: hasOwn(payload, "issued_at") ? payload.issued_at : "2026-06-14T17:00:00.000Z",
        expires_at: hasOwn(payload, "expires_at")
          ? payload.expires_at
          : "2026-06-14T17:05:00.000Z",
        consumed_at: hasOwn(payload, "consumed_at") ? payload.consumed_at : null,
        verified_at: hasOwn(payload, "verified_at") ? payload.verified_at : null,
        ownership_key_id: hasOwn(payload, "ownership_key_id") ? payload.ownership_key_id : null,
        source_document_id: hasOwn(payload, "source_document_id")
          ? payload.source_document_id
          : DOC_ID,
        target_document_id: hasOwn(payload, "target_document_id")
          ? payload.target_document_id
          : TARGET_DOC_ID,
        source_vault_device_id: hasOwn(payload, "source_vault_device_id")
          ? payload.source_vault_device_id
          : DEVICE_ID,
        target_vault_device_id: hasOwn(payload, "target_vault_device_id")
          ? payload.target_vault_device_id
          : TARGET_DEVICE_ID,
        state: hasOwn(payload, "state") ? payload.state : "pending",
        failure_reason: hasOwn(payload, "failure_reason") ? payload.failure_reason : null,
        source_retirement_state: hasOwn(payload, "source_retirement_state")
          ? payload.source_retirement_state
          : "active",
        upload_started_at: hasOwn(payload, "upload_started_at") ? payload.upload_started_at : null,
        completed_at: hasOwn(payload, "completed_at") ? payload.completed_at : null,
        source_retired_at: hasOwn(payload, "source_retired_at") ? payload.source_retired_at : null,
        created_at: "2026-06-14T17:00:00.000Z",
        last_seen_at: "2026-06-14T17:00:00.000Z",
        revoked_at: null,
        updated_at: "2026-06-14T17:00:00.000Z",
        metadata: payload.metadata || {},
      },
      error: null,
    }),
    maybeSingleResult: ({ tableName, filters, payload }) => {
      if (tableName !== "vault_ownership_verifications") {
        return { data: null, error: null };
      }
      const challengeFilter = (filters || []).find(
        (entry) => entry.type === "eq" && entry.column === "challenge_id"
      );
      const verificationFilter = (filters || []).find(
        (entry) => entry.type === "eq" && entry.column === "id"
      );
      const statusFilter = (filters || []).find(
        (entry) => entry.type === "eq" && entry.column === "status"
      );

      if (challengeFilter || verificationFilter) {
        return {
          data: {
            id: verificationFilter?.value || "row-1",
            challenge_id: challengeFilter?.value || "row-1",
            status: payload?.status || statusFilter?.value || "pending",
            challenge_type: "migration_authority_verify",
            challenge_nonce_hash: "f".repeat(64),
            issued_at: "2026-06-14T17:00:00.000Z",
            expires_at: "2026-06-14T17:05:00.000Z",
            consumed_at: payload?.consumed_at || null,
            verified_at: payload?.verified_at || null,
            ownership_key_id: payload?.ownership_key_id || "row-1",
            vault_id: VAULT_ID,
            vault_device_id: DEVICE_ID,
            created_at: "2026-06-14T17:00:00.000Z",
            metadata: payload?.metadata || {},
          },
          error: null,
        };
      }

      return { data: { id: "row-1" }, error: null };
    },
  });

  mock.module("@supabase/supabase-js", {
    exports: {
      createClient: () => supabaseStub,
    },
  });

  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

  const {
    registerVaultDevice,
    bindVaultDeviceToVault,
    completeVaultDocumentAtomic,
    completeVaultDocument,
    createVaultOwnershipKey,
    createVaultOwnershipVerificationChallenge,
    getVaultOwnershipVerificationChallengeById,
    verifyVaultOwnershipChallenge,
    hasVerifiedVaultOwnershipForDevice,
    createVaultDocumentMigrationRecord,
    VAULT_DOCUMENT_AAD_VERSION_LEGACY,
    VAULT_ALLOWED_AAD_VERSIONS,
  } = await import("../../app/lib/vaultAdmin.js");

  assert.deepEqual(VAULT_ALLOWED_AAD_VERSIONS, [1, 3]);
  assert.equal(VAULT_DOCUMENT_AAD_VERSION_LEGACY, 1);

  const { registration: registrationA, error: registerError } = await registerVaultDevice({
    vaultDeviceId: DEVICE_ID,
    authSecretHash: "a".repeat(64),
    vaultId: VAULT_ID,
    vaultIdBoundAt: "2026-06-14T17:00:00.000Z",
    vaultOwnershipProofMetadata: { proof_version: "v1" },
  });

  assert.equal(registerError, null);
  assert.equal(registrationA?.vault_id, VAULT_ID);

  const { registration: registrationB, error: bindError } = await bindVaultDeviceToVault({
    vaultDeviceId: DEVICE_ID,
    vaultId: VAULT_ID,
    vaultOwnershipProofMetadata: { proof_version: "v1", nonce_id: "nonce-1" },
  });
  assert.equal(bindError, null);
  assert.equal(registrationB?.vault_id, VAULT_ID);
  assert.deepEqual(registrationB?.vault_ownership_proof_metadata, {
    proof_version: "v1",
    nonce_id: "nonce-1",
  });

  const { document: legacyDoc, error: completeError } = await completeVaultDocument({
    vaultDeviceId: DEVICE_ID,
    docId: DOC_ID,
    vaultId: null,
    aadVersion: 1,
    storagePath: `${DEVICE_ID}/${DOC_ID}.enc`,
    ciphertextSha256: "a".repeat(64),
    ciphertextBytes: 128,
    contentTypeHint: "application/pdf",
  });
  assert.equal(completeError, null);
  assert.equal(legacyDoc?.aad_version, 1);
  assert.equal(legacyDoc?.vault_id, null);

  await completeVaultDocumentAtomic({
    vaultDeviceId: DEVICE_ID,
    docId: DOC_ID,
    vaultId: VAULT_ID,
    aadVersion: 1,
    storagePath: `${DEVICE_ID}/${DOC_ID}.enc`,
    ciphertextSha256: "a".repeat(64),
    ciphertextBytes: 128,
    contentTypeHint: "application/pdf",
    encryptionVersion: 2,
    createdAt: "2026-06-14T17:00:00.000Z",
    eventPreviousStateHash: "b".repeat(64),
    eventStateHash: "c".repeat(64),
  });

  const { ownershipKey, error: ownershipError } = await createVaultOwnershipKey({
    vaultId: VAULT_ID,
    publicKeyJwk: { kty: "EC", crv: "P-256", x: "x", y: "y" },
    metadata: { source: "phase2-test" },
  });
  assert.equal(ownershipError, null);
  assert.equal(ownershipKey?.vault_id, VAULT_ID);
  assert.equal(ownershipKey?.algorithm, "ECDSA-P256-SHA256");

  const { verification: challenge, error: challengeError } =
    await createVaultOwnershipVerificationChallenge({
      challengeType: "migration_authority_verify",
      challengeNonceHash: "f".repeat(64),
      issuedAt: "2026-06-14T17:00:00.000Z",
      expiresAt: "2026-06-14T17:05:00.000Z",
      ownershipKeyId: ownershipKey.id,
      vaultId: VAULT_ID,
      vaultDeviceId: DEVICE_ID,
      metadata: { source: "phase5-test" },
    });
  assert.equal(challengeError, null);
  assert.equal(challenge?.status, "pending");
  assert.equal(challenge?.challenge_type, "migration_authority_verify");

  const { verification: loadedChallenge, error: loadedChallengeError } =
    await getVaultOwnershipVerificationChallengeById(challenge.id);
  assert.equal(loadedChallengeError, null);
  assert.equal(loadedChallenge?.challenge_id, challenge.id);

  const { verification: verifiedChallenge, error: verifyChallengeError } =
    await verifyVaultOwnershipChallenge({
      verificationId: challenge.id,
      ownershipKeyId: ownershipKey.id,
      verifiedAt: "2026-06-14T17:01:00.000Z",
      metadata: { signature_verified: true },
    });
  assert.equal(verifyChallengeError, null);
  assert.equal(verifiedChallenge?.status, "verified");
  assert.equal(verifiedChallenge?.verified_at, "2026-06-14T17:01:00.000Z");

  const { verified, error: verifiedLookupError } = await hasVerifiedVaultOwnershipForDevice({
    vaultId: VAULT_ID,
    vaultDeviceId: DEVICE_ID,
  });
  assert.equal(verifiedLookupError, null);
  assert.equal(typeof verified, "boolean");

  const { migration, error: migrationError } = await createVaultDocumentMigrationRecord({
    vaultId: VAULT_ID,
    sourceDocumentId: DOC_ID,
    targetDocumentId: TARGET_DOC_ID,
    sourceVaultDeviceId: DEVICE_ID,
    targetVaultDeviceId: TARGET_DEVICE_ID,
    state: "completed",
    completedAt: "2026-06-14T17:00:00.000Z",
  });
  assert.equal(migrationError, null);
  assert.equal(migration?.state, "completed");
  assert.equal(migration?.source_document_id, DOC_ID.toLowerCase());
  assert.equal(migration?.target_document_id, TARGET_DOC_ID.toLowerCase());

  const deviceInsert = inserts.find((entry) => entry.tableName === "vault_device_registrations");
  assert.ok(deviceInsert);
  assert.equal(deviceInsert.payload.vault_id, VAULT_ID);
  assert.equal(deviceInsert.payload.vault_id_bound_at, "2026-06-14T17:00:00.000Z");
  assert.deepEqual(deviceInsert.payload.vault_ownership_proof_metadata, { proof_version: "v1" });

  const docInsert = inserts.find((entry) => entry.tableName === "vault_documents");
  assert.ok(docInsert);
  assert.equal(docInsert.payload.aad_version, 1);
  assert.equal(docInsert.payload.vault_id, null);

  const ownershipInsert = inserts.find((entry) => entry.tableName === "vault_ownership_keys");
  assert.ok(ownershipInsert);
  assert.equal(ownershipInsert.payload.vault_id, VAULT_ID);

  const verificationInsert = inserts.find(
    (entry) => entry.tableName === "vault_ownership_verifications"
  );
  assert.ok(verificationInsert);
  assert.equal(verificationInsert.payload.vault_id, VAULT_ID);
  assert.equal(verificationInsert.payload.challenge_type, "migration_authority_verify");

  const migrationInsert = inserts.find((entry) => entry.tableName === "vault_document_migrations");
  assert.ok(migrationInsert);
  assert.equal(migrationInsert.payload.state, "completed");

  assert.equal(updates.length > 0, true);
  assert.equal(rpcs.length > 0, true);
  assert.equal(rpcs[0]?.fnName, "vault_complete_document_atomic");
  assert.equal(rpcs[0]?.args?.p_vault_id, VAULT_ID);
  assert.equal(rpcs[0]?.args?.p_aad_version, 1);

  t.mock.restoreAll();
});

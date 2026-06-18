import { ensureVaultGenesis, readVaultGenesis } from "./vaultGenesis.js";
import { getVaultSessionUnlockKeys } from "./vaultSession.js";
import { getVaultDevice } from "./vaultDevice.js";
import { createSignedVaultAuthHeaders } from "./vaultDevice.js";
import {
  clearWrappedVaultOwnershipPrivateJwk,
  computeVaultOwnershipPublicKeyFingerprint,
  exportVaultOwnershipPrivateJwk,
  exportVaultOwnershipPublicJwk,
  generateVaultOwnershipKeyPair,
  importVaultOwnershipPrivateJwk,
  loadWrappedVaultOwnershipPrivateJwk,
  signVaultOwnershipChallenge,
  storeWrappedVaultOwnershipPrivateJwk,
} from "./vaultOwnershipKey.js";
import {
  markVaultRecoveryKitOwnershipKeyBoundary,
  readVaultRecoveryKitConfirmation,
} from "./vaultRecoveryStatus.js";
import { buildVaultOwnershipChallengeMessage, hashOwnershipChallengePayload } from "./vaultOwnershipVerification.js";

const OWNERSHIP_REGISTER_PATH = "/api/vault/ownership/register";
const OWNERSHIP_REGISTER_CHALLENGE_PATH = "/api/vault/ownership/register/challenge";
const OWNERSHIP_CHALLENGE_PATH = "/api/vault/ownership/challenge";
const OWNERSHIP_VERIFY_PATH = "/api/vault/ownership/verify";
const OWNERSHIP_REGISTRATION_DEBUG = process.env.NEXT_PUBLIC_OWNERSHIP_REGISTRATION_DEBUG === "1";

function debugOwnershipRegistration(scope, payload) {
  if (!OWNERSHIP_REGISTRATION_DEBUG) return;
  console.info(`[ownership-registration:${scope}]`, payload);
}
export const VAULT_OWNERSHIP_REGISTRATION_STORAGE_KEY =
  "prooforigin_vault_ownership_registration_v1";
export const VAULT_OWNERSHIP_REGISTRATION_DEFERRED_STORAGE_KEY =
  "prooforigin_vault_ownership_registration_deferred_v1";

function readLocalOwnershipRegistration(vaultId) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(VAULT_OWNERSHIP_REGISTRATION_STORAGE_KEY);
    if (!raw) return null;

    const record = JSON.parse(raw);
    if (record?.vault_id !== vaultId || record?.registered !== true) {
      return null;
    }

    return record;
  } catch {
    return null;
  }
}

function markLocalOwnershipRegistration({ vaultId, publicKeyFingerprint, source }) {
  if (typeof window === "undefined") {
    return null;
  }

  const record = {
    vault_id: vaultId,
    registered: true,
    public_key_fingerprint: publicKeyFingerprint || null,
    source: source || "ownership_registration",
    registered_at: new Date().toISOString(),
  };

  window.localStorage.setItem(VAULT_OWNERSHIP_REGISTRATION_STORAGE_KEY, JSON.stringify(record));
  return record;
}

function readLocalOwnershipRegistrationDeferred(vaultId) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(VAULT_OWNERSHIP_REGISTRATION_DEFERRED_STORAGE_KEY);
    if (!raw) return null;

    const record = JSON.parse(raw);
    if (record?.vault_id !== vaultId || record?.deferred !== true) {
      return null;
    }

    return record;
  } catch {
    return null;
  }
}

function markLocalOwnershipRegistrationDeferred({ vaultId, reason }) {
  if (typeof window === "undefined") {
    return null;
  }

  const record = {
    vault_id: vaultId,
    deferred: true,
    reason: reason || "OWNERSHIP_AUTHORITY_REQUIRED",
    deferred_at: new Date().toISOString(),
  };

  window.localStorage.setItem(
    VAULT_OWNERSHIP_REGISTRATION_DEFERRED_STORAGE_KEY,
    JSON.stringify(record)
  );
  return record;
}

export function clearLocalOwnershipRegistrationMarker() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(VAULT_OWNERSHIP_REGISTRATION_STORAGE_KEY);
}

export function clearVaultOwnershipRegistrationDeferred() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(VAULT_OWNERSHIP_REGISTRATION_DEFERRED_STORAGE_KEY);
}

export function clearOwnershipRegistrationClientState() {
  clearLocalOwnershipRegistrationMarker();
  clearVaultOwnershipRegistrationDeferred();
}

export function getVaultOwnershipRecoveryBoundary() {
  return {
    legacy_kit_support: "identity_restore_only",
    migration_proof_support: "requires_new_recovery_kit_after_ownership_key_registration",
  };
}

export function shouldPromptRecoveryKitRefreshAfterOwnershipKey() {
  const confirmation = readVaultRecoveryKitConfirmation();
  if (!confirmation) {
    return true;
  }

  return confirmation.ownership_key_registered_at !== true;
}

export async function getOrCreateLocalVaultOwnershipMaterial() {
  const genesis = await ensureVaultGenesis();
  const unlockKeys = getVaultSessionUnlockKeys();
  if (!(unlockKeys.masterVaultKey instanceof Uint8Array)) {
    throw new Error("Unlock in MVK mode to prepare vault ownership key material.");
  }

  let existingPrivateJwk = null;
  try {
    existingPrivateJwk = await loadWrappedVaultOwnershipPrivateJwk({
      vaultId: genesis.vault_id,
      masterVaultKey: unlockKeys.masterVaultKey,
    });
  } catch {
    existingPrivateJwk = null;
  }

  if (existingPrivateJwk) {
    const privateKey = await importVaultOwnershipPrivateJwk(existingPrivateJwk);
    const publicJwk = {
      kty: existingPrivateJwk.kty,
      crv: existingPrivateJwk.crv,
      x: existingPrivateJwk.x,
      y: existingPrivateJwk.y,
    };
    const fingerprint = await computeVaultOwnershipPublicKeyFingerprint(publicJwk);
    return {
      vault_id: genesis.vault_id,
      privateKey,
      publicJwk,
      fingerprint,
      created_new_key: false,
    };
  }

  const pair = await generateVaultOwnershipKeyPair();
  const publicJwk = await exportVaultOwnershipPublicJwk(pair.publicKey);
  const privateJwk = await exportVaultOwnershipPrivateJwk(pair.privateKey);
  const fingerprint = await computeVaultOwnershipPublicKeyFingerprint(publicJwk);

  await storeWrappedVaultOwnershipPrivateJwk({
    vaultId: genesis.vault_id,
    privateJwk,
    masterVaultKey: unlockKeys.masterVaultKey,
  });

  return {
    vault_id: genesis.vault_id,
    privateKey: pair.privateKey,
    publicJwk,
    fingerprint,
    created_new_key: true,
  };
}

export async function registerVaultOwnershipKeyWithServer({
  requestOwnershipRegistration,
  requestOwnershipRegisterChallenge,
  skipLocalCache = false,
} = {}) {
  const genesis = await ensureVaultGenesis();
  const device = getVaultDevice();
  if (!device?.vault_device_id) {
    throw new Error("Vault device is not initialized.");
  }

  if (!skipLocalCache) {
    const localRegistration = readLocalOwnershipRegistration(genesis.vault_id);
    if (localRegistration) {
      return {
        success: true,
        vault_id: genesis.vault_id,
        vault_device_id: device.vault_device_id,
        ownership_key_registered: true,
        already_registered: true,
        skipped_network: true,
        needs_recovery_kit_refresh: shouldPromptRecoveryKitRefreshAfterOwnershipKey(),
        private_key_sent_to_server: false,
      };
    }

    const deferredRegistration = readLocalOwnershipRegistrationDeferred(genesis.vault_id);
    if (deferredRegistration) {
      return {
        success: true,
        vault_id: genesis.vault_id,
        vault_device_id: device.vault_device_id,
        ownership_key_registered: false,
        deferred: true,
        skipped_network: true,
        reason: deferredRegistration.reason,
        needs_recovery_kit_refresh: shouldPromptRecoveryKitRefreshAfterOwnershipKey(),
        private_key_sent_to_server: false,
      };
    }
  }

  const ownership = await getOrCreateLocalVaultOwnershipMaterial();

  const requestRegisterChallenge =
    requestOwnershipRegisterChallenge ||
    (async (payload) => {
      const serialized = JSON.stringify(payload);
      const authHeaders = await createSignedVaultAuthHeaders({
        method: "POST",
        path: OWNERSHIP_REGISTER_CHALLENGE_PATH,
        body: serialized,
      });
      const response = await fetch(OWNERSHIP_REGISTER_CHALLENGE_PATH, {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
        },
        body: serialized,
      });
      const data = await response.json().catch(() => ({}));
      return { ok: response.ok, status: response.status, data };
    });

  const challengeResult = await requestRegisterChallenge({ vault_id: genesis.vault_id });
  if (!challengeResult.ok || !challengeResult.data?.success) {
    throw new Error(
      challengeResult.data?.error || "Unable to create ownership registration challenge."
    );
  }

  const challenge = challengeResult.data.challenge;
  const challengeId = String(challengeResult.data.challenge_id || "").trim().toLowerCase();
  if (!challenge || !challengeId) {
    throw new Error("Ownership registration challenge response is incomplete.");
  }

  const message = buildVaultOwnershipChallengeMessage({
    challengeId,
    challengeType: challenge.challenge_type,
    vaultId: challenge.vault_id || genesis.vault_id,
    vaultDeviceId: challenge.vault_device_id || device.vault_device_id,
    challengeNonce: challenge.challenge_nonce,
    issuedAt: challenge.issued_at,
    expiresAt: challenge.expires_at,
    version: challenge.version,
  });
  const signature = await signVaultOwnershipChallenge({
    privateKey: ownership.privateKey,
    challenge: message,
  });

  debugOwnershipRegistration("client-sign", {
    vault_id: genesis.vault_id,
    device_id: device.vault_device_id,
    challenge_id: challengeId,
    challenge_hash: hashOwnershipChallengePayload(message),
    payload_hash: hashOwnershipChallengePayload(message),
    public_key_fingerprint: ownership.fingerprint,
    created_new_key: ownership.created_new_key === true,
  });

  const body = {
    vault_id: genesis.vault_id,
    ownership_public_key_jwk: ownership.publicJwk,
    ownership_key_algorithm: "ECDSA-P256-SHA256",
    challenge_id: challengeId,
    challenge_nonce: challenge.challenge_nonce,
    signature,
    challenge: {
      version: challenge.version,
      action: challenge.challenge_type,
      challenge_type: challenge.challenge_type,
      vault_id: challenge.vault_id,
      vault_device_id: challenge.vault_device_id,
      issued_at: challenge.issued_at,
      expires_at: challenge.expires_at,
    },
    ownership_proof: {
      public_key_fingerprint: ownership.fingerprint,
    },
  };

  const registrationRequest =
    requestOwnershipRegistration ||
    (async (payload) => {
      const serialized = JSON.stringify(payload);
      const authHeaders = await createSignedVaultAuthHeaders({
        method: "POST",
        path: OWNERSHIP_REGISTER_PATH,
        body: serialized,
      });
      const response = await fetch(OWNERSHIP_REGISTER_PATH, {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
        },
        body: serialized,
      });
      const data = await response.json().catch(() => ({}));
      return { ok: response.ok, status: response.status, data };
    });

  const result = await registrationRequest(body);
  if (
    result.status === 409 &&
    result.data?.code === "OWNERSHIP_KEY_ALREADY_REGISTERED"
  ) {
    // Vault key already exists server-side. Establish a verified device record using the
    // migration verify ceremony instead of marking local registration without proof.
    try {
      const verifyResult = await verifyVaultOwnershipForMigrationAuthority();
      if (verifyResult.success) {
        markLocalOwnershipRegistration({
          vaultId: genesis.vault_id,
          publicKeyFingerprint: ownership.fingerprint,
          source: "server_existing_verified",
        });
        clearVaultOwnershipRegistrationDeferred();
        return {
          success: true,
          vault_id: genesis.vault_id,
          vault_device_id: device.vault_device_id,
          ownership_key_registered: true,
          already_registered: true,
          verified_existing: true,
          needs_recovery_kit_refresh: shouldPromptRecoveryKitRefreshAfterOwnershipKey(),
          private_key_sent_to_server: false,
        };
      }
    } catch {
      // Fall through to explicit error below.
    }

    throw new Error(
      "Vault ownership key is already registered, but this device key does not match. Restore the original ownership key from your recovery kit."
    );
  }

  if (
    result.status === 403 &&
    result.data?.code === "OWNERSHIP_AUTHORITY_REQUIRED"
  ) {
    markLocalOwnershipRegistrationDeferred({
      vaultId: genesis.vault_id,
      reason: result.data.code,
    });

    return {
      success: true,
      vault_id: genesis.vault_id,
      vault_device_id: device.vault_device_id,
      ownership_key_registered: false,
      deferred: true,
      needs_recovery_kit_refresh: shouldPromptRecoveryKitRefreshAfterOwnershipKey(),
      private_key_sent_to_server: false,
    };
  }

  if (!result.ok || !result.data?.success) {
    throw new Error(result.data?.error || "Unable to register vault ownership key.");
  }

  markLocalOwnershipRegistration({
    vaultId: genesis.vault_id,
    publicKeyFingerprint: ownership.fingerprint,
    source: "server_registered",
  });
  clearVaultOwnershipRegistrationDeferred();

  const existingConfirmation = readVaultRecoveryKitConfirmation();
  if (existingConfirmation?.vault_id === genesis.vault_id) {
    markVaultRecoveryKitOwnershipKeyBoundary({
      vaultId: genesis.vault_id,
      kitVersion: existingConfirmation.kit_version,
      kitCreatedAt: existingConfirmation.kit_created_at,
      ownershipKeyRegisteredAt: true,
    });
  }

  return {
    success: true,
    vault_id: genesis.vault_id,
    vault_device_id: device.vault_device_id,
    ownership_key_registered: true,
    needs_recovery_kit_refresh: true,
    private_key_sent_to_server: false,
  };
}

async function requestVaultOwnershipChallenge(payload = {}) {
  const serialized = JSON.stringify(payload);
  const authHeaders = await createSignedVaultAuthHeaders({
    method: "POST",
    path: OWNERSHIP_CHALLENGE_PATH,
    body: serialized,
  });
  const response = await fetch(OWNERSHIP_CHALLENGE_PATH, {
    method: "POST",
    headers: {
      ...authHeaders,
      "Content-Type": "application/json",
    },
    body: serialized,
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

async function submitVaultOwnershipVerification(payload) {
  const serialized = JSON.stringify(payload);
  const authHeaders = await createSignedVaultAuthHeaders({
    method: "POST",
    path: OWNERSHIP_VERIFY_PATH,
    body: serialized,
  });
  const response = await fetch(OWNERSHIP_VERIFY_PATH, {
    method: "POST",
    headers: {
      ...authHeaders,
      "Content-Type": "application/json",
    },
    body: serialized,
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

export async function verifyVaultOwnershipForMigrationAuthority({
  requestChallenge,
  requestVerify,
} = {}) {
  const genesis = await ensureVaultGenesis();
  const device = getVaultDevice();
  if (!device?.vault_device_id) {
    throw new Error("Vault device is not initialized.");
  }

  const challengeRequest = requestChallenge || requestVaultOwnershipChallenge;
  const challengeResult = await challengeRequest({});
  if (!challengeResult.ok || !challengeResult.data?.success) {
    throw new Error(challengeResult.data?.error || "Unable to create ownership challenge.");
  }

  const challenge = challengeResult.data.challenge;
  const challengeId = String(challengeResult.data.challenge_id || "").trim().toLowerCase();
  if (!challenge || !challengeId) {
    throw new Error("Ownership challenge response is incomplete.");
  }

  const ownership = await getOrCreateLocalVaultOwnershipMaterial();
  const message = buildVaultOwnershipChallengeMessage({
    challengeId,
    challengeType: challenge.challenge_type,
    vaultId: challenge.vault_id || genesis.vault_id,
    vaultDeviceId: challenge.vault_device_id || device.vault_device_id,
    challengeNonce: challenge.challenge_nonce,
    issuedAt: challenge.issued_at,
    expiresAt: challenge.expires_at,
    version: challenge.version,
  });
  const signature = await signVaultOwnershipChallenge({
    privateKey: ownership.privateKey,
    challenge: message,
  });

  const verifyRequest = requestVerify || submitVaultOwnershipVerification;
  const verifyResult = await verifyRequest({
    challenge_id: challengeId,
    challenge_nonce: challenge.challenge_nonce,
    challenge: {
      version: challenge.version,
      action: challenge.challenge_type,
      challenge_type: challenge.challenge_type,
      vault_id: challenge.vault_id,
      vault_device_id: challenge.vault_device_id,
      issued_at: challenge.issued_at,
      expires_at: challenge.expires_at,
    },
    signature,
  });

  if (!verifyResult.ok || !verifyResult.data?.success) {
    throw new Error(verifyResult.data?.error || "Unable to verify vault ownership challenge.");
  }

  return {
    success: true,
    migration_authority_verified: true,
    vault_id: verifyResult.data.vault_id || genesis.vault_id,
    vault_device_id: verifyResult.data.vault_device_id || device.vault_device_id,
    challenge_id: challengeId,
    private_key_sent_to_server: false,
  };
}

export async function ensureVaultOwnershipReadyForMigrationBoundary({
  requestOwnershipRegistration,
} = {}) {
  const genesis = readVaultGenesis();
  if (!genesis?.vault_id) {
    return {
      success: false,
      skipped: true,
      reason: "VAULT_GENESIS_MISSING",
    };
  }

  return registerVaultOwnershipKeyWithServer({
    requestOwnershipRegistration,
  });
}

// Ensures the server has a verified ownership record for this device before asset actions.
export async function ensureVaultOwnershipRegistered({ force = false } = {}) {
  const unlockKeys = getVaultSessionUnlockKeys();
  if (!(unlockKeys.masterVaultKey instanceof Uint8Array)) {
    return {
      ready: false,
      error: "Unlock your vault before registering assets.",
    };
  }

  try {
    const result = await registerVaultOwnershipKeyWithServer({ skipLocalCache: force });
    if (result.deferred) {
      return {
        ready: false,
        error: "Vault ownership registration is required before asset registration.",
        deferred: true,
      };
    }
    if (!result.ownership_key_registered) {
      return {
        ready: false,
        error: "Vault ownership registration did not complete.",
      };
    }
    return { ready: true, result };
  } catch (error) {
    return {
      ready: false,
      error: error?.message || "Vault ownership registration failed.",
    };
  }
}

export function resetVaultOwnershipClientForTests() {
  clearWrappedVaultOwnershipPrivateJwk();
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(VAULT_OWNERSHIP_REGISTRATION_STORAGE_KEY);
    window.localStorage.removeItem(VAULT_OWNERSHIP_REGISTRATION_DEFERRED_STORAGE_KEY);
  }
}

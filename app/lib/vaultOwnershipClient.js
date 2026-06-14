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
import { sha256Hex } from "./vaultCrypto.js";
import { buildVaultOwnershipChallengeMessage } from "./vaultOwnershipVerification.js";

const OWNERSHIP_REGISTER_PATH = "/api/vault/ownership/register";
const OWNERSHIP_CHALLENGE_PATH = "/api/vault/ownership/challenge";
const OWNERSHIP_VERIFY_PATH = "/api/vault/ownership/verify";
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

export function clearVaultOwnershipRegistrationDeferred() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(VAULT_OWNERSHIP_REGISTRATION_DEFERRED_STORAGE_KEY);
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
} = {}) {
  const genesis = await ensureVaultGenesis();
  const device = getVaultDevice();
  if (!device?.vault_device_id) {
    throw new Error("Vault device is not initialized.");
  }

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

  const ownership = await getOrCreateLocalVaultOwnershipMaterial();
  const challenge = `prooforigin-vault-ownership-register|vault_id=${genesis.vault_id}|vault_device_id=${device.vault_device_id}|ts=${Date.now()}`;
  const signature = await signVaultOwnershipChallenge({
    privateKey: ownership.privateKey,
    challenge,
  });
  const challengeHash = await sha256Hex(challenge);

  const body = {
    vault_id: genesis.vault_id,
    ownership_public_key_jwk: ownership.publicJwk,
    ownership_key_algorithm: "ECDSA-P256-SHA256",
    ownership_proof: {
      challenge,
      challenge_hash: challengeHash,
      signature,
      challenge_format: "prooforigin-vault-ownership-register-v1",
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
    markLocalOwnershipRegistration({
      vaultId: genesis.vault_id,
      publicKeyFingerprint: ownership.fingerprint,
      source: "server_duplicate_noop",
    });

    return {
      success: true,
      vault_id: genesis.vault_id,
      vault_device_id: device.vault_device_id,
      ownership_key_registered: true,
      already_registered: true,
      needs_recovery_kit_refresh: shouldPromptRecoveryKitRefreshAfterOwnershipKey(),
      private_key_sent_to_server: false,
    };
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

export function resetVaultOwnershipClientForTests() {
  clearWrappedVaultOwnershipPrivateJwk();
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(VAULT_OWNERSHIP_REGISTRATION_STORAGE_KEY);
    window.localStorage.removeItem(VAULT_OWNERSHIP_REGISTRATION_DEFERRED_STORAGE_KEY);
  }
}

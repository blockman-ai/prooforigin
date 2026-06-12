import {
  buildPasskeyWrapRecord,
  computePasskeyPrfSalt,
  detectPasskeyCapabilities,
  normalizePasskeyWrapKey,
} from "./vaultPasskey.js";
import {
  isVaultPasskeyEnrolled,
  storePasskeyWrapRecord,
  clearPasskeyWrapRecord,
} from "./vaultPasskeyStorage.js";
import { VAULT_MVK_BYTES, wipeSensitiveBytes } from "./vaultKeyRing.js";

function bufferToBase64Url(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < view.length; i += 1) {
    binary += String.fromCharCode(view[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlToBuffer(value) {
  const base64 = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function getDefaultPasskeyRpId() {
  if (typeof window === "undefined") {
    return null;
  }

  const hostname = window.location?.hostname;
  return hostname && hostname.trim() ? hostname.trim() : null;
}

function assertEnrollmentKeys(masterVaultKey, legacyPinKey) {
  if (!(masterVaultKey instanceof Uint8Array) || masterVaultKey.length !== VAULT_MVK_BYTES) {
    throw new Error("Master vault key must be available to enroll a passkey.");
  }

  if (!(legacyPinKey instanceof Uint8Array) || legacyPinKey.length !== VAULT_MVK_BYTES) {
    throw new Error("Legacy PIN key must be available to enroll a passkey.");
  }
}

export function buildVaultPasskeyCreationOptions({ vaultId, rpId, challenge }) {
  if (typeof vaultId !== "string" || !vaultId.trim()) {
    throw new Error("vault_id is required to create a vault passkey.");
  }

  if (typeof rpId !== "string" || !rpId.trim()) {
    throw new Error("rpId is required to create a vault passkey.");
  }

  const userId = new TextEncoder().encode(vaultId.trim());
  const creationChallenge =
    challenge instanceof Uint8Array ? challenge : crypto.getRandomValues(new Uint8Array(32));

  return {
    publicKey: {
      rp: {
        name: "ProofOrigin Vault",
        id: rpId.trim(),
      },
      user: {
        id: userId,
        name: `vault-${vaultId.trim().slice(0, 8)}`,
        displayName: "ProofOrigin Vault",
      },
      challenge: creationChallenge,
      pubKeyCredParams: [{ alg: -7, type: "public-key" }],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "required",
        userVerification: "required",
      },
      extensions: {
        prf: true,
      },
    },
  };
}

export function buildVaultPasskeyPrfEvaluationOptions({ credentialId, rpId, prfSalt, challenge }) {
  if (typeof credentialId !== "string" || !credentialId.trim()) {
    throw new Error("credential_id is required to evaluate passkey PRF.");
  }

  if (!(prfSalt instanceof Uint8Array) || prfSalt.length !== 32) {
    throw new Error("PRF salt must be a 32-byte Uint8Array.");
  }

  const assertionChallenge =
    challenge instanceof Uint8Array ? challenge : crypto.getRandomValues(new Uint8Array(32));

  return {
    publicKey: {
      challenge: assertionChallenge,
      rpId: rpId.trim(),
      allowCredentials: [
        {
          id: base64UrlToBuffer(credentialId),
          type: "public-key",
        },
      ],
      userVerification: "required",
      extensions: {
        prf: {
          eval: {
            first: prfSalt,
          },
        },
      },
    },
  };
}

export function extractCredentialId(credential) {
  if (!credential?.rawId) {
    throw new Error("Passkey credential is missing rawId.");
  }

  return bufferToBase64Url(credential.rawId);
}

export function extractPasskeyPrfOutput(credential) {
  if (typeof credential?.getClientExtensionResults !== "function") {
    throw new Error("Passkey credential did not return extension results.");
  }

  const results = credential.getClientExtensionResults();
  const prfOutput = results?.prf?.results?.first;

  if (!(prfOutput instanceof ArrayBuffer) && !(prfOutput instanceof Uint8Array)) {
    throw new Error("Passkey PRF output is unavailable.");
  }

  return prfOutput;
}

export async function createVaultPasskeyCredential({ vaultId, rpId, challenge } = {}) {
  if (typeof navigator?.credentials?.create !== "function") {
    throw new Error("WebAuthn credential creation is unavailable.");
  }

  const resolvedRpId = rpId || getDefaultPasskeyRpId();
  if (!resolvedRpId) {
    throw new Error("Unable to resolve passkey rpId.");
  }

  return navigator.credentials.create(
    buildVaultPasskeyCreationOptions({
      vaultId,
      rpId: resolvedRpId,
      challenge,
    })
  );
}

export async function evaluateVaultPasskeyPrf({ credentialId, rpId, prfSalt, challenge } = {}) {
  if (typeof navigator?.credentials?.get !== "function") {
    throw new Error("WebAuthn credential assertion is unavailable.");
  }

  const resolvedRpId = rpId || getDefaultPasskeyRpId();
  if (!resolvedRpId) {
    throw new Error("Unable to resolve passkey rpId.");
  }

  const assertion = await navigator.credentials.get(
    buildVaultPasskeyPrfEvaluationOptions({
      credentialId,
      rpId: resolvedRpId,
      prfSalt,
      challenge,
    })
  );

  return extractPasskeyPrfOutput(assertion);
}

export function buildPasskeyEnrollmentMetadata(record) {
  return {
    enrolled: true,
    vault_id: record.vault_id,
    credential_id: record.credential_id,
    version: record.version,
    wrap_method: record.wrap_method,
    enrolled_at: record.enrolled_at,
  };
}

export async function enrollVaultPasskey({
  vaultId,
  masterVaultKey,
  legacyPinKey,
  rpId,
  replace = false,
  detectCapabilities = detectPasskeyCapabilities,
  createCredential = createVaultPasskeyCredential,
  evaluatePrf = evaluateVaultPasskeyPrf,
} = {}) {
  if (typeof vaultId !== "string" || !vaultId.trim()) {
    throw new Error("vault_id is required to enroll a passkey.");
  }

  assertEnrollmentKeys(masterVaultKey, legacyPinKey);

  if (isVaultPasskeyEnrolled()) {
    if (!replace) {
      throw new Error("Passkey is already enrolled for this vault.");
    }
    clearPasskeyWrapRecord();
  }

  const capabilities = await detectCapabilities();
  if (!capabilities.passkeyUnlockSupported) {
    throw new Error("Passkey enrollment requires WebAuthn PRF support on this device.");
  }

  const resolvedRpId = rpId || getDefaultPasskeyRpId();
  if (!resolvedRpId) {
    throw new Error("Unable to resolve passkey rpId.");
  }

  let passkeyWrapKey = null;
  let prfSalt = null;

  try {
    const credential = await createCredential({
      vaultId: vaultId.trim(),
      rpId: resolvedRpId,
    });

    const credentialId = extractCredentialId(credential);
    prfSalt = await computePasskeyPrfSalt(vaultId.trim(), credentialId);
    const prfOutput = await evaluatePrf({
      credentialId,
      rpId: resolvedRpId,
      prfSalt,
    });

    passkeyWrapKey = await normalizePasskeyWrapKey(prfOutput);
    const record = await buildPasskeyWrapRecord({
      vaultId: vaultId.trim(),
      credentialId,
      masterVaultKey,
      legacyPinKey,
      passkeyWrapKey,
      prfSalt,
    });

    storePasskeyWrapRecord(record);

    return buildPasskeyEnrollmentMetadata(record);
  } finally {
    if (passkeyWrapKey) {
      wipeSensitiveBytes(passkeyWrapKey);
    }
    if (prfSalt) {
      wipeSensitiveBytes(prfSalt);
    }
  }
}

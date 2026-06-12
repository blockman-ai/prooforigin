import { deriveVaultPinMasterKeyBytes } from "./vaultPin.js";

export const VAULT_DOC_KEY_INFO = "prooforigin-vault-doc-v1";
export const VAULT_AES_GCM_IV_BYTES = 12;
export const VAULT_SHA256_HEX_LENGTH = 64;

function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeSaltInput(salt) {
  if (salt instanceof ArrayBuffer) {
    return salt;
  }
  if (salt instanceof Uint8Array) {
    return salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength);
  }
  if (typeof salt === "string") {
    return base64ToBuffer(salt).buffer;
  }
  throw new Error("Vault salt must be a base64 string or ArrayBuffer.");
}

export function generateRandomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function clearBytes(bytes) {
  if (!bytes) return;
  if (bytes instanceof ArrayBuffer) {
    clearBytes(new Uint8Array(bytes));
    return;
  }
  if (ArrayBuffer.isView(bytes)) {
    bytes.fill(0);
  }
}

export async function sha256Hex(bytesOrText) {
  let data;
  if (typeof bytesOrText === "string") {
    data = new TextEncoder().encode(bytesOrText);
  } else if (bytesOrText instanceof ArrayBuffer) {
    data = bytesOrText;
  } else if (ArrayBuffer.isView(bytesOrText)) {
    data = bytesOrText.buffer.slice(
      bytesOrText.byteOffset,
      bytesOrText.byteOffset + bytesOrText.byteLength
    );
  } else {
    throw new Error("sha256Hex expects a string or byte input.");
  }

  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return bufferToHex(hashBuffer);
}

export async function deriveVaultMasterKey(pin, salt) {
  const saltBuffer = normalizeSaltInput(salt);
  return deriveVaultPinMasterKeyBytes(pin, saltBuffer);
}

async function importAesGcmKey(rawKeyBytes) {
  return crypto.subtle.importKey("raw", rawKeyBytes, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function deriveVaultDocumentKey(masterKey) {
  const masterKeyBytes =
    masterKey instanceof Uint8Array
      ? masterKey
      : new Uint8Array(
          masterKey.buffer.slice(masterKey.byteOffset, masterKey.byteOffset + masterKey.byteLength)
        );

  const hkdfKey = await crypto.subtle.importKey("raw", masterKeyBytes, "HKDF", false, [
    "deriveKey",
  ]);

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(VAULT_DOC_KEY_INFO),
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function normalizeAad(aad) {
  if (!aad) return new Uint8Array(0);
  if (typeof aad === "string") return new TextEncoder().encode(aad);
  if (aad instanceof ArrayBuffer) return new Uint8Array(aad);
  if (ArrayBuffer.isView(aad)) {
    return new Uint8Array(aad.buffer, aad.byteOffset, aad.byteLength);
  }
  throw new Error("AAD must be a string or byte input.");
}

export async function encryptVaultBytes(bytes, key, aad) {
  const plaintext =
    bytes instanceof Uint8Array
      ? bytes
      : new Uint8Array(
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
        );

  const cryptoKey =
    key instanceof CryptoKey ? key : await importAesGcmKey(key instanceof Uint8Array ? key : new Uint8Array(key));

  const iv = generateRandomBytes(VAULT_AES_GCM_IV_BYTES);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: normalizeAad(aad),
    },
    cryptoKey,
    plaintext
  );

  return {
    ciphertext: new Uint8Array(ciphertext),
    iv,
  };
}

export async function decryptVaultBytes(ciphertext, key, iv, aad) {
  const ciphertextBytes =
    ciphertext instanceof Uint8Array
      ? ciphertext
      : new Uint8Array(
          ciphertext.buffer.slice(
            ciphertext.byteOffset,
            ciphertext.byteOffset + ciphertext.byteLength
          )
        );

  const ivBytes =
    iv instanceof Uint8Array
      ? iv
      : new Uint8Array(iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength));

  const cryptoKey =
    key instanceof CryptoKey ? key : await importAesGcmKey(key instanceof Uint8Array ? key : new Uint8Array(key));

  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: ivBytes,
      additionalData: normalizeAad(aad),
    },
    cryptoKey,
    ciphertextBytes
  );

  return new Uint8Array(plaintext);
}

export async function runVaultCryptoSelfTest() {
  const checks = [];

  try {
    const sampleText = "prooforigin-vault-crypto-self-test";
    const hash = await sha256Hex(sampleText);
    checks.push({
      name: "sha256_hex_length",
      ok: hash.length === VAULT_SHA256_HEX_LENGTH,
    });

    const masterKey = generateRandomBytes(32);
    const documentKey = await deriveVaultDocumentKey(masterKey);
    const plaintext = new TextEncoder().encode("vault-round-trip-v0.2");
    const aad = "prooforigin-vault-self-test-aad";

    const encrypted = await encryptVaultBytes(plaintext, documentKey, aad);
    checks.push({
      name: "encrypt_iv_length",
      ok: encrypted.iv.length === VAULT_AES_GCM_IV_BYTES,
    });

    const decrypted = await decryptVaultBytes(
      encrypted.ciphertext,
      documentKey,
      encrypted.iv,
      aad
    );

    const roundTripOk =
      decrypted.length === plaintext.length &&
      decrypted.every((byte, index) => byte === plaintext[index]);

    checks.push({
      name: "aes_gcm_round_trip",
      ok: roundTripOk,
    });

    const tampered = new Uint8Array(encrypted.ciphertext);
    tampered[0] ^= 0xff;
    let tamperRejected = false;

    try {
      await decryptVaultBytes(tampered, documentKey, encrypted.iv, aad);
    } catch {
      tamperRejected = true;
    }

    checks.push({
      name: "aes_gcm_tamper_rejected",
      ok: tamperRejected,
    });

    clearBytes(masterKey);
    clearBytes(plaintext);
    clearBytes(decrypted);
    clearBytes(encrypted.ciphertext);

    const ok = checks.every((check) => check.ok);
    return { ok, checks };
  } catch (error) {
    return {
      ok: false,
      checks,
      error: error instanceof Error ? error.message : "Vault crypto self-test failed.",
    };
  }
}

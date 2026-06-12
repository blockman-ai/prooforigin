import assert from "node:assert/strict";
import { test } from "node:test";
import {
  VAULT_KEY_RING_VERSION,
  VAULT_KEY_RING_WRAP_METHOD,
  VAULT_MVK_BYTES,
  exportWrappedMasterVaultKeyRecord,
  generateMasterVaultKey,
  importWrappedMasterVaultKeyRecord,
  unwrapMasterVaultKeyWithPin,
  wrapMasterVaultKeyWithPin,
} from "../../app/lib/vaultKeyRing.js";

const TEST_PIN = "123456";

test("generateMasterVaultKey returns 256-bit key", () => {
  const mvk = generateMasterVaultKey();
  assert.equal(mvk.length, VAULT_MVK_BYTES);
  assert.equal(VAULT_MVK_BYTES, 32);
});

test("PIN wrap and unwrap round trip restores MVK", async () => {
  const mvk = generateMasterVaultKey();
  const wrapped = await wrapMasterVaultKeyWithPin(mvk, TEST_PIN);
  const unwrapped = await unwrapMasterVaultKeyWithPin(wrapped, TEST_PIN);

  assert.ok(unwrapped instanceof Uint8Array);
  assert.equal(unwrapped.length, VAULT_MVK_BYTES);
  assert.deepEqual(Array.from(unwrapped), Array.from(mvk));
});

test("wrong PIN fails unwrap", async () => {
  const mvk = generateMasterVaultKey();
  const wrapped = await wrapMasterVaultKeyWithPin(mvk, TEST_PIN);
  const unwrapped = await unwrapMasterVaultKeyWithPin(wrapped, "654321");

  assert.equal(unwrapped, null);
});

test("wrapped record does not expose raw MVK", async () => {
  const mvk = generateMasterVaultKey();
  const wrapped = await wrapMasterVaultKeyWithPin(mvk, TEST_PIN);
  const exported = exportWrappedMasterVaultKeyRecord(wrapped);
  const mvkBase64 = bufferToBase64(mvk);

  assert.ok(!exported.includes(mvkBase64));
  assert.notDeepEqual(base64ToBuffer(wrapped.ciphertext), mvk);

  const parsed = JSON.parse(exported);
  assert.equal(parsed.master_vault_key, undefined);
  assert.equal(parsed.mvk, undefined);
  assert.ok(typeof parsed.ciphertext === "string" && parsed.ciphertext.length > 0);
});

test("export/import preserves wrapped record", async () => {
  const mvk = generateMasterVaultKey();
  const wrapped = await wrapMasterVaultKeyWithPin(mvk, TEST_PIN);
  const imported = importWrappedMasterVaultKeyRecord(exportWrappedMasterVaultKeyRecord(wrapped));
  const unwrapped = await unwrapMasterVaultKeyWithPin(imported, TEST_PIN);

  assert.deepEqual(Array.from(unwrapped), Array.from(mvk));
});

test("version constants are stable", () => {
  assert.equal(VAULT_KEY_RING_VERSION, "v1");
  assert.equal(VAULT_KEY_RING_WRAP_METHOD, "pin_pbkdf2_aes_gcm_v1");
  assert.equal(VAULT_MVK_BYTES, 32);
});

function bufferToBase64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

function base64ToBuffer(base64) {
  return new Uint8Array(Buffer.from(base64, "base64"));
}

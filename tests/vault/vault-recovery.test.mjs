import assert from "node:assert/strict";
import { test } from "node:test";
import { generateMasterVaultKey } from "../../app/lib/vaultKeyRing.js";
import {
  exportRecoveryKit,
  generateRecoveryPhrase,
  normalizeRecoveryPhrase,
  parseRecoveryKit,
  serializeRecoveryKit,
  unwrapMasterVaultKeyFromRecoveryKit,
  validateRecoveryPhrase,
  VAULT_RECOVERY_PHRASE_WORD_COUNT,
} from "../../app/lib/vaultRecovery.js";

const TEST_VAULT_ID = "11111111-1111-4111-8111-111111111111";

test("generateRecoveryPhrase returns valid phrase", () => {
  const phrase = generateRecoveryPhrase();
  const validation = validateRecoveryPhrase(phrase);

  assert.equal(validation.valid, true);
  assert.equal(validation.normalized.split(" ").length, VAULT_RECOVERY_PHRASE_WORD_COUNT);
});

test("validateRecoveryPhrase rejects invalid word count and words", () => {
  assert.equal(validateRecoveryPhrase("amber anchor").valid, false);
  assert.equal(validateRecoveryPhrase("amber " + "anchor ".repeat(11) + "notaword").valid, false);
});

test("normalizeRecoveryPhrase lowercases and collapses whitespace", () => {
  assert.equal(normalizeRecoveryPhrase("  Amber   ANCHOR  "), "amber anchor");
});

test("export and unwrap recovery kit round trip restores MVK", async () => {
  const masterVaultKey = generateMasterVaultKey();
  const recoveryPhrase = generateRecoveryPhrase();
  const kit = await exportRecoveryKit({
    vaultId: TEST_VAULT_ID,
    masterVaultKey,
    recoveryPhrase,
  });

  const unwrapped = await unwrapMasterVaultKeyFromRecoveryKit(kit, recoveryPhrase);

  assert.ok(unwrapped instanceof Uint8Array);
  assert.deepEqual(Array.from(unwrapped), Array.from(masterVaultKey));
});

test("recovery kit does not include plaintext MVK or recovery phrase", async () => {
  const masterVaultKey = generateMasterVaultKey();
  const recoveryPhrase = generateRecoveryPhrase();
  const kit = await exportRecoveryKit({
    vaultId: TEST_VAULT_ID,
    masterVaultKey,
    recoveryPhrase,
  });
  const serialized = serializeRecoveryKit(kit);

  assert.ok(!serialized.includes(recoveryPhrase));
  assert.equal(kit.recovery_phrase, undefined);
  assert.equal(kit.master_vault_key, undefined);
  assert.equal(kit.wrapped_mvk.ciphertext.length > 0, true);
  assert.equal(parseRecoveryKit(serialized).vault_id, TEST_VAULT_ID);
});

test("wrong recovery phrase fails unwrap", async () => {
  const masterVaultKey = generateMasterVaultKey();
  const kit = await exportRecoveryKit({
    vaultId: TEST_VAULT_ID,
    masterVaultKey,
    recoveryPhrase: generateRecoveryPhrase(),
  });

  const unwrapped = await unwrapMasterVaultKeyFromRecoveryKit(kit, generateRecoveryPhrase());
  assert.equal(unwrapped, null);
});

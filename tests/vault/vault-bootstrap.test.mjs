import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  canCreateVaultGenesis,
  isVaultBootstrapPending,
  isVaultCreateBootstrapChosen,
  isVaultRestoreBootstrapChosen,
  resetVaultBootstrapForTests,
  shouldShowVaultBootstrapChoice,
  VAULT_BOOTSTRAP_CHOICES,
  VAULT_BOOTSTRAP_STORAGE_KEY,
  writeVaultBootstrapChoice,
} from "../../app/lib/vaultBootstrap.js";
import {
  createVaultGenesis,
  ensureVaultGenesis,
  readVaultGenesis,
  resetVaultGenesisForTests,
  VAULT_GENESIS_STORAGE_KEY,
} from "../../app/lib/vaultGenesis.js";

const storage = new Map();

beforeEach(() => {
  storage.clear();
  globalThis.window = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => {
        storage.set(key, value);
      },
      removeItem: (key) => {
        storage.delete(key);
      },
    },
  };
});

afterEach(() => {
  resetVaultBootstrapForTests();
  resetVaultGenesisForTests();
  delete globalThis.window;
});

test("fresh profile needs bootstrap choice before genesis", () => {
  assert.equal(isVaultBootstrapPending(), true);
  assert.equal(shouldShowVaultBootstrapChoice(), true);
  assert.equal(canCreateVaultGenesis(), false);
});

test("create path allows genesis creation", async () => {
  writeVaultBootstrapChoice(VAULT_BOOTSTRAP_CHOICES.CREATE);
  assert.equal(isVaultCreateBootstrapChosen(), true);
  assert.equal(canCreateVaultGenesis(), true);

  const genesis = await createVaultGenesis();

  assert.ok(genesis.vault_id);
  assert.ok(genesis.vault_genesis_hash);
  assert.equal(readVaultGenesis()?.vault_id, genesis.vault_id);
  assert.equal(storage.has(VAULT_GENESIS_STORAGE_KEY), true);
  assert.equal(storage.has(VAULT_BOOTSTRAP_STORAGE_KEY), false);
});

test("restore path blocks genesis creation", async () => {
  writeVaultBootstrapChoice(VAULT_BOOTSTRAP_CHOICES.RESTORE);
  assert.equal(isVaultRestoreBootstrapChosen(), true);
  assert.equal(canCreateVaultGenesis(), false);

  await assert.rejects(
    () => createVaultGenesis(),
    /Choose Create New Vault before creating vault genesis/
  );

  assert.equal(readVaultGenesis(), null);
  assert.equal(storage.has(VAULT_GENESIS_STORAGE_KEY), false);
});

test("ensureVaultGenesis fails when genesis was never created", async () => {
  await assert.rejects(
    () => ensureVaultGenesis(),
    /Vault genesis does not exist/
  );
});

test("ensureVaultGenesis returns existing genesis on unlock path", async () => {
  writeVaultBootstrapChoice(VAULT_BOOTSTRAP_CHOICES.CREATE);
  const created = await createVaultGenesis();
  const loaded = await ensureVaultGenesis();

  assert.equal(loaded.vault_id, created.vault_id);
});

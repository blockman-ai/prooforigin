import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  markVaultRecoveryKitConfirmed,
  markVaultRecoveryKitOwnershipKeyBoundary,
  readVaultRecoveryKitConfirmation,
} from "../../app/lib/vaultRecoveryStatus.js";

const TEST_VAULT_ID = "11111111-1111-4111-8111-111111111111";
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
  delete globalThis.window;
});

test("legacy recovery kit confirmation remains identity restore only by default", () => {
  const result = markVaultRecoveryKitConfirmed({
    vaultId: TEST_VAULT_ID,
    kitVersion: "recovery-kit-v1",
    kitCreatedAt: "2026-06-14T18:00:00.000Z",
  });

  assert.equal(result.ownership_key_registered_at, false);
  assert.equal(readVaultRecoveryKitConfirmation()?.ownership_key_registered_at, false);
});

test("ownership key boundary marker sets migration-proof eligibility flag", () => {
  const result = markVaultRecoveryKitOwnershipKeyBoundary({
    vaultId: TEST_VAULT_ID,
    kitVersion: "recovery-kit-v1",
    kitCreatedAt: "2026-06-14T18:00:00.000Z",
    ownershipKeyRegisteredAt: true,
  });

  assert.equal(result.ownership_key_registered_at, true);
  assert.equal(readVaultRecoveryKitConfirmation()?.ownership_key_registered_at, true);
});

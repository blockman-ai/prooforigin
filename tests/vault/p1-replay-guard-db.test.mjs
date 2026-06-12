import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "node:module";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const NONCE = "44444444-4444-4444-8444-444444444444";

function createNonceStore() {
  const rows = new Map();

  return {
    rows,
    client: {
      from(table) {
        if (table !== "vault_request_nonces") {
          throw new Error(`Unexpected table: ${table}`);
        }

        const query = {
          filters: {},
          pendingInsert: null,
        };

        const builder = {
          select() {
            return builder;
          },
          eq(column, value) {
            query.filters[column] = value;
            return builder;
          },
          lt(column, value) {
            query.filters[`${column}__lt`] = value;
            return builder;
          },
          maybeSingle() {
            const row = rows.get(query.filters.nonce) || null;
            return Promise.resolve({ data: row, error: null });
          },
          insert(record) {
            if (rows.has(record.nonce)) {
              return Promise.resolve({
                error: { code: "23505", message: "duplicate nonce" },
              });
            }

            rows.set(record.nonce, { ...record });
            return Promise.resolve({ error: null });
          },
          delete() {
            return builder;
          },
        };

        return builder;
      },
    },
  };
}

test("reserveVaultRequestNonce uses database and rejects duplicate nonce", async (t) => {
  const store = createNonceStore();

  mock.module("../../app/lib/vaultAdmin.js", {
    exports: {
      isVaultAdminConfigured: () => true,
      createVaultAdminClient: () => store.client,
    },
  });

  const { reserveVaultRequestNonce, resetVaultReplayGuardForTests } = await import(
    "../../app/lib/vaultReplayGuard.js"
  );

  resetVaultReplayGuardForTests();

  const first = await reserveVaultRequestNonce({
    vaultDeviceId: DEVICE_ID,
    nonce: NONCE,
  });
  const second = await reserveVaultRequestNonce({
    vaultDeviceId: DEVICE_ID,
    nonce: NONCE,
  });

  assert.equal(first.ok, true);
  assert.equal(first.mode, "database");
  assert.equal(second.ok, false);
  assert.equal(second.replay, true);
  assert.equal(second.mode, "database");
  assert.equal(store.rows.size, 1);

  t.mock.restoreAll();
});

import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "node:module";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

test("registerAsset ensures ownership and retries after stale local marker", async (t) => {
  let ensureCalls = 0;
  let registerCalls = 0;

  mock.module("../../app/lib/vaultOwnershipClient.js", {
    exports: {
      clearOwnershipRegistrationClientState: () => {},
      ensureVaultOwnershipRegistered: async ({ force } = {}) => {
        ensureCalls += 1;
        if (ensureCalls === 1 && !force) {
          return { ready: true, result: { ownership_key_registered: true } };
        }
        if (ensureCalls >= 2 && force) {
          return { ready: true, result: { ownership_key_registered: true } };
        }
        return { ready: false, error: "unexpected" };
      },
      getOrCreateLocalVaultOwnershipMaterial: async () => ({}),
    },
  });

  mock.module("../../app/lib/vaultDevice.js", {
    exports: {
      createSignedVaultAuthHeaders: async () => ({}),
      getVaultDevice: () => ({ vault_device_id: "device-1" }),
    },
  });

  const { registerAsset } = await import("../../app/lib/assetRegistryClient.js");

  globalThis.fetch = async (url, init) => {
    if (String(url).includes("/api/assets/register")) {
      registerCalls += 1;
      if (registerCalls === 1) {
        return new Response(
          JSON.stringify({
            success: false,
            code: "OWNERSHIP_VERIFICATION_REQUIRED",
            error: "Vault ownership verification is required before disclosure grants.",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ success: true, asset: { asset_id: "asset-1" } }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(JSON.stringify({ success: false }), { status: 404 });
  };

  const result = await registerAsset({ asset_type: "psa_card" });
  assert.equal(result.ok, true);
  assert.equal(result.data.success, true);
  assert.equal(ensureCalls, 2);
  assert.equal(registerCalls, 2);

  delete globalThis.fetch;
  t.mock.restoreAll();
});

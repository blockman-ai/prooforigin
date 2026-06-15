import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "node:module";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const GRANT_ID = "11111111-1111-4111-8111-111111111111";

mock.module("../../app/lib/vaultDisclosureAuthority.js", {
  exports: {
    authorizeDisclosureOwnerRequest: async () => ({
      ok: true,
      vaultRefHash: "v".repeat(64),
    }),
  },
});

mock.module("../../app/lib/vaultDisclosureGrantStore.js", {
  exports: {
    getDisclosureGrantRecordByIdForVault: async () => ({
      grant: {
        grant_id: GRANT_ID,
        grant_type: "verify_only",
        status: "active",
      },
      error: null,
    }),
    listDisclosureGrantEvents: async () => ({ events: [], error: null }),
  },
});

const { GET: GET_GRANT } = await import("../../app/api/vault/disclosure-grants/[id]/route.js");
const { GET: GET_EVENTS } = await import(
  "../../app/api/vault/disclosure-grants/[id]/events/route.js"
);

test("invalid grant id returns clean 400 on owner disclosure routes", async () => {
  const grantResponse = await GET_GRANT(new Request("http://localhost/api/vault/disclosure-grants/not-a-uuid"), {
    params: { id: "not-a-uuid" },
  });
  const grantJson = await grantResponse.json();
  assert.equal(grantResponse.status, 400);
  assert.equal(grantJson.code, "INVALID_GRANT_ID");

  const eventsResponse = await GET_EVENTS(
    new Request("http://localhost/api/vault/disclosure-grants/not-a-uuid/events"),
    { params: { id: "not-a-uuid" } }
  );
  const eventsJson = await eventsResponse.json();
  assert.equal(eventsResponse.status, 400);
  assert.equal(eventsJson.code, "INVALID_GRANT_ID");
});

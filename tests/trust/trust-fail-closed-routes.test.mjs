import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "node:module";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

mock.module("../../app/lib/supabaseAdmin.js", {
  exports: {
    isSupabaseAdminConfigured: () => false,
    getSupabaseAdmin: () => {
      throw new Error("Supabase should not be loaded when unconfigured.");
    },
  },
});

const { POST: createIdentityCard } = await import(
  "../../app/api/identity-card/create/route.js"
);
const { POST: revokeIdentityCard } = await import(
  "../../app/api/identity-card/revoke/route.js"
);
const { GET: getPublicIdentityCard } = await import(
  "../../app/api/identity-card/public/[cardId]/route.js"
);
const { POST: enrollVoiceAnchor, DELETE: deleteVoiceAnchor } = await import(
  "../../app/api/voice-anchor/enroll/route.js"
);

test("identity card create fails closed when storage is unavailable", async () => {
  const response = await createIdentityCard(
    new Request("http://localhost/api/identity-card/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        display_name: "Test User",
        username: "testuser",
        purpose: "production hardening",
        expiration_key: "30d",
        consent: true,
      }),
    })
  );
  const json = await response.json();

  assert.equal(response.status, 503);
  assert.equal(json.success, false);
  assert.equal(json.stored, undefined);
  assert.equal(json.card, undefined);
});

test("identity card revoke fails closed when storage is unavailable", async () => {
  const response = await revokeIdentityCard(
    new Request("http://localhost/api/identity-card/revoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        card_id: "11111111-1111-4111-8111-111111111111",
        secret_seed: "22222222-2222-4222-8222-222222222222",
      }),
    })
  );
  const json = await response.json();

  assert.equal(response.status, 503);
  assert.equal(json.success, false);
  assert.equal(json.stored, undefined);
});

test("identity card public lookup fails closed when storage is unavailable", async () => {
  const response = await getPublicIdentityCard(
    new Request("http://localhost/api/identity-card/public/11111111-1111-4111-8111-111111111111"),
    { params: { cardId: "11111111-1111-4111-8111-111111111111" } }
  );
  const json = await response.json();

  assert.equal(response.status, 503);
  assert.equal(json.success, false);
  assert.equal(json.card, undefined);
});

test("voice anchor enroll and delete fail closed when storage is unavailable", async () => {
  const formData = new FormData();
  formData.set("consent", "true");
  formData.set("file", new Blob(["voice bytes"], { type: "audio/webm" }), "voice.webm");

  const enrollResponse = await enrollVoiceAnchor(
    new Request("http://localhost/api/voice-anchor/enroll", {
      method: "POST",
      body: formData,
    })
  );
  const enrollJson = await enrollResponse.json();

  assert.equal(enrollResponse.status, 503);
  assert.equal(enrollJson.success, false);
  assert.equal(enrollJson.stored, undefined);

  const deleteResponse = await deleteVoiceAnchor(
    new Request("http://localhost/api/voice-anchor/enroll", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enrollment_id: "11111111-1111-4111-8111-111111111111",
        enrollment_token: "22222222-2222-4222-8222-222222222222",
      }),
    })
  );
  const deleteJson = await deleteResponse.json();

  assert.equal(deleteResponse.status, 503);
  assert.equal(deleteJson.success, false);
  assert.equal(deleteJson.stored, undefined);
});

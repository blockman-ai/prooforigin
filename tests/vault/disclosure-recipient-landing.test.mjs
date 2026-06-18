import assert from "node:assert/strict";
import { test } from "node:test";
import { register } from "node:module";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const {
  DISCLOSURE_RECIPIENT_PHASE,
  DISCLOSURE_UNAVAILABLE_MESSAGE,
  buildDisclosureRecipientPath,
  fetchDisclosureAccept,
  fetchDisclosureAccess,
  fetchDisclosureVerify,
  isDisclosureUnavailablePayload,
  parseDisclosureRecipientResponse,
  probeDisclosureGrant,
  runDisclosureRecipientFlow,
} = await import("../../app/lib/disclosureRecipientClient.js");

const GRANT_HANDLE = "EtA5sK8U2ssfKI_6F1pf5X3SoRXuOH4VBPaR19zppps";
const SESSION_TOKEN = "session-token-value";
const RECIPIENT_CHALLENGE = "phase10b-smoke-recipient-code";

function mockFetch(handlers) {
  return async (url, options = {}) => {
    const handler = handlers.find((entry) => entry.match(url, options));
    if (!handler) {
      throw new Error(`Unexpected fetch: ${url}`);
    }
    return handler.respond(url, options);
  };
}

function jsonResponse(status, payload) {
  return {
    status,
    async json() {
      return payload;
    },
  };
}

test("buildDisclosureRecipientPath encodes grant handle", () => {
  assert.equal(
    buildDisclosureRecipientPath("abc/def", "verify"),
    "/api/disclosure/abc%2Fdef/verify"
  );
});

test("parseDisclosureRecipientResponse maps unavailable payloads safely", () => {
  const payload = {
    ok: false,
    status: "unavailable",
    error: DISCLOSURE_UNAVAILABLE_MESSAGE,
  };

  assert.equal(parseDisclosureRecipientResponse(404, payload).kind, "denied");
  assert.equal(parseDisclosureRecipientResponse(502, payload).kind, "unavailable");
  assert.equal(isDisclosureUnavailablePayload(payload), true);
});

test("probeDisclosureGrant treats verify-without-session as denied readiness", async () => {
  const fetchImpl = mockFetch([
    {
      match: (url) => url.endsWith("/verify"),
      respond: () =>
        jsonResponse(404, {
          ok: false,
          status: "unavailable",
          error: DISCLOSURE_UNAVAILABLE_MESSAGE,
        }),
    },
  ]);

  const result = await probeDisclosureGrant(GRANT_HANDLE, { fetchImpl });
  assert.equal(result.kind, "denied");
  assert.equal(result.status, 404);
});

test("fetchDisclosureAccept returns session token on success", async () => {
  const fetchImpl = mockFetch([
    {
      match: (url, options) => url.endsWith("/accept") && options.method === "POST",
      respond: () =>
        jsonResponse(200, {
          ok: true,
          status: "accepted",
          session_token: SESSION_TOKEN,
          expires_at: "2026-06-18T01:00:00.000Z",
        }),
    },
  ]);

  const result = await fetchDisclosureAccept(GRANT_HANDLE, RECIPIENT_CHALLENGE, { fetchImpl });
  assert.equal(result.kind, "success");
  assert.equal(result.payload.session_token, SESSION_TOKEN);
});

test("runDisclosureRecipientFlow completes scoped access and exposes receipt hash", async () => {
  const receiptHash = "cb872a12fbc953760a1b7c7168e2e399b7ede31bf1f187ed8f2ab593b7f811b3";
  const fetchImpl = mockFetch([
    {
      match: (url, options) => url.endsWith("/accept") && options.method === "POST",
      respond: () =>
        jsonResponse(200, {
          ok: true,
          status: "accepted",
          session_token: SESSION_TOKEN,
          expires_at: "2026-06-18T01:00:00.000Z",
        }),
    },
    {
      match: (url, options) => url.endsWith("/access") && options.method === "GET",
      respond: (_url, options) => {
        assert.equal(options.headers["x-prooforigin-disclosure-session"], SESSION_TOKEN);
        return jsonResponse(200, {
          ok: true,
          grant_type: "scoped_verify",
          status: "accessed",
          claim: "Owner-authorized verification is valid for Phase 10B smoke.",
          accessed_at: "2026-06-18T00:48:34.725Z",
          expires_at: "2026-06-18T01:18:33.018Z",
          receipt: {
            receipt_id: "3f2f05a2-91f7-438b-99e0-bd2ce390521a",
            receipt_hash: receiptHash,
            policy_snapshot_hash: "62b0888953eda2070f7ae3148df81b09978ed9986d41af3c5228e9cbb901f286",
            custody_snapshot_hash: "b472d7df88f15fbf28c9183db1990856256c5abcb28a53a31c9ef48f3be81131",
            disclosure_digest: "a5057e8ab3c00b0f375cb8ef1aa30c762d6d478f328a1fe84a7372aa0731438b",
            created_at: "2026-06-18T00:48:34.687Z",
          },
        });
      },
    },
  ]);

  const flow = await runDisclosureRecipientFlow(GRANT_HANDLE, RECIPIENT_CHALLENGE, { fetchImpl });
  assert.equal(flow.phase, DISCLOSURE_RECIPIENT_PHASE.SUCCESS);
  assert.equal(flow.receipt.receipt_hash, receiptHash);
});

test("runDisclosureRecipientFlow renders safe unavailable when accept is denied", async () => {
  const fetchImpl = mockFetch([
    {
      match: (url) => url.endsWith("/accept"),
      respond: () =>
        jsonResponse(404, {
          ok: false,
          status: "unavailable",
          error: DISCLOSURE_UNAVAILABLE_MESSAGE,
        }),
    },
  ]);

  const flow = await runDisclosureRecipientFlow(GRANT_HANDLE, "wrong-challenge-value", {
    fetchImpl,
  });
  assert.equal(flow.phase, DISCLOSURE_RECIPIENT_PHASE.DENIED);
});

test("runDisclosureRecipientFlow falls back to verify for verify_only grants", async () => {
  const fetchImpl = mockFetch([
    {
      match: (url) => url.endsWith("/accept"),
      respond: () =>
        jsonResponse(200, {
          ok: true,
          status: "accepted",
          session_token: SESSION_TOKEN,
          expires_at: "2026-06-18T01:00:00.000Z",
        }),
    },
    {
      match: (url) => url.endsWith("/access"),
      respond: () =>
        jsonResponse(404, {
          ok: false,
          status: "unavailable",
          error: DISCLOSURE_UNAVAILABLE_MESSAGE,
        }),
    },
    {
      match: (url) => url.endsWith("/verify"),
      respond: () =>
        jsonResponse(200, {
          ok: true,
          grant_type: "verify_only",
          status: "verified",
          claim: "Owner-authorized verification is valid.",
          verified_at: "2026-06-18T00:48:34.725Z",
          expires_at: "2026-06-18T01:18:33.018Z",
        }),
    },
  ]);

  const flow = await runDisclosureRecipientFlow(GRANT_HANDLE, RECIPIENT_CHALLENGE, { fetchImpl });
  assert.equal(flow.phase, DISCLOSURE_RECIPIENT_PHASE.VERIFIED);
  assert.equal(flow.verify.payload.grant_type, "verify_only");
});

test("fetchDisclosureAccess maps server unavailable to safe phase", async () => {
  const fetchImpl = mockFetch([
    {
      match: (url) => url.endsWith("/access"),
      respond: () =>
        jsonResponse(502, {
          ok: false,
          status: "unavailable",
          error: DISCLOSURE_UNAVAILABLE_MESSAGE,
        }),
    },
  ]);

  const result = await fetchDisclosureAccess(GRANT_HANDLE, SESSION_TOKEN, { fetchImpl });
  assert.equal(result.kind, "unavailable");
});

test("fetchDisclosureVerify sends session header when provided", async () => {
  let capturedHeader = null;
  const fetchImpl = mockFetch([
    {
      match: (url) => url.endsWith("/verify"),
      respond: (_url, options) => {
        capturedHeader = options.headers["x-prooforigin-disclosure-session"];
        return jsonResponse(404, {
          ok: false,
          status: "unavailable",
          error: DISCLOSURE_UNAVAILABLE_MESSAGE,
        });
      },
    },
  ]);

  await fetchDisclosureVerify(GRANT_HANDLE, { sessionToken: SESSION_TOKEN, fetchImpl });
  assert.equal(capturedHeader, SESSION_TOKEN);
});

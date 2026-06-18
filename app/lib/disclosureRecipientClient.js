import { DISCLOSURE_SESSION_HEADER } from "./vaultDisclosureGrant.js";

export { DISCLOSURE_SESSION_HEADER };

export const DISCLOSURE_UNAVAILABLE_MESSAGE = "Disclosure is unavailable.";

export const DISCLOSURE_RECIPIENT_PHASE = Object.freeze({
  IDLE: "idle",
  PROBING: "probing",
  READY: "ready",
  ACCEPTING: "accepting",
  ACCESSING: "accessing",
  SUCCESS: "success",
  VERIFIED: "verified",
  DENIED: "denied",
  UNAVAILABLE: "unavailable",
});

export function buildDisclosureRecipientPath(grantHandle, action) {
  const handle = encodeURIComponent(String(grantHandle || "").trim());
  return `/api/disclosure/${handle}/${action}`;
}

export function isDisclosureUnavailablePayload(payload) {
  return (
    payload?.ok === false &&
    payload?.status === "unavailable" &&
    payload?.error === DISCLOSURE_UNAVAILABLE_MESSAGE
  );
}

export function parseDisclosureRecipientResponse(status, payload) {
  if (status === 502) {
    return { kind: "unavailable", payload };
  }
  if (
    status === 404 ||
    (payload?.ok === false && isDisclosureUnavailablePayload(payload))
  ) {
    return { kind: "denied", payload };
  }
  if (!payload || payload.ok !== true) {
    return { kind: "error", payload };
  }
  return { kind: "success", payload };
}

export function truncateDisclosureHash(hash, head = 12, tail = 8) {
  if (!hash || hash.length <= head + tail + 3) return hash || "—";
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

export function formatDisclosureTimestamp(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function formatDisclosureGrantType(grantType) {
  if (grantType === "scoped_verify") return "Scoped verification";
  if (grantType === "verify_only") return "Verification only";
  return grantType || "Disclosure";
}

export function formatDisclosureScopeType(scopeType) {
  if (scopeType === "vault_claim") return "Vault claim";
  if (scopeType === "document_ref") return "Document reference";
  if (scopeType === "identity_claim") return "Identity claim";
  return scopeType || null;
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function fetchDisclosureVerify(grantHandle, { sessionToken = "", fetchImpl = fetch } = {}) {
  const headers = {};
  if (sessionToken) {
    headers[DISCLOSURE_SESSION_HEADER] = sessionToken;
  }

  const response = await fetchImpl(buildDisclosureRecipientPath(grantHandle, "verify"), {
    method: "GET",
    headers,
    cache: "no-store",
  });
  const payload = await readJsonResponse(response);
  return { status: response.status, ...parseDisclosureRecipientResponse(response.status, payload), payload };
}

export async function fetchDisclosureAccept(grantHandle, recipientChallenge, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(buildDisclosureRecipientPath(grantHandle, "accept"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient_challenge: recipientChallenge }),
    cache: "no-store",
  });
  const payload = await readJsonResponse(response);
  return { status: response.status, ...parseDisclosureRecipientResponse(response.status, payload), payload };
}

export async function fetchDisclosureAccess(grantHandle, sessionToken, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(buildDisclosureRecipientPath(grantHandle, "access"), {
    method: "GET",
    headers: { [DISCLOSURE_SESSION_HEADER]: sessionToken },
    cache: "no-store",
  });
  const payload = await readJsonResponse(response);
  return { status: response.status, ...parseDisclosureRecipientResponse(response.status, payload), payload };
}

export async function fetchDisclosureReceipt(grantHandle, sessionToken, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(buildDisclosureRecipientPath(grantHandle, "receipt"), {
    method: "GET",
    headers: { [DISCLOSURE_SESSION_HEADER]: sessionToken },
    cache: "no-store",
  });
  const payload = await readJsonResponse(response);
  return { status: response.status, ...parseDisclosureRecipientResponse(response.status, payload), payload };
}

export async function probeDisclosureGrant(grantHandle, { fetchImpl = fetch } = {}) {
  return fetchDisclosureVerify(grantHandle, { fetchImpl });
}

export async function runDisclosureRecipientFlow(grantHandle, recipientChallenge, { fetchImpl = fetch } = {}) {
  const acceptResult = await fetchDisclosureAccept(grantHandle, recipientChallenge, { fetchImpl });
  if (acceptResult.kind !== "success" || !acceptResult.payload?.session_token) {
    return {
      phase: acceptResult.kind === "unavailable" ? DISCLOSURE_RECIPIENT_PHASE.UNAVAILABLE : DISCLOSURE_RECIPIENT_PHASE.DENIED,
      accept: acceptResult,
      access: null,
      verify: null,
      receipt: null,
      sessionToken: null,
    };
  }

  const sessionToken = acceptResult.payload.session_token;
  const accessResult = await fetchDisclosureAccess(grantHandle, sessionToken, { fetchImpl });

  if (accessResult.kind === "success") {
    let receipt = accessResult.payload?.receipt || null;
    if (!receipt) {
      const receiptResult = await fetchDisclosureReceipt(grantHandle, sessionToken, { fetchImpl });
      if (receiptResult.kind === "success") {
        receipt = receiptResult.payload?.receipt || null;
      }
    }

    return {
      phase: DISCLOSURE_RECIPIENT_PHASE.SUCCESS,
      accept: acceptResult,
      access: accessResult,
      verify: null,
      receipt,
      sessionToken,
    };
  }

  if (accessResult.kind === "unavailable") {
    return {
      phase: DISCLOSURE_RECIPIENT_PHASE.UNAVAILABLE,
      accept: acceptResult,
      access: accessResult,
      verify: null,
      receipt: null,
      sessionToken,
    };
  }

  const verifyResult = await fetchDisclosureVerify(grantHandle, { sessionToken, fetchImpl });
  if (verifyResult.kind === "success") {
    return {
      phase: DISCLOSURE_RECIPIENT_PHASE.VERIFIED,
      accept: acceptResult,
      access: accessResult,
      verify: verifyResult,
      receipt: null,
      sessionToken,
    };
  }

  return {
    phase:
      verifyResult.kind === "unavailable" ? DISCLOSURE_RECIPIENT_PHASE.UNAVAILABLE : DISCLOSURE_RECIPIENT_PHASE.DENIED,
    accept: acceptResult,
    access: accessResult,
    verify: verifyResult,
    receipt: null,
    sessionToken,
  };
}

import { vaultSignedFetch } from "./vaultDocumentClient.js";

export function formatOwnerGrantType(grantType) {
  if (grantType === "scoped_verify") return "Scoped verification";
  if (grantType === "verify_only") return "Verification only";
  return grantType || "Disclosure";
}

export function formatOwnerScopeType(scopeType) {
  if (scopeType === "vault_claim") return "Vault claim";
  if (scopeType === "document_ref") return "Document reference";
  if (scopeType === "identity_claim") return "Identity claim";
  return scopeType || "—";
}

export function formatOwnerTimestamp(value) {
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

export function truncateOwnerHash(hash, head = 12, tail = 8) {
  if (!hash || hash.length <= head + tail + 3) return hash || "—";
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

export function isGrantExpired(grant, nowMs = Date.now()) {
  const expiresMs = Date.parse(String(grant?.expires_at || ""));
  return Number.isFinite(expiresMs) && expiresMs <= nowMs;
}

export function deriveGrantDisplayStatus(grant, nowMs = Date.now()) {
  if (!grant) return "unknown";
  if (grant.status === "revoked") return "revoked";
  if (isGrantExpired(grant, nowMs)) return "expired";
  if (grant.status === "active") return "active";
  return grant.status || "unknown";
}

export function grantStatusBadgeVariant(status) {
  if (status === "active") return "success";
  if (status === "revoked") return "warning";
  if (status === "expired") return "pending";
  return "pending";
}

export function summarizeDisclosureGrants(grants = [], nowMs = Date.now()) {
  const summary = {
    total: grants.length,
    active: 0,
    receipted: 0,
    expiringSoon: 0,
    revoked: 0,
  };

  const expiringThresholdMs = nowMs + 7 * 24 * 60 * 60 * 1000;

  for (const grant of grants) {
    const displayStatus = deriveGrantDisplayStatus(grant, nowMs);
    if (displayStatus === "active") {
      summary.active += 1;
    }
    if (displayStatus === "revoked") {
      summary.revoked += 1;
    }
    if (Number(grant.access_count || 0) > 0) {
      summary.receipted += 1;
    }

    const expiresMs = Date.parse(String(grant.expires_at || ""));
    if (
      displayStatus === "active" &&
      Number.isFinite(expiresMs) &&
      expiresMs <= expiringThresholdMs
    ) {
      summary.expiringSoon += 1;
    }
  }

  return summary;
}

export function buildAccessCountMeter(accessCount = 0, maxAccessCount = 0) {
  const used = Math.max(0, Number(accessCount || 0));
  const max = Math.max(0, Number(maxAccessCount || 0));
  const ratio = max > 0 ? Math.min(used / max, 1) : 0;
  const percent = Math.round(ratio * 100);
  const capReached = max > 0 && used >= max;

  return {
    used,
    max,
    percent,
    capReached,
    label: max > 0 ? `${used} of ${max}` : `${used}`,
  };
}

export function parseOwnerDisclosureError(data, status) {
  const code = data?.code || "";
  const message = data?.error || "Unable to load disclosure data.";

  if (status === 403 && code === "OWNERSHIP_VERIFICATION_REQUIRED") {
    return "Vault ownership verification is required before managing disclosure grants.";
  }

  if (status === 403 && code === "VAULT_DEVICE_NOT_BOUND") {
    return "A bound vault device is required before managing disclosure grants.";
  }

  if (status === 401) {
    return "Vault device authentication is required. Unlock your vault and try again.";
  }

  return message;
}

export async function listOwnerDisclosureGrants() {
  const path = "/api/vault/disclosure-grants";
  const result = await vaultSignedFetch({ method: "GET", path, body: "" });
  if (!result.ok || !result.data?.success) {
    return {
      ok: false,
      status: result.status,
      error: parseOwnerDisclosureError(result.data, result.status),
      grants: [],
    };
  }

  return {
    ok: true,
    status: result.status,
    grants: result.data.grants || [],
  };
}

export async function getOwnerDisclosureGrant(grantId) {
  const path = `/api/vault/disclosure-grants/${encodeURIComponent(grantId)}`;
  const result = await vaultSignedFetch({ method: "GET", path, body: "" });
  if (!result.ok || !result.data?.success) {
    return {
      ok: false,
      status: result.status,
      error: parseOwnerDisclosureError(result.data, result.status),
      grant: null,
    };
  }

  return {
    ok: true,
    status: result.status,
    grant: result.data.grant || null,
  };
}

export async function getOwnerDisclosureGrantEvents(grantId) {
  const path = `/api/vault/disclosure-grants/${encodeURIComponent(grantId)}/events`;
  const result = await vaultSignedFetch({ method: "GET", path, body: "" });
  if (!result.ok || !result.data?.success) {
    return {
      ok: false,
      status: result.status,
      error: parseOwnerDisclosureError(result.data, result.status),
      events: [],
      chain: null,
    };
  }

  return {
    ok: true,
    status: result.status,
    events: result.data.events || [],
    chain: result.data.chain || null,
  };
}

export async function getOwnerDisclosureGrantReceipts(grantId) {
  const path = `/api/vault/disclosure-grants/${encodeURIComponent(grantId)}/receipts`;
  const result = await vaultSignedFetch({ method: "GET", path, body: "" });
  if (!result.ok || !result.data?.success) {
    return {
      ok: false,
      status: result.status,
      error: parseOwnerDisclosureError(result.data, result.status),
      receipts: [],
    };
  }

  return {
    ok: true,
    status: result.status,
    receipts: result.data.receipts || [],
  };
}

export async function revokeOwnerDisclosureGrant(grantId) {
  const path = `/api/vault/disclosure-grants/${encodeURIComponent(grantId)}/revoke`;
  const body = "{}";
  const result = await vaultSignedFetch({ method: "POST", path, body });
  if (!result.ok || !result.data?.success) {
    return {
      ok: false,
      status: result.status,
      error: parseOwnerDisclosureError(result.data, result.status),
      grant: null,
    };
  }

  return {
    ok: true,
    status: result.status,
    grant: result.data.grant || null,
    revokedSessions: Number(result.data.revoked_sessions || 0),
    idempotent: Boolean(result.data.idempotent),
  };
}

export async function loadOwnerDisclosureGrantDetail(grantId) {
  const [grantResult, eventsResult, receiptsResult] = await Promise.all([
    getOwnerDisclosureGrant(grantId),
    getOwnerDisclosureGrantEvents(grantId),
    getOwnerDisclosureGrantReceipts(grantId),
  ]);

  const error =
    grantResult.error ||
    eventsResult.error ||
    receiptsResult.error ||
    (!grantResult.grant ? "Disclosure grant not found." : null);

  return {
    ok: Boolean(grantResult.ok && eventsResult.ok && receiptsResult.ok && grantResult.grant),
    error,
    grant: grantResult.grant,
    events: eventsResult.events,
    chain: eventsResult.chain,
    receipts: receiptsResult.receipts,
  };
}

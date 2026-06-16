import crypto from "crypto";

export const DISCLOSURE_GRANT_TYPE_VERIFY_ONLY = "verify_only";
export const DISCLOSURE_GRANT_TYPE_SCOPED_VERIFY = "scoped_verify";
export const DISCLOSURE_GRANT_STATUS_ACTIVE = "active";
export const DISCLOSURE_GRANT_STATUS_REVOKED = "revoked";
export const DISCLOSURE_GRANT_STATUS_EXPIRED = "expired";
export const DISCLOSURE_GRANT_STATUS_ARCHIVED = "archived";
export const DISCLOSURE_ACCESS_SESSION_STATUS_ACTIVE = "active";
export const DISCLOSURE_ACCESS_SESSION_STATUS_REVOKED = "revoked";
export const DISCLOSURE_ACCESS_SESSION_STATUS_EXPIRED = "expired";
export const DISCLOSURE_MAX_GRANT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const DISCLOSURE_SESSION_TTL_MS = 15 * 60 * 1000;
export const DISCLOSURE_MAX_ACCESS_COUNT = 20;
export const DISCLOSURE_SESSION_HEADER = "x-prooforigin-disclosure-session";
export const DISCLOSURE_EVENT_GENESIS_HASH = crypto
  .createHash("sha256")
  .update("prooforigin-disclosure-grant-genesis-v1")
  .digest("hex");

export const DISCLOSURE_GRANT_EVENT_TYPES = Object.freeze({
  CREATED: "grant.created",
  RECIPIENT_ACCEPTED: "recipient.accepted",
  VERIFIED: "grant.verified",
  REVOKED: "grant.revoked",
  EXPIRED: "grant.expired",
  ACCESS_DENIED: "access.denied",
  ACCESS_RECEIPTED: "access.receipted",
  CUSTODY_BLOCKED: "custody.blocked",
});

export const DISCLOSURE_ACTOR_TYPES = Object.freeze({
  OWNER: "owner",
  RECIPIENT: "recipient",
  SYSTEM: "system",
  SENTINEL: "sentinel",
});

export const DISCLOSURE_EVENT_RESULTS = Object.freeze({
  SUCCESS: "success",
  DENIED: "denied",
  EXPIRED: "expired",
  REVOKED: "revoked",
});

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FORBIDDEN_METADATA_FRAGMENTS = [
  "ciphertext",
  "plaintext",
  "storage",
  "path",
  "secret",
  "token",
  "hash",
  "vault_id",
  "document_id",
  "migration_id",
  "recovery",
  "private",
  "auth",
];

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

function normalizeRequiredString(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

function parseJsonObject(bodyText) {
  const body = bodyText ? JSON.parse(bodyText) : {};
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Request body must be a JSON object.");
  }
  return body;
}

function normalizePurposeLabel(value) {
  const normalized = normalizeRequiredString(value, "purpose_label");
  if (normalized.length > 120) {
    throw new Error("purpose_label must be 120 characters or fewer.");
  }
  return normalized;
}

function normalizeRecipientChallenge(body) {
  if (Array.isArray(body.recipients)) {
    if (body.recipients.length !== 1) {
      throw new Error("Exactly one recipient is required.");
    }
    return normalizeRequiredString(
      body.recipients[0]?.recipient_challenge || body.recipients[0]?.challenge,
      "recipient_challenge"
    );
  }

  return normalizeRequiredString(
    body.recipient_challenge || body.recipient_secret || body.recipient?.challenge,
    "recipient_challenge"
  );
}

function normalizeExpiresAt(value, nowMs) {
  const expiresAt = normalizeRequiredString(value, "expires_at");
  const expiresMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresMs)) {
    throw new Error("expires_at must be a valid timestamp.");
  }
  if (expiresMs <= nowMs) {
    throw new Error("expires_at must be in the future.");
  }
  if (expiresMs - nowMs > DISCLOSURE_MAX_GRANT_TTL_MS) {
    throw new Error("expires_at exceeds the maximum disclosure grant TTL.");
  }
  return new Date(expiresMs).toISOString();
}

function normalizeMaxAccessCount(value) {
  const count = value === undefined || value === null ? 1 : Number(value);
  if (!Number.isInteger(count) || count < 1 || count > DISCLOSURE_MAX_ACCESS_COUNT) {
    throw new Error(`max_access_count must be an integer from 1 to ${DISCLOSURE_MAX_ACCESS_COUNT}.`);
  }
  return count;
}

export function validateCreateVerifyDisclosureGrantInput(bodyText, nowMs = Date.now()) {
  const body = parseJsonObject(bodyText);
  if (body.grant_type !== DISCLOSURE_GRANT_TYPE_VERIFY_ONLY) {
    throw new Error("Only verify_only disclosure grants are supported.");
  }
  const confirmationNonce = normalizeRequiredString(
    body.confirmation_nonce,
    "confirmation_nonce"
  );

  const recipientChallenge = normalizeRecipientChallenge(body);
  if (recipientChallenge.length < 16 || recipientChallenge.length > 256) {
    throw new Error("recipient_challenge must be 16 to 256 characters.");
  }

  return {
    grantType: DISCLOSURE_GRANT_TYPE_VERIFY_ONLY,
    purposeLabel: normalizePurposeLabel(body.purpose_label),
    confirmationNonce,
    recipientChallenge,
    expiresAt: normalizeExpiresAt(body.expires_at, nowMs),
    maxAccessCount: normalizeMaxAccessCount(body.max_access_count),
  };
}

export function hashDisclosureValue(value, namespace = "value") {
  return crypto
    .createHash("sha256")
    .update(`prooforigin-disclosure-${namespace}-v1:${String(value || "")}`)
    .digest("hex");
}

export function generateDisclosureToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function buildPublicHandleHash(handle) {
  return hashDisclosureValue(normalizeRequiredString(handle, "grant_handle"), "public-handle");
}

export function buildRecipientBindingHash(challenge) {
  return hashDisclosureValue(normalizeRequiredString(challenge, "recipient_challenge"), "recipient");
}

export function buildSessionTokenHash(token) {
  return hashDisclosureValue(normalizeRequiredString(token, "session_token"), "session");
}

export function buildOpaqueRefHash(value, namespace) {
  return hashDisclosureValue(normalizeRequiredString(value, namespace), namespace);
}

export function isDisclosureGrantExpired(grant, nowMs = Date.now()) {
  const expiresMs = Date.parse(String(grant?.expires_at || ""));
  return Number.isFinite(expiresMs) && expiresMs <= nowMs;
}

export function isDisclosureSessionExpired(session, nowMs = Date.now()) {
  const expiresMs = Date.parse(String(session?.expires_at || ""));
  return Number.isFinite(expiresMs) && expiresMs <= nowMs;
}

export function buildDisclosureAccessSession({ grantRef, recipientBindingHash, nowMs = Date.now() }) {
  const sessionToken = generateDisclosureToken();
  const createdAt = new Date(nowMs).toISOString();
  return {
    session: {
      grant_ref: grantRef,
      recipient_binding_hash: recipientBindingHash,
      session_token_hash: buildSessionTokenHash(sessionToken),
      status: DISCLOSURE_ACCESS_SESSION_STATUS_ACTIVE,
      expires_at: new Date(nowMs + DISCLOSURE_SESSION_TTL_MS).toISOString(),
      last_accessed_at: null,
      access_count: 0,
      created_at: createdAt,
      revoked_at: null,
    },
    sessionToken,
  };
}

function sanitizeEventMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return Object.entries(metadata).reduce((safe, [key, value]) => {
    const normalizedKey = String(key || "").toLowerCase();
    if (FORBIDDEN_METADATA_FRAGMENTS.some((fragment) => normalizedKey.includes(fragment))) {
      return safe;
    }
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      safe[key] = value;
    }
    return safe;
  }, {});
}

export function computeDisclosureEventHash({
  grantRef,
  eventType,
  actorType,
  result,
  reasonCode = "",
  previousEventHash = DISCLOSURE_EVENT_GENESIS_HASH,
  metadata = {},
  timestamp,
}) {
  const payload = [
    "prooforigin-disclosure-grant-event-v1",
    String(grantRef || ""),
    String(eventType || ""),
    String(actorType || ""),
    String(result || ""),
    String(reasonCode || ""),
    String(previousEventHash || DISCLOSURE_EVENT_GENESIS_HASH),
    stableStringify(sanitizeEventMetadata(metadata)),
    String(timestamp || ""),
  ].join("\n");

  return crypto.createHash("sha256").update(payload).digest("hex");
}

export function buildDisclosureGrantEventRecord({
  grantRef,
  eventType,
  actorType,
  result = DISCLOSURE_EVENT_RESULTS.SUCCESS,
  reasonCode = "",
  previousEventHash = DISCLOSURE_EVENT_GENESIS_HASH,
  metadata = {},
  timestamp = new Date().toISOString(),
}) {
  const safeMetadata = sanitizeEventMetadata(metadata);
  const eventHash = computeDisclosureEventHash({
    grantRef,
    eventType,
    actorType,
    result,
    reasonCode,
    previousEventHash,
    metadata: safeMetadata,
    timestamp,
  });

  return {
    grant_ref: grantRef,
    event_type: eventType,
    actor_type: actorType,
    result,
    reason_code: reasonCode || null,
    timestamp,
    previous_event_hash: previousEventHash,
    event_hash: eventHash,
    metadata: safeMetadata,
  };
}

function disclosureEventChainSortKey(event) {
  return {
    timestamp: String(event?.timestamp || ""),
    eventId: String(event?.event_id || event?.id || ""),
  };
}

export function compareDisclosureGrantEventsForChain(a, b) {
  const left = disclosureEventChainSortKey(a);
  const right = disclosureEventChainSortKey(b);
  const timestampCompare = left.timestamp.localeCompare(right.timestamp);
  if (timestampCompare !== 0) {
    return timestampCompare;
  }
  return left.eventId.localeCompare(right.eventId);
}

export function sortDisclosureGrantEventsForChain(events = []) {
  return [...events].sort(compareDisclosureGrantEventsForChain);
}

export function isDisclosureEventChainRetryableError(error) {
  if (!error) return false;
  if (error.code === "23505") return true;
  const message = String(error.message || error.details || "").toLowerCase();
  return (
    message.includes("event_chain_desync") ||
    message.includes("unique_violation") ||
    message.includes("disclosure_grant_events_grant_prev_hash")
  );
}

export function verifyDisclosureGrantEventChainRecords({ grantRef, events = [] }) {
  let previousEventHash = DISCLOSURE_EVENT_GENESIS_HASH;
  const orderedEvents = sortDisclosureGrantEventsForChain(events);

  for (const event of orderedEvents) {
    if (event.grant_ref !== grantRef) {
      return {
        verified: false,
        event_count: events.length,
        broken_at: event.event_id || event.id || null,
        reason: "Disclosure event grant_ref mismatch.",
      };
    }

    if (event.previous_event_hash !== previousEventHash) {
      return {
        verified: false,
        event_count: events.length,
        broken_at: event.event_id || event.id || null,
        reason: "Disclosure event previous_event_hash mismatch.",
      };
    }

    const expected = computeDisclosureEventHash({
      grantRef,
      eventType: event.event_type,
      actorType: event.actor_type,
      result: event.result,
      reasonCode: event.reason_code || "",
      previousEventHash,
      metadata: event.metadata || {},
      timestamp: event.timestamp,
    });

    if (event.event_hash !== expected) {
      return {
        verified: false,
        event_count: events.length,
        broken_at: event.event_id || event.id || null,
        reason: "Disclosure event_hash mismatch.",
      };
    }

    previousEventHash = event.event_hash;
  }

  return {
    verified: true,
    event_count: events.length,
    broken_at: null,
    reason: null,
  };
}

export function serializeOwnerDisclosureGrant(grant, { publicHandle = null } = {}) {
  if (!grant) return null;
  return {
    grant_id: grant.grant_id,
    policy_ref: grant.policy_ref || null,
    scope_type: grant.scope_type || null,
    grant_type: grant.grant_type,
    status: grant.status,
    purpose_label: grant.purpose_label,
    expires_at: grant.expires_at,
    access_count: Number(grant.access_count || 0),
    max_access_count: Number(grant.max_access_count || 0),
    created_at: grant.created_at,
    updated_at: grant.updated_at,
    revoked_at: grant.revoked_at || null,
    ...(publicHandle ? { public_handle: publicHandle } : {}),
  };
}

export function serializeOwnerDisclosureEvent(event) {
  if (!event) return null;
  return {
    event_id: event.event_id || event.id,
    event_type: event.event_type,
    actor_type: event.actor_type,
    result: event.result,
    reason_code: event.reason_code || null,
    timestamp: event.timestamp,
    metadata: sanitizeEventMetadata(event.metadata || {}),
  };
}

export function buildVerifyOnlyDisclosureResponse({ purposeLabel, expiresAt, now = new Date() }) {
  return {
    ok: true,
    grant_type: DISCLOSURE_GRANT_TYPE_VERIFY_ONLY,
    status: "verified",
    claim: purposeLabel
      ? `Owner-authorized verification is valid for ${purposeLabel}.`
      : "Owner-authorized verification is valid.",
    verified_at: now.toISOString(),
    expires_at: expiresAt,
  };
}

export function buildUniformDisclosureDeniedResponse() {
  return {
    ok: false,
    status: "unavailable",
    error: "Disclosure is unavailable.",
  };
}

export function isDisclosureAccessCapError(error) {
  return String(error?.message || error?.details || "").includes("access_cap_reached");
}

export function isDisclosureEventChainDesyncError(error) {
  return isDisclosureEventChainRetryableError(error);
}

export function validateGrantId(value) {
  const normalized = normalizeRequiredString(value, "grant_id").toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error("grant_id must be a valid UUID.");
  }
  return normalized;
}

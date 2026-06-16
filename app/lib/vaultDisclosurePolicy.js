import crypto from "crypto";
import {
  buildOpaqueRefHash,
  buildRecipientBindingHash,
  DISCLOSURE_GRANT_TYPE_SCOPED_VERIFY,
  DISCLOSURE_MAX_ACCESS_COUNT,
  DISCLOSURE_MAX_GRANT_TTL_MS,
  hashDisclosureValue,
} from "./vaultDisclosureGrant.js";

export { DISCLOSURE_GRANT_TYPE_SCOPED_VERIFY };

export const DISCLOSURE_POLICY_SCOPE_VAULT_CLAIM = "vault_claim";
export const DISCLOSURE_POLICY_SCOPE_DOCUMENT_REF = "document_ref";
export const DISCLOSURE_POLICY_SCOPE_IDENTITY_CLAIM = "identity_claim";

export const DISCLOSURE_POLICY_STATUS_DRAFT = "draft";
export const DISCLOSURE_POLICY_STATUS_ACTIVE = "active";
export const DISCLOSURE_POLICY_STATUS_REVOKED = "revoked";
export const DISCLOSURE_POLICY_STATUS_EXPIRED = "expired";
export const DISCLOSURE_POLICY_STATUS_ARCHIVED = "archived";

export const DISCLOSURE_RECIPIENT_BINDING_CHALLENGE_HASH = "challenge_hash";

export const DISCLOSURE_CONDITION_PHASE_CREATE = "create";
export const DISCLOSURE_CONDITION_PHASE_ACCEPT = "accept";
export const DISCLOSURE_CONDITION_PHASE_ACCESS = "access";

export const DISCLOSURE_PROTOCOL_INVARIANTS = Object.freeze({
  FAIL_CLOSED: "Any missing policy, custody state, scope, chain append, or receipt write fails closed.",
  UNIFORM_RECIPIENT_DENIAL:
    "Recipient failures return the same unavailable shape without distinguishing grant, session, or custody state.",
  HASH_ONLY_STORAGE:
    "Vault refs, document refs, recipient bindings, policy snapshots, custody snapshots, and receipts store hashes only.",
  IMMUTABLE_POLICY_SNAPSHOT:
    "Policy updates create new snapshots; receipts reference the exact snapshot hash used at access time.",
  LEGACY_VERIFY_ONLY:
    "Phase 9A verify_only grants without policy_ref continue using /verify and grant.verified events unchanged.",
  DETERMINISTIC_CHAIN_ORDER:
    "Event chain reads use timestamp ASC, event_id ASC; latest head uses timestamp DESC, event_id DESC.",
});

export const DISCLOSURE_CONDITION_REASON_CODES = Object.freeze({
  POLICY_INACTIVE: "policy_inactive",
  POLICY_EXPIRED: "policy_expired",
  GRANT_INACTIVE: "grant_inactive",
  GRANT_EXPIRED: "grant_expired",
  SESSION_REQUIRED: "session_required",
  SESSION_INVALID: "session_invalid",
  SESSION_EXPIRED: "session_expired",
  RECIPIENT_BINDING_MISMATCH: "recipient_binding_mismatch",
  ACCESS_CAP_REACHED: "access_cap_reached",
  CUSTODY_INELIGIBLE: "custody_ineligible",
  SCOPE_INVALID: "scope_invalid",
  POLICY_MISSING: "policy_missing",
});

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SUPPORTED_SCOPE_TYPES = new Set([
  DISCLOSURE_POLICY_SCOPE_VAULT_CLAIM,
  DISCLOSURE_POLICY_SCOPE_DOCUMENT_REF,
  DISCLOSURE_POLICY_SCOPE_IDENTITY_CLAIM,
]);

const SUPPORTED_GRANT_TYPES = new Set([
  DISCLOSURE_GRANT_TYPE_SCOPED_VERIFY,
]);

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

function normalizeScopeType(value) {
  const scopeType = normalizeRequiredString(value, "scope_type");
  if (!SUPPORTED_SCOPE_TYPES.has(scopeType)) {
    throw new Error("scope_type is not supported.");
  }
  return scopeType;
}

function normalizeGrantType(value) {
  const grantType = normalizeRequiredString(value, "grant_type");
  if (!SUPPORTED_GRANT_TYPES.has(grantType)) {
    throw new Error("Only scoped_verify disclosure policies are supported.");
  }
  return grantType;
}

function normalizeConditionProfile(rawProfile = {}) {
  if (!rawProfile || typeof rawProfile !== "object" || Array.isArray(rawProfile)) {
    throw new Error("condition_profile must be a JSON object.");
  }

  const profile = {
    not_before:
      rawProfile.not_before === undefined || rawProfile.not_before === null
        ? null
        : normalizeRequiredString(rawProfile.not_before, "condition_profile.not_before"),
    max_access_count: normalizeMaxAccessCount(rawProfile.max_access_count),
    require_custody_eligible:
      rawProfile.require_custody_eligible === undefined
        ? true
        : Boolean(rawProfile.require_custody_eligible),
  };

  if (profile.not_before) {
    const notBeforeMs = Date.parse(profile.not_before);
    if (!Number.isFinite(notBeforeMs)) {
      throw new Error("condition_profile.not_before must be a valid timestamp.");
    }
    profile.not_before = new Date(notBeforeMs).toISOString();
  }

  return profile;
}

export function buildDocumentScopeRefHash(documentId) {
  return buildOpaqueRefHash(normalizeRequiredString(documentId, "document_id"), "document-ref");
}

export function buildVaultClaimScopeRefHash(vaultRefHash) {
  return hashDisclosureValue(vaultRefHash, "vault-claim-scope");
}

export function resolvePolicyScopeRefHash({ scopeType, vaultRefHash, documentId = null }) {
  if (scopeType === DISCLOSURE_POLICY_SCOPE_VAULT_CLAIM) {
    return buildVaultClaimScopeRefHash(vaultRefHash);
  }

  if (scopeType === DISCLOSURE_POLICY_SCOPE_DOCUMENT_REF) {
    if (!documentId) {
      throw new Error("document_id is required for document_ref scope.");
    }
    return buildDocumentScopeRefHash(documentId);
  }

  throw new Error("scope_type is not supported.");
}

export function computeDisclosureConditionProfileHash(conditionProfile) {
  return hashDisclosureValue(stableStringify(conditionProfile), "condition-profile");
}

export function computeDisclosurePolicySnapshotHash(snapshot) {
  const payload = [
    "prooforigin-disclosure-policy-snapshot-v1",
    String(snapshot.policy_id || ""),
    String(snapshot.policy_version || 1),
    String(snapshot.vault_ref_hash || ""),
    String(snapshot.created_by_device_ref || ""),
    String(snapshot.scope_type || ""),
    String(snapshot.scope_ref_hash || ""),
    String(snapshot.grant_type || ""),
    String(snapshot.recipient_binding_mode || DISCLOSURE_RECIPIENT_BINDING_CHALLENGE_HASH),
    String(snapshot.recipient_binding_hash || ""),
    String(snapshot.purpose_label || ""),
    String(snapshot.condition_profile_hash || ""),
    String(snapshot.status || ""),
    String(snapshot.expires_at || ""),
  ].join("\n");

  return crypto.createHash("sha256").update(payload).digest("hex");
}

export function buildDisclosurePolicyRecord({
  policyId,
  policyVersion = 1,
  vaultRefHash,
  createdByDeviceRef,
  scopeType,
  scopeRefHash,
  grantType,
  recipientBindingHash,
  purposeLabel,
  conditionProfile,
  expiresAt,
  status = DISCLOSURE_POLICY_STATUS_ACTIVE,
}) {
  const conditionProfileHash = computeDisclosureConditionProfileHash(conditionProfile);
  const policySnapshotHash = computeDisclosurePolicySnapshotHash({
    policy_id: policyId,
    policy_version: policyVersion,
    vault_ref_hash: vaultRefHash,
    created_by_device_ref: createdByDeviceRef,
    scope_type: scopeType,
    scope_ref_hash: scopeRefHash,
    grant_type: grantType,
    recipient_binding_mode: DISCLOSURE_RECIPIENT_BINDING_CHALLENGE_HASH,
    recipient_binding_hash: recipientBindingHash,
    purpose_label: purposeLabel,
    condition_profile_hash: conditionProfileHash,
    status,
    expires_at: expiresAt,
  });

  return {
    policy_id: policyId,
    policy_version: policyVersion,
    vault_ref_hash: vaultRefHash,
    created_by_device_ref: createdByDeviceRef,
    scope_type: scopeType,
    scope_ref_hash: scopeRefHash,
    grant_type: grantType,
    recipient_binding_mode: DISCLOSURE_RECIPIENT_BINDING_CHALLENGE_HASH,
    recipient_binding_hash: recipientBindingHash,
    purpose_label: purposeLabel,
    condition_profile: conditionProfile,
    condition_profile_hash: conditionProfileHash,
    policy_snapshot_hash: policySnapshotHash,
    status,
    expires_at: expiresAt,
  };
}

export function validateCreateDisclosurePolicyInput(bodyText, nowMs = Date.now()) {
  const body = parseJsonObject(bodyText);
  const confirmationNonce = normalizeRequiredString(
    body.confirmation_nonce,
    "confirmation_nonce"
  );
  const scopeType = normalizeScopeType(body.scope_type);
  const grantType = normalizeGrantType(body.grant_type);
  const recipientChallenge = normalizeRecipientChallenge(body);

  if (recipientChallenge.length < 16 || recipientChallenge.length > 256) {
    throw new Error("recipient_challenge must be 16 to 256 characters.");
  }

  const expiresAt = normalizeExpiresAt(body.expires_at, nowMs);
  const conditionProfile = normalizeConditionProfile(body.condition_profile || {});

  return {
    confirmationNonce,
    scopeType,
    grantType,
    purposeLabel: normalizePurposeLabel(body.purpose_label),
    recipientChallenge,
    recipientBindingHash: buildRecipientBindingHash(recipientChallenge),
    expiresAt,
    conditionProfile,
    documentId:
      scopeType === DISCLOSURE_POLICY_SCOPE_DOCUMENT_REF
        ? normalizeRequiredString(body.document_id, "document_id").toLowerCase()
        : null,
    issueGrant: body.issue_grant !== false,
  };
}

export function isDisclosurePolicyExpired(policy, nowMs = Date.now()) {
  const expiresMs = Date.parse(String(policy?.expires_at || ""));
  return Number.isFinite(expiresMs) && expiresMs <= nowMs;
}

export function isDisclosurePolicyActive(policy, nowMs = Date.now()) {
  return (
    policy?.status === DISCLOSURE_POLICY_STATUS_ACTIVE && !isDisclosurePolicyExpired(policy, nowMs)
  );
}

export function evaluateDisclosureConditionPhase({
  phase,
  policy = null,
  grant = null,
  session = null,
  custodyEligibility = null,
  nowMs = Date.now(),
}) {
  const failures = [];

  if (phase === DISCLOSURE_CONDITION_PHASE_CREATE) {
    if (!policy?.scope_type) {
      failures.push(DISCLOSURE_CONDITION_REASON_CODES.SCOPE_INVALID);
    }
    if (
      policy?.scope_type === DISCLOSURE_POLICY_SCOPE_DOCUMENT_REF &&
      policy?.condition_profile?.require_custody_eligible &&
      custodyEligibility &&
      !custodyEligibility.eligible
    ) {
      failures.push(DISCLOSURE_CONDITION_REASON_CODES.CUSTODY_INELIGIBLE);
    }
    return { allowed: failures.length === 0, reasonCodes: failures };
  }

  if (!policy) {
    failures.push(DISCLOSURE_CONDITION_REASON_CODES.POLICY_MISSING);
  } else if (!isDisclosurePolicyActive(policy, nowMs)) {
    failures.push(
      isDisclosurePolicyExpired(policy, nowMs)
        ? DISCLOSURE_CONDITION_REASON_CODES.POLICY_EXPIRED
        : DISCLOSURE_CONDITION_REASON_CODES.POLICY_INACTIVE
    );
  } else if (
    policy.condition_profile?.not_before &&
    Date.parse(policy.condition_profile.not_before) > nowMs
  ) {
    failures.push(DISCLOSURE_CONDITION_REASON_CODES.POLICY_INACTIVE);
  }

  if (phase === DISCLOSURE_CONDITION_PHASE_ACCEPT) {
    if (
      session &&
      session.recipient_binding_hash &&
      policy?.recipient_binding_hash &&
      session.recipient_binding_hash !== policy.recipient_binding_hash
    ) {
      failures.push(DISCLOSURE_CONDITION_REASON_CODES.RECIPIENT_BINDING_MISMATCH);
    }
    return { allowed: failures.length === 0, reasonCodes: failures };
  }

  if (!grant) {
    failures.push(DISCLOSURE_CONDITION_REASON_CODES.GRANT_INACTIVE);
  } else if (grant.status !== "active") {
    failures.push(DISCLOSURE_CONDITION_REASON_CODES.GRANT_INACTIVE);
  }

  if (grant && Date.parse(String(grant.expires_at || "")) <= nowMs) {
    failures.push(DISCLOSURE_CONDITION_REASON_CODES.GRANT_EXPIRED);
  }

  if (phase === DISCLOSURE_CONDITION_PHASE_ACCESS) {
    if (!session) {
      failures.push(DISCLOSURE_CONDITION_REASON_CODES.SESSION_REQUIRED);
    } else if (session.status !== "active") {
      failures.push(DISCLOSURE_CONDITION_REASON_CODES.SESSION_INVALID);
    } else if (Date.parse(String(session.expires_at || "")) <= nowMs) {
      failures.push(DISCLOSURE_CONDITION_REASON_CODES.SESSION_EXPIRED);
    } else if (
      grant?.recipient_binding_hash &&
      session.recipient_binding_hash !== grant.recipient_binding_hash
    ) {
      failures.push(DISCLOSURE_CONDITION_REASON_CODES.RECIPIENT_BINDING_MISMATCH);
    }

    if (grant && Number(grant.access_count || 0) >= Number(grant.max_access_count || 0)) {
      failures.push(DISCLOSURE_CONDITION_REASON_CODES.ACCESS_CAP_REACHED);
    }

    if (
      policy?.condition_profile?.require_custody_eligible &&
      custodyEligibility &&
      !custodyEligibility.eligible
    ) {
      failures.push(DISCLOSURE_CONDITION_REASON_CODES.CUSTODY_INELIGIBLE);
    }
  }

  return { allowed: failures.length === 0, reasonCodes: failures };
}

export function serializeOwnerDisclosurePolicy(policy) {
  if (!policy) return null;
  return {
    policy_id: policy.policy_id,
    policy_version: Number(policy.policy_version || 1),
    scope_type: policy.scope_type,
    grant_type: policy.grant_type,
    recipient_binding_mode: policy.recipient_binding_mode,
    purpose_label: policy.purpose_label,
    condition_profile: policy.condition_profile || {},
    condition_profile_hash: policy.condition_profile_hash,
    policy_snapshot_hash: policy.policy_snapshot_hash,
    status: policy.status,
    expires_at: policy.expires_at,
    created_at: policy.created_at,
    revoked_at: policy.revoked_at || null,
  };
}

export function validatePolicyId(value) {
  const normalized = normalizeRequiredString(value, "policy_id").toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error("policy_id must be a valid UUID.");
  }
  return normalized;
}

export function buildScopedVerifyDisclosureResponse({
  purposeLabel,
  expiresAt,
  receipt,
  now = new Date(),
}) {
  return {
    ok: true,
    grant_type: DISCLOSURE_GRANT_TYPE_SCOPED_VERIFY,
    status: "accessed",
    claim: purposeLabel
      ? `Owner-authorized verification is valid for ${purposeLabel}.`
      : "Owner-authorized verification is valid.",
    accessed_at: now.toISOString(),
    expires_at: expiresAt,
    receipt: receipt
      ? {
          receipt_id: receipt.receipt_id,
          receipt_hash: receipt.receipt_hash,
          policy_snapshot_hash: receipt.policy_snapshot_hash,
          custody_snapshot_hash: receipt.custody_snapshot_hash,
          disclosure_digest: receipt.disclosure_digest,
          created_at: receipt.created_at,
        }
      : null,
  };
}

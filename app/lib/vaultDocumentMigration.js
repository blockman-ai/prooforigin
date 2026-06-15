export const VAULT_DOCUMENT_AAD_VERSIONS = Object.freeze({
  DEVICE_SCOPED_V1: 1,
  VAULT_SCOPED_V3: 3,
});

export const VAULT_DOCUMENT_AAD_VERSION_FIELD = "aad_version";
export const VAULT_DOCUMENT_AAD_VERSION_DEFAULT = VAULT_DOCUMENT_AAD_VERSIONS.DEVICE_SCOPED_V1;
export const VAULT_SCOPED_DOCUMENT_AAD_FORMAT_VERSION =
  VAULT_DOCUMENT_AAD_VERSIONS.VAULT_SCOPED_V3;
export const VAULT_SCOPED_DOCUMENT_AAD_PREFIX = `prooforigin-vault-document-aad-v${VAULT_SCOPED_DOCUMENT_AAD_FORMAT_VERSION}`;

/** @deprecated Use VAULT_SCOPED_DOCUMENT_AAD_FORMAT_VERSION. */
export const VAULT_SCOPED_DOCUMENT_AAD_VERSION = VAULT_SCOPED_DOCUMENT_AAD_FORMAT_VERSION;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTENT_TYPE_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;

export const VAULT_DOCUMENT_MIGRATION_STATES = Object.freeze({
  PENDING: "pending",
  UPLOADING: "uploading",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
});

export const VAULT_DOCUMENT_MIGRATION_STATE_VALUES = Object.freeze(
  Object.values(VAULT_DOCUMENT_MIGRATION_STATES)
);

export const VAULT_DOCUMENT_MIGRATION_FAILURE_REASONS = Object.freeze({
  DECRYPT_FAILED: "decrypt_failed",
  DOWNLOAD_FAILED: "download_failed",
  UPLOAD_FAILED: "upload_failed",
  SLOT_OCCUPIED: "slot_occupied",
  VERIFY_FAILED: "verify_failed",
  COMMIT_FAILED: "commit_failed",
  VAULT_MISMATCH: "vault_mismatch",
  USER_CANCELLED: "user_cancelled",
  UPLOAD_EXPIRED: "upload_expired",
});

export const VAULT_DOCUMENT_MIGRATION_SOURCE_RETIREMENT_STATES = Object.freeze({
  ACTIVE: "active",
  SOURCE_RETIRED: "source_retired",
});

export const VAULT_OWNERSHIP_KEY_STATES = Object.freeze({
  MISSING: "missing",
  ACTIVE: "active",
});

export const VAULT_OWNERSHIP_KEY_REGISTRATION_POLICIES = Object.freeze({
  TOFU_IMMUTABLE: "tofu_immutable",
});

export const VAULT_DOCUMENT_MIGRATION_TARGET_DOC_ID_POLICIES = Object.freeze({
  NEW_TARGET_DOC_ID: "new_target_doc_id",
});

export const VAULT_DOCUMENT_MIGRATION_TARGET_DOC_ID_POLICY =
  VAULT_DOCUMENT_MIGRATION_TARGET_DOC_ID_POLICIES.NEW_TARGET_DOC_ID;

export const VAULT_DOCUMENT_MIGRATION_UPLOAD_TIMEOUT_MS = 30 * 60 * 1000;

const ALLOWED_MIGRATION_STATE_TRANSITIONS = Object.freeze({
  [VAULT_DOCUMENT_MIGRATION_STATES.PENDING]: Object.freeze([
    VAULT_DOCUMENT_MIGRATION_STATES.UPLOADING,
  ]),
  [VAULT_DOCUMENT_MIGRATION_STATES.UPLOADING]: Object.freeze([
    VAULT_DOCUMENT_MIGRATION_STATES.COMPLETED,
    VAULT_DOCUMENT_MIGRATION_STATES.FAILED,
    VAULT_DOCUMENT_MIGRATION_STATES.CANCELLED,
  ]),
  [VAULT_DOCUMENT_MIGRATION_STATES.COMPLETED]: Object.freeze([]),
  [VAULT_DOCUMENT_MIGRATION_STATES.FAILED]: Object.freeze([]),
  [VAULT_DOCUMENT_MIGRATION_STATES.CANCELLED]: Object.freeze([]),
});

function normalizeRequiredString(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required.`);
  }

  return value.trim();
}

function normalizeUuid(value, name) {
  const normalized = normalizeRequiredString(value, name).toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error(`${name} must be a valid UUID.`);
  }

  return normalized;
}

function normalizeContentType(value) {
  const normalized = normalizeRequiredString(value, "content_type").toLowerCase();
  if (!CONTENT_TYPE_PATTERN.test(normalized)) {
    throw new Error("content_type must be a valid MIME type.");
  }

  return normalized;
}

export function isVaultDocumentMigrationState(value) {
  return VAULT_DOCUMENT_MIGRATION_STATE_VALUES.includes(value);
}

export function assertVaultDocumentMigrationState(value) {
  if (!isVaultDocumentMigrationState(value)) {
    throw new Error(
      `Invalid vault document migration state: ${String(value || "unknown")}.`
    );
  }

  return value;
}

export function canTransitionMigrationState(from, to) {
  const fromState = assertVaultDocumentMigrationState(from);
  const toState = assertVaultDocumentMigrationState(to);
  return ALLOWED_MIGRATION_STATE_TRANSITIONS[fromState].includes(toState);
}

export function assertMigrationStateTransition(from, to) {
  if (!canTransitionMigrationState(from, to)) {
    throw new Error(`Invalid vault document migration transition: ${from} -> ${to}.`);
  }

  return to;
}

export function canRetireMigrationSource({ migrationState, sourceRetirementState }) {
  const state = assertVaultDocumentMigrationState(migrationState);
  if (
    !Object.values(VAULT_DOCUMENT_MIGRATION_SOURCE_RETIREMENT_STATES).includes(
      sourceRetirementState
    )
  ) {
    throw new Error(
      `Invalid vault document source retirement state: ${String(
        sourceRetirementState || "unknown"
      )}.`
    );
  }

  return (
    state === VAULT_DOCUMENT_MIGRATION_STATES.COMPLETED &&
    sourceRetirementState === VAULT_DOCUMENT_MIGRATION_SOURCE_RETIREMENT_STATES.ACTIVE
  );
}

export function canRegisterVaultOwnershipKey({ existingPublicKey }) {
  return typeof existingPublicKey !== "string" || !existingPublicKey.trim();
}

export function assertVaultOwnershipKeyRegistrationAllowed({ existingPublicKey }) {
  if (!canRegisterVaultOwnershipKey({ existingPublicKey })) {
    throw new Error("Vault ownership public key is already registered and is immutable.");
  }

  return true;
}

export function isVaultDocumentMigrationUploadExpired(startedAt, now = Date.now()) {
  const startedAtMs =
    typeof startedAt === "number" ? startedAt : Date.parse(String(startedAt || ""));

  if (!Number.isFinite(startedAtMs)) {
    throw new Error("upload_started_at must be a valid timestamp.");
  }

  return now - startedAtMs > VAULT_DOCUMENT_MIGRATION_UPLOAD_TIMEOUT_MS;
}

export function validateVaultDocumentAadVersionBinding({ aad_version: aadVersion, vault_id: vaultId }) {
  if (!Object.values(VAULT_DOCUMENT_AAD_VERSIONS).includes(aadVersion)) {
    throw new Error("aad_version must be 1 or 3.");
  }

  if (aadVersion === VAULT_DOCUMENT_AAD_VERSIONS.VAULT_SCOPED_V3) {
    normalizeUuid(vaultId, "vault_id");
  }

  return true;
}

function normalizeOptionalTimestamp(value, name) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const timestampMs = typeof value === "number" ? value : Date.parse(String(value));
  if (!Number.isFinite(timestampMs)) {
    throw new Error(`${name} must be a valid timestamp.`);
  }

  return value;
}

function normalizeOptionalFailureReason(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const normalized = normalizeRequiredString(value, "failure_reason");
  if (!Object.values(VAULT_DOCUMENT_MIGRATION_FAILURE_REASONS).includes(normalized)) {
    throw new Error("failure_reason is invalid.");
  }

  return normalized;
}

export function validateVaultDocumentMigrationRecord(record = {}) {
  const vaultId = normalizeUuid(record.vault_id, "vault_id");
  const sourceDocumentId = normalizeUuid(record.source_document_id, "source_document_id");
  const sourceVaultDeviceId = normalizeUuid(
    record.source_vault_device_id,
    "source_vault_device_id"
  );
  const targetVaultDeviceId = normalizeUuid(
    record.target_vault_device_id,
    "target_vault_device_id"
  );
  const state = assertVaultDocumentMigrationState(record.state);
  const sourceRetirementState =
    record.source_retirement_state ||
    VAULT_DOCUMENT_MIGRATION_SOURCE_RETIREMENT_STATES.ACTIVE;
  const failureReason = normalizeOptionalFailureReason(record.failure_reason);
  const completedAt = normalizeOptionalTimestamp(record.completed_at, "completed_at");
  const sourceRetiredAt = normalizeOptionalTimestamp(record.source_retired_at, "source_retired_at");

  if (
    !Object.values(VAULT_DOCUMENT_MIGRATION_SOURCE_RETIREMENT_STATES).includes(
      sourceRetirementState
    )
  ) {
    throw new Error("source_retirement_state is invalid.");
  }

  const targetDocumentId = record.target_document_id
    ? normalizeUuid(record.target_document_id, "target_document_id")
    : null;

  if (targetDocumentId && targetDocumentId === sourceDocumentId) {
    throw new Error("target_document_id must be distinct from source_document_id.");
  }

  if (sourceVaultDeviceId === targetVaultDeviceId) {
    throw new Error("target_vault_device_id must differ from source_vault_device_id.");
  }

  if (state === VAULT_DOCUMENT_MIGRATION_STATES.COMPLETED) {
    if (!targetDocumentId || !completedAt || failureReason) {
      throw new Error(
        "completed migration requires target_document_id and completed_at without failure_reason."
      );
    }
  }

  if (state === VAULT_DOCUMENT_MIGRATION_STATES.FAILED) {
    if (
      !failureReason ||
      failureReason === VAULT_DOCUMENT_MIGRATION_FAILURE_REASONS.USER_CANCELLED ||
      completedAt
    ) {
      throw new Error(
        "failed migration requires a non-cancellation failure_reason without completed_at."
      );
    }
  }

  if (state === VAULT_DOCUMENT_MIGRATION_STATES.CANCELLED) {
    if (failureReason !== VAULT_DOCUMENT_MIGRATION_FAILURE_REASONS.USER_CANCELLED || completedAt) {
      throw new Error("cancelled migration requires user_cancelled without completed_at.");
    }
  }

  if (
    [VAULT_DOCUMENT_MIGRATION_STATES.PENDING, VAULT_DOCUMENT_MIGRATION_STATES.UPLOADING].includes(
      state
    ) &&
    (failureReason || completedAt)
  ) {
    throw new Error("non-terminal migration must not have failure_reason or completed_at.");
  }

  if (
    sourceRetirementState ===
      VAULT_DOCUMENT_MIGRATION_SOURCE_RETIREMENT_STATES.SOURCE_RETIRED &&
    (state !== VAULT_DOCUMENT_MIGRATION_STATES.COMPLETED || !sourceRetiredAt)
  ) {
    throw new Error("source_retired requires completed migration and source_retired_at.");
  }

  if (
    sourceRetirementState === VAULT_DOCUMENT_MIGRATION_SOURCE_RETIREMENT_STATES.ACTIVE &&
    sourceRetiredAt
  ) {
    throw new Error("active source retirement state must not have source_retired_at.");
  }

  return {
    vault_id: vaultId,
    source_document_id: sourceDocumentId,
    target_document_id: targetDocumentId,
    source_vault_device_id: sourceVaultDeviceId,
    target_vault_device_id: targetVaultDeviceId,
    state,
    failure_reason: failureReason,
    source_retirement_state: sourceRetirementState,
    completed_at: completedAt,
    source_retired_at: sourceRetiredAt,
  };
}

export function buildVaultScopedDocumentAad({ vaultId, docId, contentType }) {
  const normalizedVaultId = normalizeUuid(vaultId, "vault_id");
  const normalizedDocId = normalizeUuid(docId, "doc_id");
  const normalizedContentType = normalizeContentType(contentType);

  return [
    VAULT_SCOPED_DOCUMENT_AAD_PREFIX,
    `vault_id=${normalizedVaultId}`,
    `doc_id=${normalizedDocId}`,
    `content_type=${normalizedContentType}`,
  ].join("|");
}

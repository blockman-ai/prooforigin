const TERMINAL_MIGRATION_STATES = new Set(["completed", "failed", "cancelled"]);

function isSameVault(row, vaultId) {
  return !row?.vault_id || row.vault_id === vaultId;
}

function isRevoked(device) {
  return Boolean(device?.revoked_at);
}

function isDeleted(document) {
  return Boolean(document?.deleted_at);
}

function isRetired(document) {
  return Boolean(document?.source_retired_at);
}

function isCompromised(document) {
  return Boolean(document?.compromised_at);
}

function isCleanupPending(migration) {
  const cleanupState = String(migration?.metadata?.staging_cleanup_state || "").toLowerCase();
  return (
    TERMINAL_MIGRATION_STATES.has(migration?.state) &&
    (cleanupState === "pending" || cleanupState === "requested" || cleanupState === "failed")
  );
}

function isRetirementEligible(migration) {
  return (
    migration?.state === "completed" &&
    migration?.source_retirement_state === "active" &&
    !migration?.source_retired_at &&
    migration?.metadata?.source_retirement_eligible === true
  );
}

function statusLabelForMigration(migration) {
  if (migration?.state === "completed") {
    if (migration.source_retirement_state === "source_retired") {
      return "Completed, source retired";
    }
    if (migration?.metadata?.source_retirement_eligible) {
      return "Completed, source retirement available";
    }
    return "Completed";
  }
  if (migration?.state === "failed") return "Failed";
  if (migration?.state === "cancelled") return "Cancelled";
  if (migration?.state === "uploading") return "Upload in progress";
  return "Pending";
}

function custodyStateForDocument(document) {
  if (isRetired(document)) return "retired";
  if (isCompromised(document)) return "compromised";
  return "active";
}

function makeDeviceMap(devices) {
  const map = new Map();
  for (const device of devices) {
    if (device?.vault_device_id) {
      map.set(device.vault_device_id, device);
    }
  }
  return map;
}

function safeDevice(device) {
  return {
    device_public_id: device.device_public_id || null,
    created_at: device.created_at || null,
    last_seen_at: device.last_seen_at || null,
    verified: Boolean(device.verified),
    revoked: isRevoked(device),
  };
}

function safeDocument(document, deviceMap, index) {
  const device = deviceMap.get(document.vault_device_id);
  const retired = isRetired(document);
  const compromised = isCompromised(document);
  return {
    document_ref: `document_${index + 1}`,
    device_public_id: device?.device_public_id || null,
    active: !isDeleted(document) && !retired,
    retired,
    compromised,
    custody_state: custodyStateForDocument(document),
    label_present: Boolean(document.label_present),
    content_type_hint: document.content_type_hint || null,
    created_at: document.created_at || null,
    updated_at: document.updated_at || null,
  };
}

function safeMigration(migration, deviceMap, index) {
  const sourceDevice = deviceMap.get(migration.source_vault_device_id);
  const targetDevice = deviceMap.get(migration.target_vault_device_id);
  const cleanupState = migration.metadata?.staging_cleanup_state || null;
  return {
    migration_ref: `migration_${index + 1}`,
    state: migration.state,
    status_label: statusLabelForMigration(migration),
    source_device_public_id: sourceDevice?.device_public_id || null,
    target_device_public_id: targetDevice?.device_public_id || null,
    failure_reason: migration.failure_reason || null,
    cleanup_state: cleanupState,
    cleanup_pending: isCleanupPending(migration),
    retirement_state: migration.source_retirement_state || "active",
    retirement_eligible: isRetirementEligible(migration),
    source_retired: migration.source_retirement_state === "source_retired",
    created_at: migration.created_at || null,
    updated_at: migration.updated_at || null,
    completed_at: migration.completed_at || null,
  };
}

function buildPendingActions({ devices, documents, migrations }) {
  const actions = [];
  const unverifiedDeviceCount = devices.filter((device) => !isRevoked(device) && !device.verified).length;
  const cleanupPendingCount = migrations.filter(isCleanupPending).length;
  const retirementEligibleCount = migrations.filter(isRetirementEligible).length;
  const compromisedDocumentCount = documents.filter((document) => !isDeleted(document) && isCompromised(document)).length;

  if (unverifiedDeviceCount > 0) {
    actions.push({
      type: "ownership_verification_required",
      label: "Ownership verification required",
      severity: "warning",
      count: unverifiedDeviceCount,
    });
  }

  if (cleanupPendingCount > 0) {
    actions.push({
      type: "cleanup_pending",
      label: "Migration cleanup pending",
      severity: "info",
      count: cleanupPendingCount,
    });
  }

  if (retirementEligibleCount > 0) {
    actions.push({
      type: "retirement_eligible",
      label: "Source retirement eligible",
      severity: "info",
      count: retirementEligibleCount,
    });
  }

  if (compromisedDocumentCount > 0) {
    actions.push({
      type: "compromised_document_review",
      label: "Compromised document review required",
      severity: "critical",
      count: compromisedDocumentCount,
    });
  }

  return actions;
}

export function buildVaultCustodyMapSummary({
  vaultId,
  currentVaultDeviceId,
  devices = [],
  documents = [],
  migrations = [],
} = {}) {
  const scopedDevices = devices.filter((device) => isSameVault(device, vaultId));
  const scopedDocuments = documents.filter(
    (document) => isSameVault(document, vaultId) && !isDeleted(document)
  );
  const scopedMigrations = migrations.filter((migration) => isSameVault(migration, vaultId));
  const deviceMap = makeDeviceMap(scopedDevices);
  const currentDevice = deviceMap.get(currentVaultDeviceId);

  const activeDocuments = scopedDocuments.filter((document) => !isRetired(document)).length;
  const retiredDocuments = scopedDocuments.filter(isRetired).length;
  const compromisedDocuments = scopedDocuments.filter(isCompromised).length;
  const completedMigrations = scopedMigrations.filter((migration) => migration.state === "completed").length;
  const failedMigrations = scopedMigrations.filter((migration) => migration.state === "failed").length;
  const cleanupPending = scopedMigrations.filter(isCleanupPending).length;
  const retirementEligible = scopedMigrations.filter(isRetirementEligible).length;

  return {
    vault: {
      scope: "verified_vault",
      current_device_public_id: currentDevice?.device_public_id || null,
      summary: {
        active_documents: activeDocuments,
        retired_documents: retiredDocuments,
        compromised_documents: compromisedDocuments,
        verified_devices: scopedDevices.filter((device) => !isRevoked(device) && device.verified).length,
        revoked_devices: scopedDevices.filter(isRevoked).length,
        completed_migrations: completedMigrations,
        failed_migrations: failedMigrations,
        cleanup_pending: cleanupPending,
        retirement_eligible: retirementEligible,
      },
    },
    devices: scopedDevices.map(safeDevice),
    documents: scopedDocuments.map((document, index) => safeDocument(document, deviceMap, index)),
    migrations: scopedMigrations.map((migration, index) => safeMigration(migration, deviceMap, index)),
    pending_actions: buildPendingActions({
      devices: scopedDevices,
      documents: scopedDocuments,
      migrations: scopedMigrations,
    }),
    sentinel_summary: {
      migration_success_count: completedMigrations,
      migration_failure_count: failedMigrations,
      cleanup_pending_count: cleanupPending,
      retirement_pending_count: retirementEligible,
      compromised_document_count: compromisedDocuments,
    },
  };
}

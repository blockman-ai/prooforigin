const DOCUMENT_STATE_EVENT_KINDS = {
  created: "document.created",
  compromised: "document.compromised",
  deleted: "document.deleted",
};

const DOCUMENT_EVENT_TITLES = {
  "document.created": "Document created",
  "document.compromised": "Document marked compromised",
  "document.deleted": "Document deleted",
};

const MIGRATION_FAILURE_LABELS = {
  decrypt_failed: "Decryption failed",
  download_failed: "Download failed",
  upload_failed: "Upload failed",
  slot_occupied: "Destination slot occupied",
  verify_failed: "Verification failed",
  commit_failed: "Commit failed",
  vault_mismatch: "Vault mismatch",
  user_cancelled: "Cancelled by user",
  upload_expired: "Upload expired",
};

const DEFAULT_TIMELINE_LIMIT = 50;
const MAX_TIMELINE_LIMIT = 100;

function isSameVaultStrict(row, vaultId) {
  return row?.vault_id === vaultId;
}

function categoryForKind(kind) {
  return String(kind || "").split(".")[0] || "other";
}

export function formatTimelineDisplayDate(value) {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
      new Date(value)
    );
  } catch {
    return null;
  }
}

function humanMigrationFailure(reason) {
  if (!reason) return "Migration failed";
  return MIGRATION_FAILURE_LABELS[reason] || "Migration failed";
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

function makeDocumentRefMap(documents) {
  const map = new Map();
  documents.forEach((document, index) => {
    if (document?.id) {
      map.set(document.id, `document_${index + 1}`);
    }
  });
  return map;
}

function makeMigrationRefMap(migrations) {
  const map = new Map();
  migrations.forEach((migration, index) => {
    if (migration?.id) {
      map.set(migration.id, `migration_${index + 1}`);
    }
  });
  return map;
}

function buildTimelineEntry({
  kind,
  title,
  subtitle = null,
  occurredAt,
  severity = "info",
  devicePublicId = null,
  migrationRef = null,
  documentRef = null,
  groupId = null,
  groupRole = null,
}) {
  if (!kind || !title || !occurredAt) {
    return null;
  }

  return {
    kind,
    category: categoryForKind(kind),
    title,
    subtitle,
    occurred_at: occurredAt,
    display_date: formatTimelineDisplayDate(occurredAt),
    severity,
    device_public_id: devicePublicId,
    migration_ref: migrationRef,
    document_ref: documentRef,
    group_id: groupId,
    group_role: groupRole,
  };
}

function dedupeEntries(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = [
      entry.kind,
      entry.occurred_at,
      entry.migration_ref || "",
      entry.document_ref || "",
      entry.device_public_id || "",
    ].join("|");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildDocumentStateEntries({ documentStateEvents, documentRefById, deviceMap }) {
  const entries = [];

  for (const event of documentStateEvents) {
    const kind = DOCUMENT_STATE_EVENT_KINDS[event.event_type];
    if (!kind) {
      continue;
    }

    const documentRef = documentRefById.get(event.document_id) || null;
    entries.push(
      buildTimelineEntry({
        kind,
        title: DOCUMENT_EVENT_TITLES[kind],
        occurredAt: event.created_at,
        severity: kind === "document.compromised" ? "critical" : "info",
        documentRef,
      })
    );
  }

  return entries;
}

function buildDeviceEntries({ devices }) {
  const entries = [];

  for (const device of devices) {
    if (device.created_at) {
      entries.push(
        buildTimelineEntry({
          kind: "device.registered",
          title: "Device registered",
          subtitle: device.device_public_id || null,
          occurredAt: device.created_at,
          devicePublicId: device.device_public_id || null,
        })
      );
    }

    if (device.vault_id_bound_at) {
      entries.push(
        buildTimelineEntry({
          kind: "device.bound",
          title: "Device bound to vault",
          subtitle: device.device_public_id || null,
          occurredAt: device.vault_id_bound_at,
          devicePublicId: device.device_public_id || null,
        })
      );
    }

    if (device.revoked_at) {
      entries.push(
        buildTimelineEntry({
          kind: "device.revoked",
          title: "Device revoked",
          subtitle: device.device_public_id || null,
          occurredAt: device.revoked_at,
          severity: "warning",
          devicePublicId: device.device_public_id || null,
        })
      );
    }
  }

  return entries;
}

function buildOwnershipEntries({ ownershipKey, verifications, deviceMap }) {
  const entries = [];

  if (ownershipKey?.created_at) {
    entries.push(
      buildTimelineEntry({
        kind: "ownership.key_registered",
        title: "Ownership key registered",
        occurredAt: ownershipKey.created_at,
      })
    );
  }

  for (const verification of verifications) {
    const device = deviceMap.get(verification.vault_device_id);
    entries.push(
      buildTimelineEntry({
        kind: "ownership.verified",
        title: "Ownership verified",
        subtitle: device?.device_public_id || null,
        occurredAt: verification.verified_at,
        devicePublicId: device?.device_public_id || null,
      })
    );
  }

  return entries;
}

function buildMigrationEntries({ migrations, migrationRefById, deviceMap }) {
  const entries = [];

  for (const migration of migrations) {
    const migrationRef = migrationRefById.get(migration.id) || null;
    const sourceDevice = deviceMap.get(migration.source_vault_device_id);
    const targetDevice = deviceMap.get(migration.target_vault_device_id);
    const migrationSubtitle = `${sourceDevice?.device_public_id || "Source device"} to ${
      targetDevice?.device_public_id || "Target device"
    }`;
    const metadata = migration.metadata || {};
    const groupId = migrationRef;

    if (migration.created_at) {
      entries.push(
        buildTimelineEntry({
          kind: "migration.planned",
          title: "Migration planned",
          subtitle: migrationSubtitle,
          occurredAt: migration.created_at,
          migrationRef,
          groupId,
          groupRole: "start",
        })
      );
    }

    if (migration.upload_started_at) {
      entries.push(
        buildTimelineEntry({
          kind: "migration.upload_started",
          title: "Migration upload started",
          subtitle: migrationSubtitle,
          occurredAt: migration.upload_started_at,
          migrationRef,
          groupId,
          groupRole: "step",
        })
      );
    }

    if (metadata.staging_verified && metadata.staging_verified_at) {
      entries.push(
        buildTimelineEntry({
          kind: "migration.staging_verified",
          title: "Staging verified",
          subtitle: migrationSubtitle,
          occurredAt: metadata.staging_verified_at,
          migrationRef,
          groupId,
          groupRole: "step",
        })
      );
    }

    if (migration.state === "completed" && migration.completed_at) {
      entries.push(
        buildTimelineEntry({
          kind: "migration.committed",
          title: "Migrated to new device",
          subtitle: migrationSubtitle,
          occurredAt: migration.completed_at,
          migrationRef,
          groupId,
          groupRole: "milestone",
        })
      );
    }

    if (migration.state === "failed") {
      entries.push(
        buildTimelineEntry({
          kind: "migration.failed",
          title: humanMigrationFailure(migration.failure_reason),
          subtitle: migrationSubtitle,
          occurredAt: migration.updated_at || migration.created_at,
          severity: "warning",
          migrationRef,
          groupId,
          groupRole: "terminal",
        })
      );
    }

    const cleanupState = String(metadata.staging_cleanup_state || "").toLowerCase();
    if (
      migration.state === "completed" &&
      (cleanupState === "pending" || cleanupState === "requested")
    ) {
      entries.push(
        buildTimelineEntry({
          kind: "cleanup.pending",
          title: "Staging cleanup pending",
          subtitle: migrationSubtitle,
          occurredAt:
            metadata.staging_cleanup_requested_at || migration.completed_at || migration.updated_at,
          migrationRef,
          groupId,
          groupRole: "follow_up",
        })
      );
    }

    if (cleanupState === "deleted" && metadata.staging_cleanup_completed_at) {
      entries.push(
        buildTimelineEntry({
          kind: "cleanup.completed",
          title: "Cleanup completed",
          subtitle: "Migration staging removed",
          occurredAt: metadata.staging_cleanup_completed_at,
          migrationRef,
          groupId,
          groupRole: "follow_up",
        })
      );
    }

    if (cleanupState === "failed") {
      entries.push(
        buildTimelineEntry({
          kind: "cleanup.failed",
          title: "Cleanup failed",
          subtitle: migrationSubtitle,
          occurredAt:
            metadata.staging_cleanup_completed_at || migration.updated_at || migration.completed_at,
          severity: "warning",
          migrationRef,
          groupId,
          groupRole: "follow_up",
        })
      );
    }

    if (
      migration.state === "completed" &&
      metadata.source_retirement_eligible &&
      metadata.source_retirement_not_before &&
      migration.source_retirement_state === "active" &&
      !migration.source_retired_at
    ) {
      entries.push(
        buildTimelineEntry({
          kind: "retirement.eligible",
          title: "Source retirement available",
          subtitle: sourceDevice?.device_public_id || null,
          occurredAt: metadata.source_retirement_not_before,
          migrationRef,
          groupId,
          groupRole: "follow_up",
        })
      );
    }

    if (migration.source_retired_at && migration.source_retirement_state === "source_retired") {
      entries.push(
        buildTimelineEntry({
          kind: "retirement.completed",
          title: "Source retired",
          subtitle: sourceDevice?.device_public_id || null,
          occurredAt: migration.source_retired_at,
          migrationRef,
          groupId,
          groupRole: "follow_up",
        })
      );
    }
  }

  return entries;
}

function buildMigrationGroups(entries, migrations, migrationRefById, deviceMap) {
  const groups = [];

  for (const migration of migrations) {
    const migrationRef = migrationRefById.get(migration.id);
    if (!migrationRef) {
      continue;
    }

    const groupEntries = entries.filter((entry) => entry.group_id === migrationRef);
    if (groupEntries.length === 0) {
      continue;
    }

    const targetDevice = deviceMap.get(migration.target_vault_device_id);
    const targetLabel = targetDevice?.device_public_id || "target device";

    groups.push({
      group_id: migrationRef,
      title: `Migration to ${targetLabel}`,
      started_at:
        groupEntries.find((entry) => entry.group_role === "start")?.occurred_at ||
        groupEntries[groupEntries.length - 1]?.occurred_at ||
        null,
      completed_at:
        groupEntries.find((entry) => entry.kind === "migration.committed")?.occurred_at || null,
      entry_refs: groupEntries.map((entry) => entry.entry_ref).filter(Boolean),
    });
  }

  return groups;
}

function buildHealthMarkers({ entries }) {
  const markers = [];
  const kinds = new Set(entries.map((entry) => entry.kind));

  if (kinds.has("migration.failed")) {
    markers.push({
      kind: "migration_failures_present",
      label: "Recent migration failures detected",
      severity: "warning",
    });
  }

  if (kinds.has("cleanup.pending")) {
    markers.push({
      kind: "cleanup_backlog",
      label: "Staging cleanup still pending",
      severity: "info",
    });
  }

  if (kinds.has("document.compromised")) {
    markers.push({
      kind: "compromised_active",
      label: "Compromised document requires review",
      severity: "critical",
    });
  }

  return markers.slice(0, 3);
}

function assignEntryRefs(entries) {
  return entries.map((entry, index) => ({
    entry_ref: `entry_${index + 1}`,
    ...entry,
  }));
}

export function normalizeTimelineLimit(limit) {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TIMELINE_LIMIT;
  }
  return Math.min(Math.floor(parsed), MAX_TIMELINE_LIMIT);
}

export function buildVaultCustodyTimeline({
  vaultId,
  currentVaultDeviceId,
  devices = [],
  documents = [],
  migrations = [],
  documentStateEvents = [],
  ownershipVerifications = [],
  ownershipKey = null,
  limit = DEFAULT_TIMELINE_LIMIT,
} = {}) {
  const scopedDevices = devices.filter((device) => isSameVaultStrict(device, vaultId));
  const scopedDocuments = documents.filter((document) => isSameVaultStrict(document, vaultId));
  const scopedMigrations = migrations.filter((migration) => isSameVaultStrict(migration, vaultId));
  const scopedVerifications = ownershipVerifications.filter((verification) =>
    isSameVaultStrict(verification, vaultId)
  );

  const deviceMap = makeDeviceMap(scopedDevices);
  const documentRefById = makeDocumentRefMap(scopedDocuments);
  const migrationRefById = makeMigrationRefMap(scopedMigrations);
  const currentDevice = deviceMap.get(currentVaultDeviceId);

  const rawEntries = dedupeEntries(
    [
      ...buildDocumentStateEntries({ documentStateEvents, documentRefById, deviceMap }),
      ...buildDeviceEntries({ devices: scopedDevices }),
      ...buildOwnershipEntries({
        ownershipKey: ownershipKey?.vault_id === vaultId ? ownershipKey : null,
        verifications: scopedVerifications,
        deviceMap,
      }),
      ...buildMigrationEntries({ migrations: scopedMigrations, migrationRefById, deviceMap }),
    ].filter(Boolean)
  ).sort((left, right) => new Date(right.occurred_at) - new Date(left.occurred_at));

  const timelineLimit = normalizeTimelineLimit(limit);
  const entriesWithRefs = assignEntryRefs(rawEntries);
  const boundedEntries = entriesWithRefs.slice(0, timelineLimit);
  const groups = buildMigrationGroups(
    entriesWithRefs,
    scopedMigrations,
    migrationRefById,
    deviceMap
  );

  return {
    timeline: {
      scope: "verified_vault",
      current_device_public_id: currentDevice?.device_public_id || null,
      entries: boundedEntries,
      groups,
      health_markers: buildHealthMarkers({ entries: entriesWithRefs }),
    },
  };
}

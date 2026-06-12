import { formatVaultCreatedAt } from "./vaultGenesis";

export const VAULT_TIMELINE_EVENT_TYPES = {
  GENESIS: "genesis",
  CREATED: "created",
  VIEW_STARTED: "view_started",
  VIEW_ENDED: "view_ended",
  VIEWED: "viewed",
  COMPROMISED: "compromised",
  DELETED: "deleted",
};

const TIMELINE_LABELS = {
  [VAULT_TIMELINE_EVENT_TYPES.GENESIS]: "Genesis",
  [VAULT_TIMELINE_EVENT_TYPES.CREATED]: "Created",
  [VAULT_TIMELINE_EVENT_TYPES.VIEW_STARTED]: "View Started",
  [VAULT_TIMELINE_EVENT_TYPES.VIEW_ENDED]: "View Ended",
  [VAULT_TIMELINE_EVENT_TYPES.VIEWED]: "Viewed",
  [VAULT_TIMELINE_EVENT_TYPES.COMPROMISED]: "Compromised",
  [VAULT_TIMELINE_EVENT_TYPES.DELETED]: "Deleted",
};

const TIMELINE_VARIANTS = {
  [VAULT_TIMELINE_EVENT_TYPES.GENESIS]: "genesis",
  [VAULT_TIMELINE_EVENT_TYPES.CREATED]: "created",
  [VAULT_TIMELINE_EVENT_TYPES.VIEW_STARTED]: "view",
  [VAULT_TIMELINE_EVENT_TYPES.VIEW_ENDED]: "view",
  [VAULT_TIMELINE_EVENT_TYPES.VIEWED]: "view",
  [VAULT_TIMELINE_EVENT_TYPES.COMPROMISED]: "compromised",
  [VAULT_TIMELINE_EVENT_TYPES.DELETED]: "deleted",
};

export function formatVaultTimelineEventLabel(eventType) {
  return TIMELINE_LABELS[eventType] || "Event";
}

export function getVaultTimelineEventVariant(eventType) {
  return TIMELINE_VARIANTS[eventType] || "default";
}

export function formatVaultTimelineHash(hash, head = 10, tail = 6) {
  if (!hash || typeof hash !== "string") return null;
  if (hash.length <= head + tail + 3) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

function formatDurationMs(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 0) return null;
  if (durationMs < 1000) return `${Math.round(durationMs)} ms`;
  if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(1)} s`;
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1000);
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

export function buildVaultTimelineDetail(event) {
  if (!event) return null;

  if (event.kind === VAULT_TIMELINE_EVENT_TYPES.GENESIS) {
    return event.subtitle || null;
  }

  const metadata = event.metadata || {};
  const details = [];

  if (event.event_type === VAULT_TIMELINE_EVENT_TYPES.VIEW_ENDED) {
    const duration =
      metadata.server_duration_ms ?? metadata.duration_ms ?? metadata.client_duration_ms;
    const formatted = formatDurationMs(Number(duration));
    if (formatted) {
      details.push(`Duration ${formatted}`);
    }
  }

  if (metadata.view_session_id) {
    details.push(`Session ${formatVaultTimelineHash(metadata.view_session_id, 8, 4)}`);
  }

  return details.length > 0 ? details.join(" · ") : null;
}

export function buildVaultTimelineEntries({ genesis, events = [] }) {
  const entries = [];

  if (genesis?.vault_created_at) {
    entries.push({
      id: `genesis-${genesis.vault_id}`,
      kind: VAULT_TIMELINE_EVENT_TYPES.GENESIS,
      event_type: VAULT_TIMELINE_EVENT_TYPES.GENESIS,
      label: formatVaultTimelineEventLabel(VAULT_TIMELINE_EVENT_TYPES.GENESIS),
      created_at: genesis.vault_created_at,
      state_hash: genesis.vault_genesis_hash,
      subtitle: `Vault ${formatVaultTimelineHash(genesis.vault_id, 8, 4) || "sealed"}`,
      metadata: {},
    });
  }

  for (const event of events) {
    if (!event?.event_type || !event?.created_at) continue;

    entries.push({
      id: event.id,
      kind: event.event_type,
      event_type: event.event_type,
      label: formatVaultTimelineEventLabel(event.event_type),
      created_at: event.created_at,
      state_hash: event.state_hash,
      metadata: event.metadata || {},
    });
  }

  entries.sort((left, right) => new Date(right.created_at) - new Date(left.created_at));

  return entries;
}

export function formatVaultTimelineTimestamp(value) {
  return formatVaultCreatedAt(value);
}

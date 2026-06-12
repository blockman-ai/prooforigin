import { isGuideOpenAIConfigured } from "./guideOpenAI.js";
import { isSupabaseAdminConfigured, getSupabaseAdmin } from "./supabaseAdmin.js";
import {
  isVaultAdminConfigured,
  createVaultAdminClient,
  VAULT_DEVICE_REGISTRATIONS_TABLE,
  VAULT_DOCUMENTS_TABLE,
  VAULT_REQUEST_NONCES_TABLE,
} from "./vaultAdmin.js";

export const SENTINEL_SNAPSHOT_VERSION = "s0";

const VAULT_STATE_EVENTS_TABLE = "vault_document_state_events";
const IDENTITY_CARDS_TABLE = "identity_cards";
const IDENTITY_CARD_STATE_EVENTS_TABLE = "identity_card_state_events";

export const EMPTY_VAULT_METRICS = {
  configured: false,
  active_documents: null,
  compromised_documents: null,
  active_devices: null,
  revoked_devices: null,
  state_events: null,
};

export const EMPTY_TRUST_PASS_METRICS = {
  configured: false,
  active_cards: null,
  revoked_cards: null,
  expired_cards: null,
  suspicious_cards: null,
  state_events: null,
};

export const EMPTY_STORAGE_METRICS = {
  configured: false,
  active_document_count: null,
  storage_object_count: null,
  orphan_count: null,
  missing_ciphertext_count: null,
  bucket_public: null,
};

export const EMPTY_REPLAY_METRICS = {
  configured: false,
  expired_nonce_count: null,
  active_nonce_count: null,
};

export const EMPTY_GUIDE_METRICS = {
  openai_configured: false,
};

export async function countTableRows(supabase, table, applyFilters = (query) => query) {
  let query = supabase.from(table).select("*", { count: "exact", head: true });
  query = applyFilters(query);
  const { count, error } = await query;

  if (error) {
    return null;
  }

  return count ?? 0;
}

export async function collectVaultMetrics(supabase) {
  if (!supabase) {
    return { ...EMPTY_VAULT_METRICS };
  }

  const [
    active_documents,
    compromised_documents,
    active_devices,
    revoked_devices,
    state_events,
  ] = await Promise.all([
    countTableRows(supabase, VAULT_DOCUMENTS_TABLE, (query) => query.is("deleted_at", null)),
    countTableRows(supabase, VAULT_DOCUMENTS_TABLE, (query) =>
      query.is("deleted_at", null).not("compromised_at", "is", null)
    ),
    countTableRows(supabase, VAULT_DEVICE_REGISTRATIONS_TABLE, (query) =>
      query.is("revoked_at", null)
    ),
    countTableRows(supabase, VAULT_DEVICE_REGISTRATIONS_TABLE, (query) =>
      query.not("revoked_at", "is", null)
    ),
    countTableRows(supabase, VAULT_STATE_EVENTS_TABLE),
  ]);

  return {
    configured: true,
    active_documents,
    compromised_documents,
    active_devices,
    revoked_devices,
    state_events,
  };
}

export async function collectTrustPassMetrics(supabase) {
  if (!supabase) {
    return { ...EMPTY_TRUST_PASS_METRICS };
  }

  const [active_cards, revoked_cards, expired_cards, suspicious_cards, state_events] =
    await Promise.all([
      countTableRows(supabase, IDENTITY_CARDS_TABLE, (query) =>
        query.eq("trust_state", "active")
      ),
      countTableRows(supabase, IDENTITY_CARDS_TABLE, (query) =>
        query.eq("trust_state", "revoked")
      ),
      countTableRows(supabase, IDENTITY_CARDS_TABLE, (query) =>
        query.eq("trust_state", "expired")
      ),
      countTableRows(supabase, IDENTITY_CARDS_TABLE, (query) =>
        query.eq("trust_state", "suspicious")
      ),
      countTableRows(supabase, IDENTITY_CARD_STATE_EVENTS_TABLE),
    ]);

  return {
    configured: true,
    active_cards,
    revoked_cards,
    expired_cards,
    suspicious_cards,
    state_events,
  };
}

export async function collectReplayMetrics(supabase) {
  if (!supabase) {
    return { ...EMPTY_REPLAY_METRICS };
  }

  const now = new Date().toISOString();
  const [expired_nonce_count, active_nonce_count] = await Promise.all([
    countTableRows(supabase, VAULT_REQUEST_NONCES_TABLE, (query) => query.lt("expires_at", now)),
    countTableRows(supabase, VAULT_REQUEST_NONCES_TABLE, (query) => query.gte("expires_at", now)),
  ]);

  return {
    configured: true,
    expired_nonce_count,
    active_nonce_count,
  };
}

export function buildStorageMetricsFromHealthReport(healthReport) {
  if (!healthReport?.storage_audit) {
    return { ...EMPTY_STORAGE_METRICS };
  }

  return {
    configured: Boolean(healthReport.vault?.admin_configured),
    active_document_count: healthReport.storage_audit.active_document_count,
    storage_object_count: healthReport.storage_audit.storage_object_count,
    orphan_count: healthReport.storage_audit.orphan_count,
    missing_ciphertext_count: healthReport.storage_audit.missing_ciphertext_count,
    bucket_public: healthReport.vault?.bucket_public ?? null,
  };
}

export function buildSentinelSnapshotFromParts({
  timestamp = new Date().toISOString(),
  health = { status: "unknown", blockers: [] },
  vault = EMPTY_VAULT_METRICS,
  trust_pass = EMPTY_TRUST_PASS_METRICS,
  storage = EMPTY_STORAGE_METRICS,
  replay = EMPTY_REPLAY_METRICS,
  guide = EMPTY_GUIDE_METRICS,
} = {}) {
  return {
    service: "prooforigin-sentinel",
    version: SENTINEL_SNAPSHOT_VERSION,
    timestamp,
    health,
    vault,
    trust_pass,
    storage,
    replay,
    guide,
  };
}

export async function buildSentinelSnapshot({
  includeStorageAudit = true,
  loadHealthReport = null,
  getSupabase = getSupabaseAdmin,
  getVaultClient = () =>
    isVaultAdminConfigured() ? createVaultAdminClient() : getSupabaseAdmin(),
} = {}) {
  const resolveHealthReport =
    loadHealthReport ??
    (await import("./productionHealth.js")).buildProofOriginHealthReport;
  const healthReport = await resolveHealthReport({ includeStorageAudit });
  const guide = {
    openai_configured: healthReport.guide?.openai_configured ?? isGuideOpenAIConfigured(),
  };

  const health = {
    status: healthReport.status ?? "unknown",
    blockers: healthReport.blockers ?? [],
  };

  if (!isSupabaseAdminConfigured()) {
    return buildSentinelSnapshotFromParts({
      timestamp: healthReport.timestamp,
      health,
      guide,
    });
  }

  const supabase = getSupabase();
  const vaultClient = getVaultClient();

  const [vault, trust_pass, replay] = await Promise.all([
    collectVaultMetrics(vaultClient),
    collectTrustPassMetrics(supabase),
    isVaultAdminConfigured() ? collectReplayMetrics(vaultClient) : Promise.resolve({ ...EMPTY_REPLAY_METRICS }),
  ]);

  const storage = buildStorageMetricsFromHealthReport(healthReport);

  if (!isVaultAdminConfigured() && healthReport.nonces?.expired_nonce_count != null) {
    replay.expired_nonce_count = healthReport.nonces.expired_nonce_count;
  }

  return buildSentinelSnapshotFromParts({
    timestamp: healthReport.timestamp,
    health,
    vault: {
      ...vault,
      configured: vault.configured && Boolean(healthReport.vault?.admin_configured),
    },
    trust_pass: {
      ...trust_pass,
      configured: trust_pass.configured && healthReport.supabase?.configured,
    },
    storage,
    replay: {
      ...replay,
      configured: replay.configured || healthReport.nonces?.expired_nonce_count != null,
      expired_nonce_count:
        replay.expired_nonce_count ?? healthReport.nonces?.expired_nonce_count ?? null,
    },
    guide,
  });
}

import { getSupabaseAdmin, isSupabaseAdminConfigured } from "./supabaseAdmin.js";

export const SENTINEL_COUNTERS_TABLE = "sentinel_counters";

export const SENTINEL_COUNTER_PREFIXES = [
  "vault.auth.",
  "vault.migration.discovery.",
  "vault.migration.planning.",
  "vault.migration.execution.",
  "vault.ownership.",
  "guide.",
  "trust.verify.",
  "trust.voice_link.",
];

export const SENTINEL_OPERATIONAL_COUNTER_KEYS = new Set([
  "guide.request.total",
  "guide.mode.openai",
  "guide.mode.deterministic",
  "guide.refusal.prompt_injection",
  "guide.refusal.secret_request",
  "guide.refusal.empty_question",
  "guide.rate_limited",
  "guide.output_filter.rejected",
  "trust.verify.success",
  "trust.verify.invalid_code",
  "trust.verify.card_not_found",
  "trust.verify.revoked",
  "trust.verify.expired",
  "trust.verify.rate_limited",
  "trust.verify.server_error",
  "trust.voice_link.success",
  "trust.voice_link.invalid_credentials",
  "trust.voice_link.not_found",
  "trust.voice_link.already_linked",
  "trust.voice_link.rate_limited",
  "trust.voice_link.server_error",
  "trust.voice_link.unlink.success",
  "vault.auth.replay_rejected",
  "vault.auth.replay_expired_nonce",
  "vault.auth.signature_failed",
  "vault.auth.missing_headers",
  "vault.auth.device_not_registered",
  "vault.auth.rate_limited",
  "vault.migration.discovery.request_total",
  "vault.migration.discovery.success_total",
  "vault.migration.discovery.unbound_device_total",
  "vault.migration.discovery.ownership_key_absent_total",
  "vault.migration.discovery.error_total",
  "vault.migration.planning.request_total",
  "vault.migration.planning.created_total",
  "vault.migration.planning.unverified_device_total",
  "vault.migration.planning.vault_mismatch_total",
  "vault.migration.planning.error_total",
  "vault.migration.execution.source_url.request_total",
  "vault.migration.execution.source_url.issued_total",
  "vault.migration.execution.source_url.rejected_total",
  "vault.migration.execution.staging_upload.request_total",
  "vault.migration.execution.staging_upload.issued_total",
  "vault.migration.execution.staging_upload.rejected_total",
  "vault.migration.execution.staging_verify.request_total",
  "vault.migration.execution.staging_verify.success_total",
  "vault.migration.execution.staging_verify.failed_total",
  "vault.migration.execution.commit.request_total",
  "vault.migration.execution.commit.success_total",
  "vault.migration.execution.commit.rejected_total",
  "vault.migration.execution.commit.slot_occupied_total",
  "vault.migration.execution.commit.rollback_total",
  "vault.migration.execution.commit.failed_total",
  "vault.migration.execution.cleanup.request_total",
  "vault.migration.execution.cleanup.staging.deleted_total",
  "vault.migration.execution.cleanup.staging.missing_total",
  "vault.migration.execution.cleanup.staging.failed_total",
  "vault.migration.execution.cleanup.rejected_total",
  "vault.migration.execution.retirement_eligible.total",
  "vault.migration.execution.retirement.request_total",
  "vault.migration.execution.retirement.success_total",
  "vault.migration.execution.retirement.rejected_total",
  "vault.migration.execution.retirement.idempotent_total",
  "vault.migration.execution.retirement.not_before_rejected_total",
  "vault.migration.execution.retirement.target_invalid_total",
  "vault.migration.execution.retirement.source_invalid_total",
  "vault.migration.execution.error_total",
  "vault.ownership.challenge.request_total",
  "vault.ownership.challenge.created_total",
  "vault.ownership.challenge.missing_key_total",
  "vault.ownership.challenge.error_total",
  "vault.ownership.verify.request_total",
  "vault.ownership.verify.success_total",
  "vault.ownership.verify.expired_total",
  "vault.ownership.verify.replay_rejected_total",
  "vault.ownership.verify.signature_failed_total",
  "vault.ownership.verify.vault_mismatch_total",
  "vault.ownership.verify.device_mismatch_total",
  "vault.ownership.verify.action_mismatch_total",
  "vault.ownership.verify.error_total",
]);

const COUNTER_KEY_PATTERN = /^[a-z0-9]+(?:[._][a-z0-9]+)*$/;

const FORBIDDEN_COUNTER_KEY_FRAGMENTS = [
  "pin",
  "mvk",
  "recovery",
  "phrase",
  "secret",
  "password",
  "token",
  "apikey",
  "api_key",
  "localstorage",
  "sessionstorage",
  "ciphertext",
  "plaintext",
  "seed",
  "question",
  "email",
  "user_id",
  "userid",
  "ip",
  "ipv4",
  "ipv6",
  "raw",
  "service_role",
  "dts_master",
  "openai",
];

export function validateSentinelCounterKey(counterKey) {
  const key = String(counterKey || "").trim();

  if (!key) {
    return { valid: false, error: "counter_key_required" };
  }

  if (key.length > 120) {
    return { valid: false, error: "counter_key_too_long" };
  }

  const allowedPrefix = SENTINEL_COUNTER_PREFIXES.find((prefix) => key.startsWith(prefix));
  if (!allowedPrefix) {
    return { valid: false, error: "counter_key_prefix_not_allowed" };
  }

  if (SENTINEL_OPERATIONAL_COUNTER_KEYS.has(key)) {
    return { valid: true, prefix: allowedPrefix };
  }

  const suffix = key.slice(allowedPrefix.length);
  if (!suffix || !COUNTER_KEY_PATTERN.test(suffix)) {
    return { valid: false, error: "counter_key_format_invalid" };
  }

  const normalized = key.toLowerCase();
  for (const fragment of FORBIDDEN_COUNTER_KEY_FRAGMENTS) {
    if (normalized.includes(fragment)) {
      return { valid: false, error: "counter_key_forbidden_fragment" };
    }
  }

  return { valid: true, prefix: allowedPrefix };
}

export function validateSentinelCounterPrefix(prefix) {
  const value = String(prefix || "").trim();
  if (!value) {
    return { valid: true };
  }

  const allowed = SENTINEL_COUNTER_PREFIXES.some(
    (allowedPrefix) => allowedPrefix.startsWith(value) || value.startsWith(allowedPrefix)
  );

  if (!allowed) {
    return { valid: false, error: "counter_prefix_not_allowed" };
  }

  return { valid: true };
}

function mapCounterRow(row) {
  if (!row) {
    return null;
  }

  return {
    counter_key: row.counter_key,
    count: Number(row.count ?? 0),
    first_seen_at: row.first_seen_at,
    last_seen_at: row.last_seen_at,
  };
}

export async function incrementSentinelCounter(counterKey, amount = 1, { supabase = null } = {}) {
  const validation = validateSentinelCounterKey(counterKey);
  if (!validation.valid) {
    return { ok: false, error: validation.error };
  }

  const incrementBy = Number(amount);
  if (!Number.isFinite(incrementBy) || incrementBy < 1 || !Number.isInteger(incrementBy)) {
    return { ok: false, error: "invalid_counter_amount" };
  }

  if (!isSupabaseAdminConfigured()) {
    return { ok: false, error: "supabase_not_configured" };
  }

  try {
    const client = supabase ?? getSupabaseAdmin();
    const { error } = await client.rpc("sentinel_increment_counter", {
      p_counter_key: String(counterKey).trim(),
      p_amount: incrementBy,
    });

    if (error) {
      if (/relation .* does not exist|schema cache|function .* does not exist/i.test(error.message || "")) {
        return { ok: false, error: "sentinel_counters_table_missing", message: error.message };
      }

      return { ok: false, error: "counter_write_failed", message: error.message };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: "counter_write_failed" };
  }
}

export async function getSentinelCounters(prefix = null, { supabase = null } = {}) {
  const prefixValidation = validateSentinelCounterPrefix(prefix);
  if (!prefixValidation.valid) {
    return { ok: false, error: prefixValidation.error, counters: [] };
  }

  if (!isSupabaseAdminConfigured()) {
    return { ok: false, error: "supabase_not_configured", counters: [] };
  }

  try {
    const client = supabase ?? getSupabaseAdmin();
    const normalizedPrefix = String(prefix || "").trim();

    const { data, error } = await client
      .from(SENTINEL_COUNTERS_TABLE)
      .select("counter_key, count, first_seen_at, last_seen_at")
      .order("counter_key", { ascending: true });

    if (error) {
      if (/relation .* does not exist|schema cache/i.test(error.message || "")) {
        return { ok: false, error: "sentinel_counters_table_missing", counters: [] };
      }

      return { ok: false, error: "counter_read_failed", counters: [] };
    }

    let counters = (data || [])
      .filter((row) =>
        SENTINEL_COUNTER_PREFIXES.some((allowedPrefix) =>
          String(row.counter_key || "").startsWith(allowedPrefix)
        )
      )
      .map(mapCounterRow)
      .filter(Boolean);

    if (normalizedPrefix) {
      counters = counters.filter((row) => row.counter_key.startsWith(normalizedPrefix));
    }

    return {
      ok: true,
      counters,
    };
  } catch {
    return { ok: false, error: "counter_read_failed", counters: [] };
  }
}

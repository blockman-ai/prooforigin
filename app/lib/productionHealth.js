import { isDtsMasterKeyConfigured } from "./identityCard.js";
import {
  buildEnvHealthReport,
  isProductionRuntime,
  TRUST_PASS_HEALTH_TABLES,
  VAULT_HEALTH_TABLES,
  VOICE_ANCHOR_HEALTH_TABLES,
} from "./productionConfig.js";
import { isSupabaseAdminConfigured, getSupabaseAdmin } from "./supabaseAdmin.js";
import {
  isVaultAdminConfigured,
  createVaultAdminClient,
  VAULT_STORAGE_BUCKET,
} from "./vaultAdmin.js";
import {
  auditVaultCiphertextStorage,
  countExpiredVaultNonces,
  verifyVaultBucketPrivacy,
} from "./vaultOps.js";

export const PROOFORIGIN_HEALTH_VERSION = "phase-1";

async function checkTableReachable(supabase, tableName) {
  const { error } = await supabase.from(tableName).select("*", { head: true, count: "exact" });

  if (!error) {
    return { table: tableName, reachable: true, error: null };
  }

  const message = error.message || "unreachable";
  const missing = /relation .* does not exist|schema cache/i.test(message);

  return {
    table: tableName,
    reachable: false,
    missing,
    error: message,
  };
}

async function checkTables(supabase, tableNames) {
  const results = await Promise.all(tableNames.map((table) => checkTableReachable(supabase, table)));
  const reachable = results.every((row) => row.reachable);

  return {
    reachable,
    tables: results,
  };
}

function summarizeChecks({ env, supabaseConfigured, vault, trustPass, voice, bucket, storage, nonces }) {
  const blockers = [];

  if (!env.all_required_present) {
    blockers.push("missing_required_env");
  }

  if (isProductionRuntime() && !isDtsMasterKeyConfigured()) {
    blockers.push("dts_master_key_missing");
  }

  if (supabaseConfigured) {
    if (!vault.reachable) blockers.push("vault_tables_unreachable");
    if (!trustPass.reachable) blockers.push("trust_pass_tables_unreachable");
    if (!voice.reachable) blockers.push("voice_anchor_table_unreachable");
    if (bucket.reachable && bucket.public) blockers.push("vault_bucket_public");
    if (storage.orphan_count > 0) blockers.push("vault_orphan_ciphertext");
    if (storage.missing_ciphertext_count > 0) blockers.push("vault_missing_ciphertext");
  } else {
    blockers.push("supabase_not_configured");
  }

  let status = "ok";
  if (blockers.some((item) => item.endsWith("_unreachable") || item.includes("missing"))) {
    status = "error";
  } else if (blockers.length > 0) {
    status = "degraded";
  }

  return { status, blockers };
}

export async function buildProofOriginHealthReport({ includeStorageAudit = true } = {}) {
  const env = buildEnvHealthReport();
  const supabaseConfigured = isSupabaseAdminConfigured();

  const report = {
    ok: true,
    service: "prooforigin",
    version: PROOFORIGIN_HEALTH_VERSION,
    timestamp: new Date().toISOString(),
    runtime: env.runtime,
    env: {
      all_required_present: env.all_required_present,
      checks: env.checks.map(({ key, group, present, status }) => ({
        key,
        group,
        present,
        status,
      })),
    },
    trust_pass: {
      dts_master_key_present: isDtsMasterKeyConfigured(),
      dts_master_key_required_in_production: isProductionRuntime(),
    },
    supabase: {
      configured: supabaseConfigured,
    },
    vault: {
      admin_configured: isVaultAdminConfigured(),
      bucket: VAULT_STORAGE_BUCKET,
      tables: { reachable: false, tables: [] },
    },
    voice_anchor: {
      tables: { reachable: false, tables: [] },
    },
    storage_audit: null,
    nonces: null,
  };

  if (!supabaseConfigured) {
    const summary = summarizeChecks({
      env,
      supabaseConfigured: false,
      vault: { reachable: false },
      trustPass: { reachable: false },
      voice: { reachable: false },
      bucket: { reachable: false, public: null },
      storage: { orphan_count: 0, missing_ciphertext_count: 0 },
      nonces: { expired_nonce_count: 0 },
    });
    report.ok = summary.status === "ok";
    report.status = summary.status;
    report.blockers = summary.blockers;
    return report;
  }

  const supabase = getSupabaseAdmin();
  const vaultClient = isVaultAdminConfigured() ? createVaultAdminClient() : supabase;

  const [vaultTables, trustPassTables, voiceTables] = await Promise.all([
    checkTables(vaultClient, VAULT_HEALTH_TABLES),
    checkTables(supabase, TRUST_PASS_HEALTH_TABLES),
    checkTables(supabase, VOICE_ANCHOR_HEALTH_TABLES),
  ]);

  report.vault.tables = vaultTables;
  report.trust_pass.tables = trustPassTables;
  report.voice_anchor.tables = voiceTables;

  if (includeStorageAudit && isVaultAdminConfigured()) {
    const [bucket, storage, expiredNonceCount] = await Promise.all([
      verifyVaultBucketPrivacy(vaultClient),
      auditVaultCiphertextStorage(vaultClient),
      countExpiredVaultNonces(vaultClient).catch(() => null),
    ]);

    report.vault.bucket_reachable = bucket.reachable;
    report.vault.bucket_public = bucket.public;
    report.vault.bucket_error = bucket.error;
    report.storage_audit = {
      active_document_count: storage.active_document_count,
      storage_object_count: storage.storage_object_count,
      orphan_count: storage.orphan_count,
      missing_ciphertext_count: storage.missing_ciphertext_count,
    };
    report.nonces = {
      expired_nonce_count: expiredNonceCount,
    };
  }

  const summary = summarizeChecks({
    env,
    supabaseConfigured: true,
    vault: vaultTables,
    trustPass: trustPassTables,
    voice: voiceTables,
    bucket: {
      reachable: report.vault.bucket_reachable ?? false,
      public: report.vault.bucket_public,
    },
    storage: report.storage_audit || { orphan_count: 0, missing_ciphertext_count: 0 },
    nonces: report.nonces || { expired_nonce_count: 0 },
  });

  report.status = summary.status;
  report.blockers = summary.blockers;
  report.ok = summary.status === "ok";

  return report;
}

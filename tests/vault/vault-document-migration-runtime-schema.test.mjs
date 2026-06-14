import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const RUNTIME_SQL_PATH = resolve(
  process.cwd(),
  "docs/sql/vault_document_migration_phase2_runtime.sql"
);

function readRuntimeSql() {
  return readFileSync(RUNTIME_SQL_PATH, "utf8");
}

test("runtime ddl persists ownership and aad fields", () => {
  const sql = readRuntimeSql();

  assert.match(sql, /add column if not exists vault_id uuid/i);
  assert.match(sql, /add column if not exists vault_id_bound_at timestamptz/i);
  assert.match(sql, /add column if not exists vault_ownership_proof_metadata jsonb/i);
  assert.match(sql, /add column if not exists aad_version smallint not null default 1/i);
});

test("runtime ddl enforces aad_version constraints and backward compatibility", () => {
  const sql = readRuntimeSql();

  assert.match(sql, /check \(aad_version in \(1, 3\)\)/i);
  assert.match(sql, /check \(aad_version <> 3 or vault_id is not null\)/i);
  assert.match(sql, /add column if not exists vault_id uuid/i);
  assert.match(sql, /add column if not exists aad_version smallint not null default 1/i);
});

test("runtime ddl enforces immutable ownership keys", () => {
  const sql = readRuntimeSql();

  assert.match(sql, /create table if not exists public\.vault_ownership_keys/i);
  assert.match(sql, /create unique index if not exists vault_ownership_keys_vault_immutable_idx/i);
  assert.doesNotMatch(sql, /\brevoked_at\b/i);
});

test("runtime ddl includes ownership verification challenge persistence", () => {
  const sql = readRuntimeSql();

  assert.match(sql, /create table if not exists public\.vault_ownership_verifications/i);
  assert.match(sql, /challenge_id uuid not null unique default gen_random_uuid\(\)/i);
  assert.match(sql, /challenge_nonce_hash char\(64\)/i);
  assert.match(sql, /constraint vault_ownership_verifications_status_allowed/i);
  assert.match(sql, /constraint vault_ownership_verifications_challenge_type_allowed/i);
  assert.match(sql, /challenge_type in \('migration_authority_verify'\)/i);
  assert.match(sql, /constraint vault_ownership_verifications_verified_consistent/i);
});

test("runtime ddl enforces migration invariants and uniqueness", () => {
  const sql = readRuntimeSql();

  assert.match(sql, /create table if not exists public\.vault_document_migrations/i);
  assert.match(sql, /constraint vault_document_migrations_completed_consistent/i);
  assert.match(sql, /constraint vault_document_migrations_failed_consistent/i);
  assert.match(sql, /constraint vault_document_migrations_cancelled_consistent/i);
  assert.match(sql, /constraint vault_document_migrations_non_terminal_consistent/i);
  assert.match(sql, /constraint vault_document_migrations_source_retired_consistent/i);
  assert.match(sql, /create unique index if not exists vault_document_migrations_one_active_source_idx/i);
  assert.match(
    sql,
    /create unique index if not exists vault_document_migrations_one_completed_source_idx/i
  );
});

test("runtime ddl updates atomic complete rpc for vault_id and aad_version persistence", () => {
  const sql = readRuntimeSql();

  assert.match(sql, /create or replace function public\.vault_complete_document_atomic/i);
  assert.match(sql, /p_vault_id uuid/i);
  assert.match(sql, /p_aad_version smallint/i);
  assert.match(sql, /vault_id,\s*aad_version/i);
  assert.match(sql, /'vault_id', v_doc\.vault_id/i);
  assert.match(sql, /'aad_version', v_doc\.aad_version/i);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { VAULT_DOCUMENT_GENESIS_STATE_HASH } from "../../app/lib/vaultDocumentState.js";

const SQL = readFileSync(
  new URL("../../docs/sql/phase10b_durability_custody_hardening_repair.sql", import.meta.url),
  "utf8"
);

test("phase 10b durability migration defines durable stores and custody chain RPCs", () => {
  assert.match(SQL, /create table if not exists public\.disclosure_confirmation_nonces/i);
  assert.match(SQL, /create table if not exists public\.prooforigin_rate_limit_buckets/i);
  assert.match(SQL, /create table if not exists public\.prooforigin_lockouts/i);
  assert.match(SQL, /vault_document_state_events_document_prev_hash_uidx/i);
  assert.match(SQL, /create or replace function public\.vault_append_document_state_event_atomic/i);
  assert.match(SQL, /create or replace function public\.vault_mark_document_compromised_atomic/i);
  assert.match(SQL, /create or replace function public\.vault_mark_document_deleted_atomic/i);
  assert.match(SQL, /grant execute on function public\.prooforigin_check_rate_limit_atomic/i);
});

test("phase 10b custody RPCs use the JS document genesis hash", () => {
  assert.equal(
    VAULT_DOCUMENT_GENESIS_STATE_HASH,
    "b4f2dbaae25f752dd6d5582e80fd1cfd5e593edfce6c532eb11fe2dad4f2c518"
  );
  assert.match(SQL, new RegExp(VAULT_DOCUMENT_GENESIS_STATE_HASH, "g"));
  assert.doesNotMatch(
    SQL,
    /b803f0a9478427ecfd35d7f642097d355b2bfb370b66b7dcf7990f19f4e45c2d/
  );
});

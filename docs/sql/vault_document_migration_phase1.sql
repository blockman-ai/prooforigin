-- ProofOrigin Private Vault — Cross-device document migration Phase 1.1 schema spec
-- Specification only for schema hardening review. Do not run until runtime DDL review.
--
-- Privacy:
-- - Stores vault ownership and ciphertext migration metadata only.
-- - Does not store plaintext documents, MVK, recovery phrases, Recovery Kits, PINs, or private keys.
-- - RLS remains locked down; service_role only.

begin;

-- Ownership binding. Existing rows may remain null until the original device
-- proves its vault_id in a future client flow. Ownership-key state is derived
-- from vault_ownership_keys, not cached on device registration rows.
alter table public.vault_device_registrations
  add column if not exists vault_id uuid,
  add column if not exists vault_id_bound_at timestamptz,
  add column if not exists vault_ownership_proof_metadata jsonb not null default '{}'::jsonb;

alter table public.vault_device_registrations
  add constraint vault_device_registrations_vault_bound_requires_id
    check (vault_id_bound_at is null or vault_id is not null) not valid,
  add constraint vault_device_registrations_ownership_proof_metadata_object
    check (jsonb_typeof(vault_ownership_proof_metadata) = 'object') not valid;

alter table public.vault_documents
  add column if not exists vault_id uuid,
  add column if not exists aad_version smallint not null default 1;

alter table public.vault_documents
  add constraint vault_documents_aad_version_allowed
    check (aad_version in (1, 3)) not valid;

alter table public.vault_documents
  add constraint vault_documents_aad_v3_requires_vault_id
    check (aad_version <> 3 or vault_id is not null) not valid;

-- Immutable ownership key binding. First public key binding wins. Public key
-- values are not secrets; private keys remain wrapped inside future Recovery
-- Kits. Rotation/replacement is intentionally not represented in this schema.
create table if not exists public.vault_ownership_keys (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null,
  public_key_jwk jsonb not null,
  algorithm text not null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,

  constraint vault_ownership_keys_algorithm_allowed
    check (algorithm in ('ECDSA-P256-SHA256')),
  constraint vault_ownership_keys_public_key_object
    check (jsonb_typeof(public_key_jwk) = 'object')
);

create unique index if not exists vault_ownership_keys_vault_immutable_idx
  on public.vault_ownership_keys (vault_id);

create table if not exists public.vault_document_migrations (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null,
  source_document_id uuid not null,
  target_document_id uuid,
  source_vault_device_id uuid not null,
  target_vault_device_id uuid not null,
  state text not null default 'pending',
  failure_reason text,
  source_retirement_state text not null default 'active',
  upload_started_at timestamptz,
  completed_at timestamptz,
  source_retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,

  constraint vault_document_migrations_state_allowed
    check (state in ('pending', 'uploading', 'completed', 'failed', 'cancelled')),
  constraint vault_document_migrations_failure_reason_allowed
    check (
      failure_reason is null or
      failure_reason in (
        'decrypt_failed',
        'download_failed',
        'upload_failed',
        'slot_occupied',
        'verify_failed',
        'commit_failed',
        'vault_mismatch',
        'user_cancelled',
        'upload_expired'
      )
    ),
  constraint vault_document_migrations_source_retirement_allowed
    check (source_retirement_state in ('active', 'source_retired')),
  constraint vault_document_migrations_completed_consistent
    check (
      state <> 'completed' or
      (target_document_id is not null and completed_at is not null and failure_reason is null)
    ),
  constraint vault_document_migrations_failed_consistent
    check (
      state <> 'failed' or
      (failure_reason is not null and failure_reason <> 'user_cancelled' and completed_at is null)
    ),
  constraint vault_document_migrations_cancelled_consistent
    check (
      state <> 'cancelled' or
      (failure_reason = 'user_cancelled' and completed_at is null)
    ),
  constraint vault_document_migrations_non_terminal_consistent
    check (
      state not in ('pending', 'uploading') or
      (failure_reason is null and completed_at is null)
    ),
  constraint vault_document_migrations_source_retired_consistent
    check (
      source_retirement_state <> 'source_retired' or
      (state = 'completed' and source_retired_at is not null)
    ),
  constraint vault_document_migrations_active_source_consistent
    check (
      source_retirement_state <> 'active' or source_retired_at is null
    ),
  constraint vault_document_migrations_distinct_devices
    check (source_vault_device_id <> target_vault_device_id),
  constraint vault_document_migrations_distinct_documents
    check (target_document_id is null or target_document_id <> source_document_id)
);

-- One non-terminal migration per source document.
create unique index if not exists vault_document_migrations_one_active_source_idx
  on public.vault_document_migrations (vault_id, source_document_id)
  where state in ('pending', 'uploading');

-- A source document can complete migration only once. Future reverse migration
-- must create a new source/target pair rather than adding another completed row.
create unique index if not exists vault_document_migrations_one_completed_source_idx
  on public.vault_document_migrations (vault_id, source_document_id)
  where state = 'completed';

create index if not exists vault_document_migrations_vault_created_idx
  on public.vault_document_migrations (vault_id, created_at desc);

alter table public.vault_ownership_keys enable row level security;
alter table public.vault_document_migrations enable row level security;

revoke all on table public.vault_ownership_keys from anon, authenticated, public;
revoke all on table public.vault_document_migrations from anon, authenticated, public;

grant select, insert, update, delete on table public.vault_ownership_keys to service_role;
grant select, insert, update, delete on table public.vault_document_migrations to service_role;

commit;

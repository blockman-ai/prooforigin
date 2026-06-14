-- ProofOrigin Private Vault — Cross-device document migration Phase 2 runtime DDL
-- Run in Supabase SQL Editor after:
--   docs/sql/vault_device_registrations.sql
--   docs/sql/vault_documents.sql
--   docs/sql/vault_p1_integrity.sql
--
-- This migration executes the Phase 1.1 schema hardening spec for runtime use.
-- It does not enable migration execution routes or AAD v3 runtime behavior.

begin;

-- ---------------------------------------------------------------------------
-- Device registration ownership binding metadata
-- ---------------------------------------------------------------------------
alter table public.vault_device_registrations
  add column if not exists vault_id uuid,
  add column if not exists vault_id_bound_at timestamptz,
  add column if not exists vault_ownership_proof_metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'vault_device_registrations_vault_bound_requires_id'
  ) then
    alter table public.vault_device_registrations
      add constraint vault_device_registrations_vault_bound_requires_id
      check (vault_id_bound_at is null or vault_id is not null) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'vault_device_registrations_ownership_proof_metadata_object'
  ) then
    alter table public.vault_device_registrations
      add constraint vault_device_registrations_ownership_proof_metadata_object
      check (jsonb_typeof(vault_ownership_proof_metadata) = 'object') not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Document AAD discriminator persistence
-- ---------------------------------------------------------------------------
alter table public.vault_documents
  add column if not exists vault_id uuid,
  add column if not exists aad_version smallint not null default 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'vault_documents_aad_version_allowed'
  ) then
    alter table public.vault_documents
      add constraint vault_documents_aad_version_allowed
      check (aad_version in (1, 3)) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'vault_documents_aad_v3_requires_vault_id'
  ) then
    alter table public.vault_documents
      add constraint vault_documents_aad_v3_requires_vault_id
      check (aad_version <> 3 or vault_id is not null) not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Immutable ownership public key persistence
-- ---------------------------------------------------------------------------
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

alter table public.vault_ownership_keys enable row level security;
revoke all on table public.vault_ownership_keys from anon, authenticated, public;
grant select, insert, update, delete on table public.vault_ownership_keys to service_role;

-- ---------------------------------------------------------------------------
-- Migration record persistence + invariants
-- ---------------------------------------------------------------------------
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

create unique index if not exists vault_document_migrations_one_active_source_idx
  on public.vault_document_migrations (vault_id, source_document_id)
  where state in ('pending', 'uploading');

create unique index if not exists vault_document_migrations_one_completed_source_idx
  on public.vault_document_migrations (vault_id, source_document_id)
  where state = 'completed';

create index if not exists vault_document_migrations_vault_created_idx
  on public.vault_document_migrations (vault_id, created_at desc);

alter table public.vault_document_migrations enable row level security;
revoke all on table public.vault_document_migrations from anon, authenticated, public;
grant select, insert, update, delete on table public.vault_document_migrations to service_role;

-- ---------------------------------------------------------------------------
-- Phase 2 update to atomic document complete function:
-- persist vault_id and aad_version metadata only.
-- ---------------------------------------------------------------------------
create or replace function public.vault_complete_document_atomic(
  p_doc_id uuid,
  p_vault_device_id uuid,
  p_vault_id uuid,
  p_aad_version smallint,
  p_storage_path text,
  p_ciphertext_sha256 char(64),
  p_ciphertext_bytes bigint,
  p_content_type_hint text,
  p_label_ciphertext text,
  p_label_iv text,
  p_encryption_version smallint,
  p_created_at timestamptz,
  p_event_previous_state_hash char(64),
  p_event_state_hash char(64),
  p_event_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.vault_documents%rowtype;
begin
  if exists (
    select 1
    from public.vault_documents
    where vault_device_id = p_vault_device_id
      and deleted_at is null
  ) then
    raise exception 'SLOT_OCCUPIED'
      using errcode = '23505';
  end if;

  insert into public.vault_documents (
    id,
    vault_device_id,
    vault_id,
    aad_version,
    storage_path,
    ciphertext_sha256,
    ciphertext_bytes,
    content_type_hint,
    label_ciphertext,
    label_iv,
    encryption_version,
    created_at,
    updated_at
  )
  values (
    p_doc_id,
    p_vault_device_id,
    p_vault_id,
    p_aad_version,
    p_storage_path,
    p_ciphertext_sha256,
    p_ciphertext_bytes,
    p_content_type_hint,
    p_label_ciphertext,
    p_label_iv,
    p_encryption_version,
    p_created_at,
    p_created_at
  )
  returning * into v_doc;

  insert into public.vault_document_state_events (
    document_id,
    event_type,
    previous_state_hash,
    state_hash,
    created_at,
    metadata
  )
  values (
    p_doc_id,
    'created',
    p_event_previous_state_hash,
    p_event_state_hash,
    p_created_at,
    coalesce(p_event_metadata, '{}'::jsonb)
  );

  return jsonb_build_object(
    'id', v_doc.id,
    'vault_device_id', v_doc.vault_device_id,
    'vault_id', v_doc.vault_id,
    'aad_version', v_doc.aad_version,
    'storage_path', v_doc.storage_path,
    'ciphertext_sha256', v_doc.ciphertext_sha256,
    'ciphertext_bytes', v_doc.ciphertext_bytes,
    'content_type_hint', v_doc.content_type_hint,
    'label_ciphertext', v_doc.label_ciphertext,
    'label_iv', v_doc.label_iv,
    'encryption_version', v_doc.encryption_version,
    'compromised_at', v_doc.compromised_at,
    'created_at', v_doc.created_at,
    'updated_at', v_doc.updated_at,
    'deleted_at', v_doc.deleted_at
  );
end;
$$;

revoke all on function public.vault_complete_document_atomic(
  uuid, uuid, uuid, smallint, text, char, bigint, text, text, text, smallint, timestamptz, char, char, jsonb
) from public;

grant execute on function public.vault_complete_document_atomic(
  uuid, uuid, uuid, smallint, text, char, bigint, text, text, text, smallint, timestamptz, char, char, jsonb
) to service_role;

commit;

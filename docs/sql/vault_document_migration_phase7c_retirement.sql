-- ProofOrigin Private Vault — Cross-device document migration Phase 7C source retirement RPC
-- Run in Supabase SQL Editor after docs/sql/vault_document_migration_phase6c_commit.sql.
--
-- Privacy:
-- - Soft-retires source ciphertext metadata only.
-- - Does not delete storage objects.
-- - Does not revoke source devices.
-- - Preserves rollback safety by using source_retired_at instead of deleted_at.

begin;

alter table public.vault_documents
  add column if not exists source_retired_at timestamptz;

create or replace function public.vault_retire_document_migration_source_atomic(
  p_migration_id uuid,
  p_vault_id uuid,
  p_source_document_id uuid,
  p_source_vault_device_id uuid,
  p_target_vault_device_id uuid,
  p_target_document_id uuid,
  p_expected_source_ciphertext_sha256 char(64),
  p_target_storage_path text,
  p_target_ciphertext_sha256 char(64),
  p_target_ciphertext_bytes bigint,
  p_target_content_type_hint text,
  p_retired_at timestamptz,
  p_migration_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_migration public.vault_document_migrations%rowtype;
  v_source public.vault_documents%rowtype;
  v_target public.vault_documents%rowtype;
  v_not_before timestamptz;
begin
  select *
    into v_migration
  from public.vault_document_migrations
  where id = p_migration_id
    and vault_id = p_vault_id
    and source_document_id = p_source_document_id
    and source_vault_device_id = p_source_vault_device_id
    and target_vault_device_id = p_target_vault_device_id
    and target_document_id = p_target_document_id
    and state = 'completed'
  for update;

  if not found then
    raise exception 'MIGRATION_NOT_RETIREABLE'
      using errcode = 'P0001';
  end if;

  if v_migration.source_retirement_state <> 'active' then
    raise exception 'SOURCE_RETIREMENT_STATE_INVALID'
      using errcode = 'P0001';
  end if;

  if coalesce(v_migration.metadata->>'source_retirement_eligible', 'false') <> 'true' then
    raise exception 'SOURCE_RETIREMENT_NOT_ELIGIBLE'
      using errcode = 'P0001';
  end if;

  v_not_before := nullif(v_migration.metadata->>'source_retirement_not_before', '')::timestamptz;
  if v_not_before is null or v_not_before > p_retired_at then
    raise exception 'SOURCE_RETIREMENT_NOT_BEFORE'
      using errcode = 'P0001';
  end if;

  select *
    into v_source
  from public.vault_documents
  where id = p_source_document_id
    and vault_id = p_vault_id
    and vault_device_id = p_source_vault_device_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'SOURCE_DOCUMENT_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  if v_source.source_retired_at is not null then
    raise exception 'SOURCE_DOCUMENT_ALREADY_RETIRED'
      using errcode = 'P0001';
  end if;

  if v_source.compromised_at is not null then
    raise exception 'SOURCE_DOCUMENT_COMPROMISED'
      using errcode = 'P0001';
  end if;

  if v_source.ciphertext_sha256 <> p_expected_source_ciphertext_sha256 then
    raise exception 'SOURCE_DOCUMENT_CHANGED'
      using errcode = 'P0001';
  end if;

  select *
    into v_target
  from public.vault_documents
  where id = p_target_document_id
    and vault_id = p_vault_id
    and vault_device_id = p_target_vault_device_id
    and aad_version = 3
    and storage_path = p_target_storage_path
    and ciphertext_sha256 = p_target_ciphertext_sha256
    and ciphertext_bytes = p_target_ciphertext_bytes
    and content_type_hint = p_target_content_type_hint
    and deleted_at is null
  for share;

  if not found then
    raise exception 'TARGET_DOCUMENT_INVALID'
      using errcode = 'P0001';
  end if;

  if v_target.compromised_at is not null then
    raise exception 'TARGET_DOCUMENT_COMPROMISED'
      using errcode = 'P0001';
  end if;

  update public.vault_documents
  set
    source_retired_at = p_retired_at,
    updated_at = p_retired_at
  where id = p_source_document_id
    and vault_device_id = p_source_vault_device_id
    and deleted_at is null
    and source_retired_at is null
  returning * into v_source;

  update public.vault_document_migrations
  set
    source_retirement_state = 'source_retired',
    source_retired_at = p_retired_at,
    updated_at = p_retired_at,
    metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_migration_metadata, '{}'::jsonb)
  where id = p_migration_id
    and source_retirement_state = 'active'
  returning * into v_migration;

  return jsonb_build_object(
    'source_document',
    jsonb_build_object(
      'id', v_source.id,
      'vault_device_id', v_source.vault_device_id,
      'vault_id', v_source.vault_id,
      'aad_version', v_source.aad_version,
      'storage_path', v_source.storage_path,
      'ciphertext_sha256', v_source.ciphertext_sha256,
      'ciphertext_bytes', v_source.ciphertext_bytes,
      'content_type_hint', v_source.content_type_hint,
      'encryption_version', v_source.encryption_version,
      'compromised_at', v_source.compromised_at,
      'source_retired_at', v_source.source_retired_at,
      'created_at', v_source.created_at,
      'updated_at', v_source.updated_at,
      'deleted_at', v_source.deleted_at
    ),
    'migration',
    jsonb_build_object(
      'id', v_migration.id,
      'vault_id', v_migration.vault_id,
      'source_document_id', v_migration.source_document_id,
      'target_document_id', v_migration.target_document_id,
      'source_vault_device_id', v_migration.source_vault_device_id,
      'target_vault_device_id', v_migration.target_vault_device_id,
      'state', v_migration.state,
      'failure_reason', v_migration.failure_reason,
      'source_retirement_state', v_migration.source_retirement_state,
      'upload_started_at', v_migration.upload_started_at,
      'completed_at', v_migration.completed_at,
      'source_retired_at', v_migration.source_retired_at,
      'created_at', v_migration.created_at,
      'updated_at', v_migration.updated_at,
      'metadata', v_migration.metadata
    )
  );
end;
$$;

revoke all on function public.vault_retire_document_migration_source_atomic(
  uuid, uuid, uuid, uuid, uuid, uuid, char, text, char, bigint, text, timestamptz, jsonb
) from public;

grant execute on function public.vault_retire_document_migration_source_atomic(
  uuid, uuid, uuid, uuid, uuid, uuid, char, text, char, bigint, text, timestamptz, jsonb
) to service_role;

commit;

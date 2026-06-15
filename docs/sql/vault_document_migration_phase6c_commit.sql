-- ProofOrigin Private Vault — Cross-device document migration Phase 6C commit RPC
-- Run in Supabase SQL Editor after docs/sql/vault_document_migration_phase2_runtime.sql.
--
-- Privacy:
-- - Commits ciphertext metadata only.
-- - Does not store plaintext documents, MVK, Recovery Kits, PINs, or private keys.
-- - Does not retire or delete the source document.

begin;

create or replace function public.vault_commit_document_migration_atomic(
  p_migration_id uuid,
  p_vault_id uuid,
  p_source_document_id uuid,
  p_source_vault_device_id uuid,
  p_target_vault_device_id uuid,
  p_target_document_id uuid,
  p_expected_source_ciphertext_sha256 char(64),
  p_live_storage_path text,
  p_ciphertext_sha256 char(64),
  p_ciphertext_bytes bigint,
  p_content_type_hint text,
  p_label_ciphertext text,
  p_label_iv text,
  p_encryption_version smallint,
  p_aad_version smallint,
  p_completed_at timestamptz,
  p_event_previous_state_hash char(64),
  p_event_state_hash char(64),
  p_event_metadata jsonb default '{}'::jsonb,
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
  v_doc public.vault_documents%rowtype;
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
    and state = 'uploading'
  for update;

  if not found then
    raise exception 'MIGRATION_NOT_COMMITTABLE'
      using errcode = 'P0001';
  end if;

  if coalesce(v_migration.metadata->>'staging_verified', 'false') <> 'true' then
    raise exception 'MIGRATION_STAGING_NOT_VERIFIED'
      using errcode = 'P0001';
  end if;

  if v_migration.metadata->>'staging_aad_version' <> p_aad_version::text then
    raise exception 'MIGRATION_STAGING_AAD_INVALID'
      using errcode = 'P0001';
  end if;

  select *
    into v_source
  from public.vault_documents
  where id = p_source_document_id
    and vault_id = p_vault_id
    and vault_device_id = p_source_vault_device_id
    and deleted_at is null
  for share;

  if not found then
    raise exception 'SOURCE_DOCUMENT_NOT_FOUND'
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

  if (p_label_ciphertext is null) <> (p_label_iv is null) then
    raise exception 'TARGET_LABEL_ENVELOPE_INCOMPLETE'
      using errcode = 'P0001';
  end if;

  if v_source.label_ciphertext is not null and (p_label_ciphertext is null or p_label_iv is null) then
    raise exception 'SOURCE_LABEL_REENCRYPTION_REQUIRED'
      using errcode = 'P0001';
  end if;

  if p_label_ciphertext is not null and (
    p_label_ciphertext = v_source.label_ciphertext or
    p_label_iv = v_source.label_iv
  ) then
    raise exception 'SOURCE_LABEL_REUSE_REJECTED'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.vault_documents
    where vault_device_id = p_target_vault_device_id
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
    p_target_document_id,
    p_target_vault_device_id,
    p_vault_id,
    p_aad_version,
    p_live_storage_path,
    p_ciphertext_sha256,
    p_ciphertext_bytes,
    p_content_type_hint,
    p_label_ciphertext,
    p_label_iv,
    p_encryption_version,
    p_completed_at,
    p_completed_at
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
    p_target_document_id,
    'created',
    p_event_previous_state_hash,
    p_event_state_hash,
    p_completed_at,
    coalesce(p_event_metadata, '{}'::jsonb)
  );

  update public.vault_document_migrations
  set
    state = 'completed',
    failure_reason = null,
    completed_at = p_completed_at,
    source_retirement_state = 'active',
    source_retired_at = null,
    updated_at = p_completed_at,
    metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_migration_metadata, '{}'::jsonb)
  where id = p_migration_id
    and state = 'uploading'
  returning * into v_migration;

  return jsonb_build_object(
    'document',
    jsonb_build_object(
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

revoke all on function public.vault_commit_document_migration_atomic(
  uuid, uuid, uuid, uuid, uuid, uuid, char, text, char, bigint, text, text, text, smallint,
  smallint, timestamptz, char, char, jsonb, jsonb
) from public;

grant execute on function public.vault_commit_document_migration_atomic(
  uuid, uuid, uuid, uuid, uuid, uuid, char, text, char, bigint, text, text, text, smallint,
  smallint, timestamptz, char, char, jsonb, jsonb
) to service_role;

commit;

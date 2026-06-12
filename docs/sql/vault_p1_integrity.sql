-- ProofOrigin Private Vault P1 — integrity hardening
-- Run in Supabase SQL Editor after:
--   docs/sql/vault_documents.sql
--   docs/sql/vault_document_state_events.sql
--   docs/sql/vault_document_state_events_view_lifecycle.sql
--
-- Adds:
-- - vault_request_nonces (DB-backed HMAC replay protection)
-- - vault_complete_document_atomic() (document row + created event in one transaction)

begin;

-- ---------------------------------------------------------------------------
-- Request nonce replay table (service_role only)
-- ---------------------------------------------------------------------------

create table if not exists public.vault_request_nonces (
  nonce text primary key,
  vault_device_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,

  constraint vault_request_nonces_nonce_len check (char_length(nonce) >= 8)
);

create index if not exists vault_request_nonces_expires_at_idx
  on public.vault_request_nonces (expires_at);

create index if not exists vault_request_nonces_device_idx
  on public.vault_request_nonces (vault_device_id, created_at desc);

alter table public.vault_request_nonces enable row level security;

revoke all on table public.vault_request_nonces from anon, authenticated, public;
grant select, insert, delete on table public.vault_request_nonces to service_role;

-- ---------------------------------------------------------------------------
-- Expired nonce cleanup (optional periodic job)
-- ---------------------------------------------------------------------------

create or replace function public.vault_cleanup_expired_request_nonces()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.vault_request_nonces
  where expires_at < now();

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.vault_cleanup_expired_request_nonces() from public;
grant execute on function public.vault_cleanup_expired_request_nonces() to service_role;

-- ---------------------------------------------------------------------------
-- Atomic document complete + created state event
-- State hashes are computed in the app via computeVaultDocumentStateHash().
-- ---------------------------------------------------------------------------

create or replace function public.vault_complete_document_atomic(
  p_doc_id uuid,
  p_vault_device_id uuid,
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
  uuid, uuid, text, char, bigint, text, text, text, smallint, timestamptz, char, char, jsonb
) from public;

grant execute on function public.vault_complete_document_atomic(
  uuid, uuid, text, char, bigint, text, text, text, smallint, timestamptz, char, char, jsonb
) to service_role;

commit;

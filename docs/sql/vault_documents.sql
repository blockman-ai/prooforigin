-- ProofOrigin Private Vault V0.2 — single encrypted document slot
-- Run in Supabase SQL Editor when ready to persist vault document metadata.
--
-- Privacy:
-- - Ciphertext metadata only. No plaintext documents, labels, or PIN material.
-- - Not government ID storage. Not legal verification.
-- - storage_path points to encrypted .enc objects in private bucket vault-documents.
-- - RLS locked down; service_role only.

begin;

create table if not exists public.vault_documents (
  id uuid primary key default gen_random_uuid(),
  vault_device_id uuid not null,
  storage_path text not null,
  ciphertext_sha256 char(64) not null,
  ciphertext_bytes bigint not null,
  content_type_hint text not null default 'application/octet-stream',
  label_ciphertext text,
  label_iv text,
  encryption_version smallint not null default 1,
  compromised_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint vault_documents_ciphertext_sha256_len
    check (char_length(ciphertext_sha256) = 64),
  constraint vault_documents_encryption_version_allowed
    check (encryption_version in (1))
);

-- One active document per browser/device vault scope
create unique index if not exists vault_documents_one_active_per_device_idx
  on public.vault_documents (vault_device_id)
  where deleted_at is null;

create index if not exists vault_documents_device_lookup_idx
  on public.vault_documents (vault_device_id, created_at desc);

alter table public.vault_documents enable row level security;

revoke all on table public.vault_documents from anon, authenticated, public;
grant select, insert, update, delete on table public.vault_documents to service_role;

commit;

-- ProofOrigin Vault — encryption_version v2 (MVK root)
-- Run after vault_documents.sql on existing Supabase projects.
--
-- Allows encryption_version 2 for MVK-mode client uploads.
-- Existing rows with encryption_version 1 remain valid.

begin;

alter table public.vault_documents
  drop constraint if exists vault_documents_encryption_version_allowed;

alter table public.vault_documents
  add constraint vault_documents_encryption_version_allowed
  check (encryption_version in (1, 2));

commit;

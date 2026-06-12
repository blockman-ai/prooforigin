-- ProofOrigin Private Vault V0.2.5 — immutable document state history
-- Run in Supabase SQL Editor after docs/sql/vault_documents.sql
--
-- Privacy:
-- - Event metadata only. No plaintext documents or PIN material.
-- - Append-only audit chain for document lifecycle events.
-- - RLS locked down; service_role only.

begin;

create table if not exists public.vault_document_state_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.vault_documents(id) on delete cascade,
  event_type text not null,
  previous_state_hash char(64) not null,
  state_hash char(64) not null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,

  constraint vault_document_state_events_type_allowed check (
    event_type in (
      'created',
      'viewed',
      'view_started',
      'view_ended',
      'compromised',
      'deleted'
    )
  ),
  constraint vault_document_state_events_prev_hash_len check (
    char_length(previous_state_hash) = 64
  ),
  constraint vault_document_state_events_state_hash_len check (
    char_length(state_hash) = 64
  )
);

create index if not exists vault_document_state_events_document_created_idx
  on public.vault_document_state_events (document_id, created_at desc);

alter table public.vault_document_state_events enable row level security;

revoke all on table public.vault_document_state_events from anon, authenticated, public;
grant select, insert, update, delete on table public.vault_document_state_events to service_role;

commit;

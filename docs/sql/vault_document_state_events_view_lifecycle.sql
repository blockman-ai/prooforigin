-- ProofOrigin Private Vault V0.2.6 — Protected View lifecycle event types
-- Run in Supabase SQL Editor after docs/sql/vault_document_state_events.sql
--
-- Adds view_started / view_ended alongside legacy viewed.
-- Unique partial indexes prevent duplicate lifecycle events per view_session_id.

begin;

alter table public.vault_document_state_events
  drop constraint if exists vault_document_state_events_type_allowed;

alter table public.vault_document_state_events
  add constraint vault_document_state_events_type_allowed check (
    event_type in (
      'created',
      'viewed',
      'view_started',
      'view_ended',
      'compromised',
      'deleted'
    )
  );

create unique index if not exists vault_document_state_events_view_session_viewed_uidx
  on public.vault_document_state_events (document_id, (metadata->>'view_session_id'))
  where event_type = 'viewed';

create unique index if not exists vault_document_state_events_view_session_started_uidx
  on public.vault_document_state_events (document_id, (metadata->>'view_session_id'))
  where event_type = 'view_started';

create unique index if not exists vault_document_state_events_view_session_ended_uidx
  on public.vault_document_state_events (document_id, (metadata->>'view_session_id'))
  where event_type = 'view_ended';

commit;

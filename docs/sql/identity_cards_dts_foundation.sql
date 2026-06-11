-- ProofOrigin Dynamic Trust State foundation
-- Run after docs/sql/identity_cards.sql

begin;

alter table public.identity_cards
  add column if not exists secret_ciphertext text,
  add column if not exists secret_nonce text,
  add column if not exists public_display_hash text,
  add column if not exists trust_state text not null default 'active',
  add column if not exists latest_state_hash text,
  add column if not exists identity_card_version text not null default 'dts-v1',
  add column if not exists verification_count integer not null default 0,
  add column if not exists last_verified_at timestamptz,
  add column if not exists voice_anchor_hash text;

alter table public.identity_cards
  drop constraint if exists identity_cards_trust_state_allowed;

alter table public.identity_cards
  add constraint identity_cards_trust_state_allowed check (
    trust_state in ('active', 'expired', 'revoked', 'suspicious', 'unverified')
  );

create table if not exists public.identity_card_state_events (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.identity_cards(id) on delete cascade,
  event_type text not null,
  trust_state text not null,
  previous_state_hash text not null,
  card_state_hash text not null,
  public_display_hash text,
  voice_anchor_hash text,
  identity_card_version text not null default 'dts-v1',
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,

  constraint identity_card_state_events_type_allowed check (
    event_type in ('created', 'verified', 'revoked', 'expired', 'suspicious', 'renewed')
  ),
  constraint identity_card_state_events_trust_state_allowed check (
    trust_state in ('active', 'expired', 'revoked', 'suspicious', 'unverified')
  ),
  constraint identity_card_state_events_prev_hash_len check (
    char_length(previous_state_hash) = 64
  ),
  constraint identity_card_state_events_state_hash_len check (
    char_length(card_state_hash) = 64
  )
);

create index if not exists identity_card_state_events_card_created_idx
  on public.identity_card_state_events (card_id, created_at desc);

alter table public.identity_card_state_events enable row level security;

revoke all on table public.identity_card_state_events from anon, authenticated, public;
grant select, insert, update, delete on table public.identity_card_state_events to service_role;

commit;

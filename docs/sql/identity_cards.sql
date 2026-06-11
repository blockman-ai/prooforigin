-- ProofOrigin Online Identity Card V1
-- Run in Supabase SQL Editor when ready to persist card metadata.
--
-- Privacy:
-- - Not a government ID. Metadata only — no photos, SSN, DOB, or driver license fields.
-- - secret_token_hash stores SHA-256 of the rotating-code secret (plain token stays in browser).
-- - RLS locked down; service_role only.

begin;

create table if not exists public.identity_cards (
  id uuid primary key,
  secret_token_hash text not null,
  display_name text not null,
  username text,
  purpose text,
  expiration_key text not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,

  constraint identity_cards_secret_hash_len check (char_length(secret_token_hash) = 64),
  constraint identity_cards_expiration_key_allowed check (
    expiration_key in ('1d', '1w', '2w', '1m', '4m', '6m')
  )
);

create index if not exists identity_cards_active_idx
  on public.identity_cards (expires_at desc)
  where revoked_at is null;

alter table public.identity_cards enable row level security;

revoke all on table public.identity_cards from anon, authenticated, public;
grant select, insert, update, delete on table public.identity_cards to service_role;

commit;

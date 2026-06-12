-- ProofOrigin Private Vault V0.2.5 — device registration for API auth
-- Run in Supabase SQL Editor before using vault document API routes.
--
-- Privacy:
-- - auth_secret_hash is SHA-256 of the browser device auth secret (never store plaintext secret).
-- - Not government ID storage. Device scope only.
-- - RLS locked down; service_role only.

begin;

create table if not exists public.vault_device_registrations (
  id uuid primary key default gen_random_uuid(),
  vault_device_id uuid not null,
  device_public_id text not null,
  auth_secret_hash char(64) not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,

  constraint vault_device_registrations_auth_secret_hash_len
    check (char_length(auth_secret_hash) = 64)
);

-- One active registration per device
create unique index if not exists vault_device_registrations_active_device_idx
  on public.vault_device_registrations (vault_device_id)
  where revoked_at is null;

create unique index if not exists vault_device_registrations_public_id_idx
  on public.vault_device_registrations (device_public_id);

create index if not exists vault_device_registrations_device_lookup_idx
  on public.vault_device_registrations (vault_device_id, created_at desc);

alter table public.vault_device_registrations enable row level security;

revoke all on table public.vault_device_registrations from anon, authenticated, public;
grant select, insert, update, delete on table public.vault_device_registrations to service_role;

commit;

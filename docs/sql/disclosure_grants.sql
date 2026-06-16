-- ProofOrigin Controlled Disclosure Phase 9A-1 — verify-only grant foundation
-- Specification first. Review before applying in Supabase.
--
-- Privacy:
-- - Stores grant metadata, opaque reference hashes, recipient binding hashes, and audit events only.
-- - Does not store plaintext documents, ciphertext, label ciphertext, storage paths, vault keys,
--   document keys, recovery material, recipient secrets, or raw public grant handles.
-- - RLS remains locked down; service_role only.

begin;

create table if not exists public.disclosure_grants (
  grant_id uuid primary key default gen_random_uuid(),
  public_handle_hash char(64) not null,
  vault_ref_hash char(64) not null,
  scope_ref_hash char(64),
  grant_type text not null default 'verify_only',
  status text not null default 'active',
  purpose_label text not null,
  recipient_binding_hash char(64) not null,
  expires_at timestamptz not null,
  access_count integer not null default 0,
  max_access_count integer not null default 1,
  created_by_device_ref char(64) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,

  constraint disclosure_grants_public_handle_hash_len
    check (char_length(public_handle_hash) = 64),
  constraint disclosure_grants_vault_ref_hash_len
    check (char_length(vault_ref_hash) = 64),
  constraint disclosure_grants_scope_ref_hash_len
    check (scope_ref_hash is null or char_length(scope_ref_hash) = 64),
  constraint disclosure_grants_type_allowed
    check (grant_type in ('verify_only')),
  constraint disclosure_grants_status_allowed
    check (status in ('active', 'revoked', 'expired', 'archived')),
  constraint disclosure_grants_recipient_binding_hash_len
    check (char_length(recipient_binding_hash) = 64),
  constraint disclosure_grants_device_ref_hash_len
    check (char_length(created_by_device_ref) = 64),
  constraint disclosure_grants_expiration_required
    check (expires_at > created_at),
  constraint disclosure_grants_access_count_nonnegative
    check (access_count >= 0),
  constraint disclosure_grants_max_access_count_positive
    check (max_access_count > 0),
  constraint disclosure_grants_revoked_consistent
    check (status <> 'revoked' or revoked_at is not null)
);

create unique index if not exists disclosure_grants_public_handle_hash_idx
  on public.disclosure_grants (public_handle_hash);

create index if not exists disclosure_grants_vault_created_idx
  on public.disclosure_grants (vault_ref_hash, created_at desc);

create table if not exists public.disclosure_grant_events (
  event_id uuid primary key default gen_random_uuid(),
  grant_ref uuid not null references public.disclosure_grants(grant_id) on delete cascade,
  event_type text not null,
  actor_type text not null,
  result text not null,
  reason_code text,
  timestamp timestamptz not null default now(),
  previous_event_hash char(64) not null,
  event_hash char(64) not null,
  metadata jsonb not null default '{}'::jsonb,

  constraint disclosure_grant_events_type_allowed
    check (
      event_type in (
        'grant.created',
        'recipient.accepted',
        'grant.verified',
        'grant.revoked',
        'grant.expired',
        'access.denied'
      )
    ),
  constraint disclosure_grant_events_actor_allowed
    check (actor_type in ('owner', 'recipient', 'system', 'sentinel')),
  constraint disclosure_grant_events_result_allowed
    check (result in ('success', 'denied', 'expired', 'revoked')),
  constraint disclosure_grant_events_prev_hash_len
    check (char_length(previous_event_hash) = 64),
  constraint disclosure_grant_events_hash_len
    check (char_length(event_hash) = 64),
  constraint disclosure_grant_events_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index if not exists disclosure_grant_events_grant_timestamp_idx
  on public.disclosure_grant_events (grant_ref, timestamp asc);

create table if not exists public.disclosure_access_sessions (
  session_id uuid primary key default gen_random_uuid(),
  grant_ref uuid not null references public.disclosure_grants(grant_id) on delete cascade,
  recipient_binding_hash char(64) not null,
  session_token_hash char(64) not null,
  status text not null default 'active',
  expires_at timestamptz not null,
  last_accessed_at timestamptz,
  access_count integer not null default 0,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,

  constraint disclosure_access_sessions_recipient_hash_len
    check (char_length(recipient_binding_hash) = 64),
  constraint disclosure_access_sessions_token_hash_len
    check (char_length(session_token_hash) = 64),
  constraint disclosure_access_sessions_status_allowed
    check (status in ('active', 'revoked', 'expired')),
  constraint disclosure_access_sessions_expiration_required
    check (expires_at > created_at),
  constraint disclosure_access_sessions_access_count_nonnegative
    check (access_count >= 0),
  constraint disclosure_access_sessions_revoked_consistent
    check (status <> 'revoked' or revoked_at is not null)
);

create unique index if not exists disclosure_access_sessions_token_hash_idx
  on public.disclosure_access_sessions (session_token_hash);

create index if not exists disclosure_access_sessions_grant_status_idx
  on public.disclosure_access_sessions (grant_ref, status);

alter table public.disclosure_grants enable row level security;
alter table public.disclosure_grant_events enable row level security;
alter table public.disclosure_access_sessions enable row level security;

revoke all on table public.disclosure_grants from anon, authenticated, public;
revoke all on table public.disclosure_grant_events from anon, authenticated, public;
revoke all on table public.disclosure_access_sessions from anon, authenticated, public;

grant select, insert, update, delete on table public.disclosure_grants to service_role;
grant select, insert on table public.disclosure_grant_events to service_role;
grant select, insert, update, delete on table public.disclosure_access_sessions to service_role;

commit;

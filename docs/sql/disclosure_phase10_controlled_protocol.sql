-- ProofOrigin Phase 10 — Controlled Disclosure Protocol
-- Prerequisite: docs/sql/disclosure_grants.sql and Phase 9A-1 hardening applied.
--
-- Adds immutable policy snapshots, successful access receipts, and scoped_verify grants.
-- Review before applying in Supabase.

begin;

create extension if not exists pgcrypto;

create table if not exists public.disclosure_policies (
  policy_id uuid primary key default gen_random_uuid(),
  policy_version integer not null default 1,
  vault_ref_hash char(64) not null,
  created_by_device_ref char(64) not null,
  scope_type text not null,
  scope_ref_hash char(64) not null,
  grant_type text not null default 'scoped_verify',
  recipient_binding_mode text not null default 'challenge_hash',
  recipient_binding_hash char(64) not null,
  purpose_label text not null,
  condition_profile jsonb not null default '{}'::jsonb,
  condition_profile_hash char(64) not null,
  policy_snapshot_hash char(64) not null,
  status text not null default 'active',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,

  constraint disclosure_policies_vault_ref_hash_len
    check (char_length(vault_ref_hash) = 64),
  constraint disclosure_policies_device_ref_hash_len
    check (char_length(created_by_device_ref) = 64),
  constraint disclosure_policies_scope_ref_hash_len
    check (char_length(scope_ref_hash) = 64),
  constraint disclosure_policies_recipient_binding_hash_len
    check (char_length(recipient_binding_hash) = 64),
  constraint disclosure_policies_condition_profile_hash_len
    check (char_length(condition_profile_hash) = 64),
  constraint disclosure_policies_snapshot_hash_len
    check (char_length(policy_snapshot_hash) = 64),
  constraint disclosure_policies_scope_type_allowed
    check (scope_type in ('vault_claim', 'document_ref', 'identity_claim')),
  constraint disclosure_policies_grant_type_allowed
    check (grant_type in ('scoped_verify')),
  constraint disclosure_policies_binding_mode_allowed
    check (recipient_binding_mode in ('challenge_hash')),
  constraint disclosure_policies_status_allowed
    check (status in ('draft', 'active', 'revoked', 'expired', 'archived')),
  constraint disclosure_policies_condition_profile_object
    check (jsonb_typeof(condition_profile) = 'object'),
  constraint disclosure_policies_expiration_required
    check (expires_at > created_at),
  constraint disclosure_policies_revoked_consistent
    check (status <> 'revoked' or revoked_at is not null)
);

create index if not exists disclosure_policies_vault_status_created_idx
  on public.disclosure_policies (vault_ref_hash, status, created_at desc);

create index if not exists disclosure_policies_scope_ref_idx
  on public.disclosure_policies (scope_ref_hash, created_at desc);

create table if not exists public.disclosure_receipts (
  receipt_id uuid primary key default gen_random_uuid(),
  grant_ref uuid not null references public.disclosure_grants(grant_id) on delete cascade,
  policy_ref uuid not null references public.disclosure_policies(policy_id) on delete cascade,
  session_ref uuid not null references public.disclosure_access_sessions(session_id) on delete cascade,
  event_ref uuid not null references public.disclosure_grant_events(event_id) on delete cascade,
  scope_type text not null,
  scope_ref_hash char(64) not null,
  recipient_binding_hash char(64) not null,
  policy_snapshot_hash char(64) not null,
  condition_profile_hash char(64) not null,
  custody_snapshot_hash char(64) not null,
  disclosure_digest char(64) not null,
  result text not null default 'success',
  receipt_hash char(64) not null,
  created_at timestamptz not null default now(),

  constraint disclosure_receipts_scope_ref_hash_len
    check (char_length(scope_ref_hash) = 64),
  constraint disclosure_receipts_recipient_binding_hash_len
    check (char_length(recipient_binding_hash) = 64),
  constraint disclosure_receipts_policy_snapshot_hash_len
    check (char_length(policy_snapshot_hash) = 64),
  constraint disclosure_receipts_condition_profile_hash_len
    check (char_length(condition_profile_hash) = 64),
  constraint disclosure_receipts_custody_snapshot_hash_len
    check (char_length(custody_snapshot_hash) = 64),
  constraint disclosure_receipts_disclosure_digest_len
    check (char_length(disclosure_digest) = 64),
  constraint disclosure_receipts_receipt_hash_len
    check (char_length(receipt_hash) = 64),
  constraint disclosure_receipts_scope_type_allowed
    check (scope_type in ('vault_claim', 'document_ref', 'identity_claim')),
  constraint disclosure_receipts_result_allowed
    check (result in ('success'))
);

create index if not exists disclosure_receipts_grant_created_idx
  on public.disclosure_receipts (grant_ref, created_at desc);

create index if not exists disclosure_receipts_policy_created_idx
  on public.disclosure_receipts (policy_ref, created_at desc);

create unique index if not exists disclosure_receipts_event_ref_uidx
  on public.disclosure_receipts (event_ref);

alter table public.disclosure_grants
  add column if not exists policy_ref uuid references public.disclosure_policies(policy_id),
  add column if not exists scope_type text;

alter table public.disclosure_grants
  drop constraint if exists disclosure_grants_type_allowed;

alter table public.disclosure_grants
  add constraint disclosure_grants_type_allowed
    check (grant_type in ('verify_only', 'scoped_verify'));

alter table public.disclosure_grant_events
  drop constraint if exists disclosure_grant_events_type_allowed;

alter table public.disclosure_grant_events
  add constraint disclosure_grant_events_type_allowed
    check (
      event_type in (
        'grant.created',
        'recipient.accepted',
        'grant.verified',
        'grant.revoked',
        'grant.expired',
        'access.denied',
        'access.receipted',
        'custody.blocked'
      )
    );

alter table public.disclosure_policies enable row level security;
alter table public.disclosure_receipts enable row level security;

revoke all on table public.disclosure_policies from anon, authenticated, public;
revoke all on table public.disclosure_receipts from anon, authenticated, public;

grant select, insert, update, delete on table public.disclosure_policies to service_role;
grant select, insert on table public.disclosure_receipts to service_role;

commit;

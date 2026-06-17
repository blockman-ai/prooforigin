-- ProofOrigin Phase 10 — Controlled Disclosure Protocol REPAIR migration
-- Run in Supabase SQL Editor without BEGIN/COMMIT.
-- Prerequisite: disclosure_grants.sql and Phase 9A-1 hardening applied.

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

alter table public.disclosure_grants
  add column if not exists policy_ref uuid,
  add column if not exists scope_type text;

alter table public.disclosure_grants
  drop constraint if exists disclosure_grants_type_allowed;

alter table public.disclosure_grants
  add constraint disclosure_grants_type_allowed
    check (grant_type in ('verify_only', 'scoped_verify'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'disclosure_grants_policy_ref_fkey'
  ) then
    alter table public.disclosure_grants
      add constraint disclosure_grants_policy_ref_fkey
      foreign key (policy_ref) references public.disclosure_policies(policy_id);
  end if;
end $$;

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

create or replace function public.disclosure_access_grant_atomic(
  p_grant_id uuid,
  p_session_id uuid,
  p_event_type text,
  p_actor_type text,
  p_result text,
  p_reason_code text,
  p_timestamp timestamptz,
  p_previous_event_hash char(64),
  p_event_hash char(64),
  p_metadata jsonb,
  p_policy_ref uuid,
  p_scope_type text,
  p_scope_ref_hash char(64),
  p_recipient_binding_hash char(64),
  p_policy_snapshot_hash char(64),
  p_condition_profile_hash char(64),
  p_custody_snapshot_hash char(64),
  p_disclosure_digest char(64),
  p_receipt_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_genesis_hash constant char(64) := '7a82e023756054ee9c1f164a173a0602b848a0999be0bb1f2dc486a53c304fa7';
  v_grant public.disclosure_grants%rowtype;
  v_session public.disclosure_access_sessions%rowtype;
  v_event public.disclosure_grant_events%rowtype;
  v_receipt public.disclosure_receipts%rowtype;
  v_latest_hash char(64);
  v_receipt_hash char(64);
begin
  perform pg_advisory_xact_lock(hashtextextended(p_grant_id::text, 0));

  select coalesce(
    (
      select e.event_hash
      from public.disclosure_grant_events e
      where e.grant_ref = p_grant_id
      order by e.timestamp desc, e.event_id desc
      limit 1
    ),
    v_genesis_hash
  )
  into v_latest_hash;

  if v_latest_hash <> p_previous_event_hash then
    raise exception 'event_chain_desync';
  end if;

  select *
  into v_grant
  from public.disclosure_grants
  where grant_id = p_grant_id
  for update;

  if not found then
    raise exception 'grant_not_found';
  end if;

  if v_grant.access_count >= v_grant.max_access_count then
    raise exception 'access_cap_reached';
  end if;

  select *
  into v_session
  from public.disclosure_access_sessions
  where session_id = p_session_id
    and grant_ref = p_grant_id
  for update;

  if not found then
    raise exception 'session_not_found';
  end if;

  insert into public.disclosure_grant_events (
    grant_ref,
    event_type,
    actor_type,
    result,
    reason_code,
    timestamp,
    previous_event_hash,
    event_hash,
    metadata
  )
  values (
    p_grant_id,
    p_event_type,
    p_actor_type,
    p_result,
    p_reason_code,
    p_timestamp,
    p_previous_event_hash,
    p_event_hash,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_event;

  update public.disclosure_grants
  set
    access_count = access_count + 1,
    updated_at = now()
  where grant_id = p_grant_id
  returning * into v_grant;

  update public.disclosure_access_sessions
  set
    access_count = access_count + 1,
    last_accessed_at = now()
  where session_id = p_session_id
  returning * into v_session;

  v_receipt_hash := public.prooforigin_sha256_hex(
    concat_ws(
      chr(10),
      'prooforigin-disclosure-receipt-v1',
      p_receipt_id::text,
      p_grant_id::text,
      p_policy_ref::text,
      p_session_id::text,
      v_event.event_id::text,
      p_scope_type,
      p_scope_ref_hash,
      p_recipient_binding_hash,
      p_policy_snapshot_hash,
      p_condition_profile_hash,
      p_custody_snapshot_hash,
      p_disclosure_digest,
      'success',
      to_char(p_timestamp at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )
  );

  insert into public.disclosure_receipts (
    receipt_id,
    grant_ref,
    policy_ref,
    session_ref,
    event_ref,
    scope_type,
    scope_ref_hash,
    recipient_binding_hash,
    policy_snapshot_hash,
    condition_profile_hash,
    custody_snapshot_hash,
    disclosure_digest,
    result,
    receipt_hash,
    created_at
  )
  values (
    p_receipt_id,
    p_grant_id,
    p_policy_ref,
    p_session_id,
    v_event.event_id,
    p_scope_type,
    p_scope_ref_hash,
    p_recipient_binding_hash,
    p_policy_snapshot_hash,
    p_condition_profile_hash,
    p_custody_snapshot_hash,
    p_disclosure_digest,
    'success',
    v_receipt_hash,
    p_timestamp
  )
  returning * into v_receipt;

  return jsonb_build_object(
    'event', jsonb_build_object(
      'event_id', v_event.event_id,
      'grant_ref', v_event.grant_ref,
      'event_type', v_event.event_type,
      'actor_type', v_event.actor_type,
      'result', v_event.result,
      'reason_code', v_event.reason_code,
      'timestamp', v_event.timestamp,
      'previous_event_hash', v_event.previous_event_hash,
      'event_hash', v_event.event_hash,
      'metadata', v_event.metadata
    ),
    'grant', jsonb_build_object(
      'grant_id', v_grant.grant_id,
      'access_count', v_grant.access_count,
      'max_access_count', v_grant.max_access_count
    ),
    'session', jsonb_build_object(
      'session_id', v_session.session_id,
      'access_count', v_session.access_count
    ),
    'receipt', jsonb_build_object(
      'receipt_id', v_receipt.receipt_id,
      'grant_ref', v_receipt.grant_ref,
      'policy_ref', v_receipt.policy_ref,
      'session_ref', v_receipt.session_ref,
      'event_ref', v_receipt.event_ref,
      'scope_type', v_receipt.scope_type,
      'scope_ref_hash', v_receipt.scope_ref_hash,
      'recipient_binding_hash', v_receipt.recipient_binding_hash,
      'policy_snapshot_hash', v_receipt.policy_snapshot_hash,
      'condition_profile_hash', v_receipt.condition_profile_hash,
      'custody_snapshot_hash', v_receipt.custody_snapshot_hash,
      'disclosure_digest', v_receipt.disclosure_digest,
      'result', v_receipt.result,
      'receipt_hash', v_receipt.receipt_hash,
      'created_at', v_receipt.created_at
    )
  );
end;
$$;

-- Single-line signatures: Supabase SQL Editor can misparse multiline REVOKE/GRANT.
revoke all on function public.disclosure_access_grant_atomic(uuid, uuid, text, text, text, text, timestamptz, char, char, jsonb, uuid, text, char, char, char, char, char, char, uuid) from public, anon, authenticated;

grant execute on function public.disclosure_access_grant_atomic(uuid, uuid, text, text, text, text, timestamptz, char, char, jsonb, uuid, text, char, char, char, char, char, char, uuid) to service_role;

alter table public.disclosure_policies enable row level security;
alter table public.disclosure_receipts enable row level security;

revoke all on table public.disclosure_policies from anon, authenticated, public;
revoke all on table public.disclosure_receipts from anon, authenticated, public;

grant select, insert, update, delete on table public.disclosure_policies to service_role;
grant select, insert on table public.disclosure_receipts to service_role;

select tablename
from pg_tables
where schemaname = 'public'
  and tablename in ('disclosure_policies', 'disclosure_receipts');

select
  n.nspname as schema_name,
  p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'disclosure_access_grant_atomic';

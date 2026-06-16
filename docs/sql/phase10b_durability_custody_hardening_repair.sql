-- ProofOrigin Phase 10B — Durability & Custody Chain Hardening REPAIR migration
-- Run in Supabase SQL Editor without BEGIN/COMMIT.
-- Prerequisites:
-- - docs/sql/vault_p1_integrity.sql
-- - docs/sql/disclosure_grants.sql
-- - docs/sql/disclosure_grants_phase9a1_hardening_repair.sql
-- - docs/sql/disclosure_phase10_controlled_protocol_repair.sql

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Step 0: preflight diagnostics for document-chain fork repair.
-- If this returns rows, repair duplicates before creating the unique index.
-- ---------------------------------------------------------------------------
select
  document_id,
  previous_state_hash,
  count(*) as duplicate_count
from public.vault_document_state_events
group by document_id, previous_state_hash
having count(*) > 1;

-- ---------------------------------------------------------------------------
-- Step 1: durable disclosure confirmation nonces
-- ---------------------------------------------------------------------------
create table if not exists public.disclosure_confirmation_nonces (
  nonce_hash char(64) primary key,
  vault_ref_hash char(64) not null,
  device_ref_hash char(64) not null,
  purpose text not null default 'disclosure',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,

  constraint disclosure_confirmation_nonces_nonce_hash_len
    check (char_length(nonce_hash) = 64),
  constraint disclosure_confirmation_nonces_vault_ref_hash_len
    check (char_length(vault_ref_hash) = 64),
  constraint disclosure_confirmation_nonces_device_ref_hash_len
    check (char_length(device_ref_hash) = 64),
  constraint disclosure_confirmation_nonces_purpose_allowed
    check (purpose in ('disclosure', 'disclosure_policy')),
  constraint disclosure_confirmation_nonces_expiration_required
    check (expires_at > created_at)
);

create index if not exists disclosure_confirmation_nonces_expires_idx
  on public.disclosure_confirmation_nonces (expires_at);

create or replace function public.disclosure_issue_confirmation_nonce_atomic(
  p_nonce_hash char(64),
  p_vault_ref_hash char(64),
  p_device_ref_hash char(64),
  p_purpose text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.disclosure_confirmation_nonces (
    nonce_hash,
    vault_ref_hash,
    device_ref_hash,
    purpose,
    expires_at
  )
  values (
    p_nonce_hash,
    p_vault_ref_hash,
    p_device_ref_hash,
    coalesce(nullif(p_purpose, ''), 'disclosure'),
    p_expires_at
  );

  return jsonb_build_object('ok', true);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'CONFIRMATION_NONCE_COLLISION');
end;
$$;

create or replace function public.disclosure_consume_confirmation_nonce_atomic(
  p_nonce_hash char(64),
  p_vault_ref_hash char(64),
  p_device_ref_hash char(64),
  p_purpose text,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nonce public.disclosure_confirmation_nonces%rowtype;
begin
  select *
  into v_nonce
  from public.disclosure_confirmation_nonces
  where nonce_hash = p_nonce_hash
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'CONFIRMATION_NONCE_INVALID');
  end if;

  if v_nonce.consumed_at is not null then
    return jsonb_build_object('ok', false, 'code', 'CONFIRMATION_NONCE_ALREADY_USED');
  end if;

  if v_nonce.expires_at <= p_now then
    return jsonb_build_object('ok', false, 'code', 'CONFIRMATION_NONCE_EXPIRED');
  end if;

  if
    v_nonce.vault_ref_hash <> p_vault_ref_hash or
    v_nonce.device_ref_hash <> p_device_ref_hash or
    v_nonce.purpose <> coalesce(nullif(p_purpose, ''), 'disclosure')
  then
    return jsonb_build_object('ok', false, 'code', 'CONFIRMATION_NONCE_SCOPE_MISMATCH');
  end if;

  update public.disclosure_confirmation_nonces
  set consumed_at = p_now
  where nonce_hash = p_nonce_hash;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Step 2: durable rate-limit buckets and lockouts
-- ---------------------------------------------------------------------------
create table if not exists public.prooforigin_rate_limit_buckets (
  bucket_key text primary key,
  scope text not null default 'general',
  window_start timestamptz not null,
  window_ms integer not null,
  count integer not null default 0,
  expires_at timestamptz not null,

  constraint prooforigin_rate_limit_buckets_window_positive
    check (window_ms > 0),
  constraint prooforigin_rate_limit_buckets_count_nonnegative
    check (count >= 0)
);

create index if not exists prooforigin_rate_limit_buckets_expires_idx
  on public.prooforigin_rate_limit_buckets (expires_at);

create table if not exists public.prooforigin_lockouts (
  lockout_key text primary key,
  reason text not null default 'recipient_failure',
  failure_count integer not null default 0,
  window_start timestamptz not null,
  window_ms integer not null,
  locked_until timestamptz,
  expires_at timestamptz not null,

  constraint prooforigin_lockouts_failure_count_nonnegative
    check (failure_count >= 0),
  constraint prooforigin_lockouts_window_positive
    check (window_ms > 0)
);

create index if not exists prooforigin_lockouts_expires_idx
  on public.prooforigin_lockouts (expires_at);

create or replace function public.prooforigin_check_rate_limit_atomic(
  p_bucket_key text,
  p_scope text,
  p_limit integer,
  p_window_ms integer,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bucket public.prooforigin_rate_limit_buckets%rowtype;
  v_window_interval interval := make_interval(secs => (p_window_ms::numeric / 1000.0));
  v_retry_after_ms integer := 0;
begin
  if p_bucket_key is null or p_bucket_key = '' or p_limit <= 0 or p_window_ms <= 0 then
    return jsonb_build_object('allowed', true, 'remaining', p_limit, 'retry_after_ms', 0);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_bucket_key, 0));

  select *
  into v_bucket
  from public.prooforigin_rate_limit_buckets
  where bucket_key = p_bucket_key
  for update;

  if not found or v_bucket.expires_at <= p_now then
    insert into public.prooforigin_rate_limit_buckets (
      bucket_key,
      scope,
      window_start,
      window_ms,
      count,
      expires_at
    )
    values (
      p_bucket_key,
      coalesce(nullif(p_scope, ''), 'general'),
      p_now,
      p_window_ms,
      1,
      p_now + v_window_interval
    )
    on conflict (bucket_key) do update
    set
      scope = excluded.scope,
      window_start = excluded.window_start,
      window_ms = excluded.window_ms,
      count = excluded.count,
      expires_at = excluded.expires_at
    returning * into v_bucket;

    return jsonb_build_object(
      'allowed', true,
      'remaining', greatest(0, p_limit - v_bucket.count),
      'retry_after_ms', 0
    );
  end if;

  if v_bucket.count >= p_limit then
    v_retry_after_ms := greatest(
      0,
      ceil(extract(epoch from (v_bucket.expires_at - p_now)) * 1000)::integer
    );
    return jsonb_build_object(
      'allowed', false,
      'remaining', 0,
      'retry_after_ms', v_retry_after_ms
    );
  end if;

  update public.prooforigin_rate_limit_buckets
  set count = count + 1
  where bucket_key = p_bucket_key
  returning * into v_bucket;

  return jsonb_build_object(
    'allowed', true,
    'remaining', greatest(0, p_limit - v_bucket.count),
    'retry_after_ms', 0
  );
end;
$$;

create or replace function public.prooforigin_get_lockout_state(
  p_lockout_key text,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lockout public.prooforigin_lockouts%rowtype;
  v_retry_after_ms integer := 0;
begin
  select *
  into v_lockout
  from public.prooforigin_lockouts
  where lockout_key = p_lockout_key;

  if not found or v_lockout.locked_until is null or v_lockout.locked_until <= p_now then
    return jsonb_build_object('locked', false, 'retry_after_ms', 0);
  end if;

  v_retry_after_ms := greatest(
    0,
    ceil(extract(epoch from (v_lockout.locked_until - p_now)) * 1000)::integer
  );

  return jsonb_build_object('locked', true, 'retry_after_ms', v_retry_after_ms);
end;
$$;

create or replace function public.prooforigin_record_lockout_failure_atomic(
  p_lockout_key text,
  p_reason text,
  p_threshold integer,
  p_window_ms integer,
  p_lockout_ms integer,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lockout public.prooforigin_lockouts%rowtype;
  v_window_interval interval := make_interval(secs => (p_window_ms::numeric / 1000.0));
  v_lockout_interval interval := make_interval(secs => (p_lockout_ms::numeric / 1000.0));
begin
  if p_lockout_key is null or p_lockout_key = '' then
    return jsonb_build_object('locked', false, 'failure_count', 0, 'retry_after_ms', 0);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_lockout_key, 0));

  select *
  into v_lockout
  from public.prooforigin_lockouts
  where lockout_key = p_lockout_key
  for update;

  if not found or v_lockout.expires_at <= p_now then
    insert into public.prooforigin_lockouts (
      lockout_key,
      reason,
      failure_count,
      window_start,
      window_ms,
      locked_until,
      expires_at
    )
    values (
      p_lockout_key,
      coalesce(nullif(p_reason, ''), 'recipient_failure'),
      1,
      p_now,
      p_window_ms,
      null,
      p_now + v_window_interval
    )
    on conflict (lockout_key) do update
    set
      reason = excluded.reason,
      failure_count = excluded.failure_count,
      window_start = excluded.window_start,
      window_ms = excluded.window_ms,
      locked_until = excluded.locked_until,
      expires_at = excluded.expires_at
    returning * into v_lockout;
  else
    update public.prooforigin_lockouts
    set
      failure_count = failure_count + 1,
      expires_at = greatest(expires_at, p_now + v_window_interval)
    where lockout_key = p_lockout_key
    returning * into v_lockout;
  end if;

  if v_lockout.failure_count >= p_threshold then
    update public.prooforigin_lockouts
    set
      locked_until = p_now + v_lockout_interval,
      failure_count = 0,
      window_start = p_now,
      expires_at = p_now + v_lockout_interval
    where lockout_key = p_lockout_key
    returning * into v_lockout;
  end if;

  return public.prooforigin_get_lockout_state(p_lockout_key, p_now);
end;
$$;

-- ---------------------------------------------------------------------------
-- Step 3: document state chain parity
-- ---------------------------------------------------------------------------
create unique index if not exists vault_document_state_events_document_prev_hash_uidx
  on public.vault_document_state_events (document_id, previous_state_hash);

create index if not exists vault_document_state_events_document_created_id_idx
  on public.vault_document_state_events (document_id, created_at asc, id asc);

create index if not exists vault_document_state_events_document_latest_idx
  on public.vault_document_state_events (document_id, created_at desc, id desc);

create or replace function public.vault_append_document_state_event_atomic(
  p_document_id uuid,
  p_event_type text,
  p_previous_state_hash char(64),
  p_state_hash char(64),
  p_created_at timestamptz,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_genesis_hash constant char(64) := 'b4f2dbaae25f752dd6d5582e80fd1cfd5e593edfce6c532eb11fe2dad4f2c518';
  v_latest_hash char(64);
  v_event public.vault_document_state_events%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_document_id::text, 0));

  select coalesce(
    (
      select e.state_hash
      from public.vault_document_state_events e
      where e.document_id = p_document_id
      order by e.created_at desc, e.id desc
      limit 1
    ),
    v_genesis_hash
  )
  into v_latest_hash;

  if v_latest_hash <> p_previous_state_hash then
    raise exception 'document_chain_desync';
  end if;

  insert into public.vault_document_state_events (
    document_id,
    event_type,
    previous_state_hash,
    state_hash,
    created_at,
    metadata
  )
  values (
    p_document_id,
    p_event_type,
    p_previous_state_hash,
    p_state_hash,
    p_created_at,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_event;

  return to_jsonb(v_event);
end;
$$;

create or replace function public.vault_mark_document_compromised_atomic(
  p_document_id uuid,
  p_reason text,
  p_previous_state_hash char(64),
  p_state_hash char(64),
  p_created_at timestamptz,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_genesis_hash constant char(64) := 'b4f2dbaae25f752dd6d5582e80fd1cfd5e593edfce6c532eb11fe2dad4f2c518';
  v_latest_hash char(64);
  v_event public.vault_document_state_events%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_document_id::text, 0));

  select coalesce(
    (
      select e.state_hash
      from public.vault_document_state_events e
      where e.document_id = p_document_id
      order by e.created_at desc, e.id desc
      limit 1
    ),
    v_genesis_hash
  )
  into v_latest_hash;

  if v_latest_hash <> p_previous_state_hash then
    raise exception 'document_chain_desync';
  end if;

  update public.vault_documents
  set
    compromised_at = coalesce(compromised_at, p_created_at),
    updated_at = now()
  where id = p_document_id
    and deleted_at is null;

  if not found then
    raise exception 'document_not_found';
  end if;

  insert into public.vault_document_state_events (
    document_id,
    event_type,
    previous_state_hash,
    state_hash,
    created_at,
    metadata
  )
  values (
    p_document_id,
    'compromised',
    p_previous_state_hash,
    p_state_hash,
    p_created_at,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('reason', p_reason)
  )
  returning * into v_event;

  return to_jsonb(v_event);
end;
$$;

create or replace function public.vault_mark_document_deleted_atomic(
  p_document_id uuid,
  p_previous_state_hash char(64),
  p_state_hash char(64),
  p_created_at timestamptz,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_genesis_hash constant char(64) := 'b4f2dbaae25f752dd6d5582e80fd1cfd5e593edfce6c532eb11fe2dad4f2c518';
  v_latest_hash char(64);
  v_event public.vault_document_state_events%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_document_id::text, 0));

  select coalesce(
    (
      select e.state_hash
      from public.vault_document_state_events e
      where e.document_id = p_document_id
      order by e.created_at desc, e.id desc
      limit 1
    ),
    v_genesis_hash
  )
  into v_latest_hash;

  if v_latest_hash <> p_previous_state_hash then
    raise exception 'document_chain_desync';
  end if;

  update public.vault_documents
  set
    deleted_at = coalesce(deleted_at, p_created_at),
    updated_at = now()
  where id = p_document_id
    and deleted_at is null;

  if not found then
    raise exception 'document_not_found';
  end if;

  insert into public.vault_document_state_events (
    document_id,
    event_type,
    previous_state_hash,
    state_hash,
    created_at,
    metadata
  )
  values (
    p_document_id,
    'deleted',
    p_previous_state_hash,
    p_state_hash,
    p_created_at,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_event;

  return to_jsonb(v_event);
end;
$$;

-- ---------------------------------------------------------------------------
-- Step 4: service-role only permissions
-- ---------------------------------------------------------------------------
alter table public.disclosure_confirmation_nonces enable row level security;
alter table public.prooforigin_rate_limit_buckets enable row level security;
alter table public.prooforigin_lockouts enable row level security;

revoke all on table public.disclosure_confirmation_nonces from anon, authenticated, public;
revoke all on table public.prooforigin_rate_limit_buckets from anon, authenticated, public;
revoke all on table public.prooforigin_lockouts from anon, authenticated, public;

grant select, insert, update, delete on table public.disclosure_confirmation_nonces to service_role;
grant select, insert, update, delete on table public.prooforigin_rate_limit_buckets to service_role;
grant select, insert, update, delete on table public.prooforigin_lockouts to service_role;

-- Single-line function signatures for Supabase SQL Editor compatibility.
revoke all on function public.disclosure_issue_confirmation_nonce_atomic(char, char, char, text, timestamptz) from public, anon, authenticated;
grant execute on function public.disclosure_issue_confirmation_nonce_atomic(char, char, char, text, timestamptz) to service_role;

revoke all on function public.disclosure_consume_confirmation_nonce_atomic(char, char, char, text, timestamptz) from public, anon, authenticated;
grant execute on function public.disclosure_consume_confirmation_nonce_atomic(char, char, char, text, timestamptz) to service_role;

revoke all on function public.prooforigin_check_rate_limit_atomic(text, text, integer, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.prooforigin_check_rate_limit_atomic(text, text, integer, integer, timestamptz) to service_role;

revoke all on function public.prooforigin_get_lockout_state(text, timestamptz) from public, anon, authenticated;
grant execute on function public.prooforigin_get_lockout_state(text, timestamptz) to service_role;

revoke all on function public.prooforigin_record_lockout_failure_atomic(text, text, integer, integer, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.prooforigin_record_lockout_failure_atomic(text, text, integer, integer, integer, timestamptz) to service_role;

revoke all on function public.vault_append_document_state_event_atomic(uuid, text, char, char, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.vault_append_document_state_event_atomic(uuid, text, char, char, timestamptz, jsonb) to service_role;

revoke all on function public.vault_mark_document_compromised_atomic(uuid, text, char, char, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.vault_mark_document_compromised_atomic(uuid, text, char, char, timestamptz, jsonb) to service_role;

revoke all on function public.vault_mark_document_deleted_atomic(uuid, char, char, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.vault_mark_document_deleted_atomic(uuid, char, char, timestamptz, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Step 5: validation queries
-- ---------------------------------------------------------------------------
select tablename
from pg_tables
where schemaname = 'public'
  and tablename in (
    'disclosure_confirmation_nonces',
    'prooforigin_rate_limit_buckets',
    'prooforigin_lockouts'
  );

select indexname
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'vault_document_state_events_document_prev_hash_uidx',
    'prooforigin_rate_limit_buckets_expires_idx',
    'prooforigin_lockouts_expires_idx'
  );

select
  n.nspname as schema_name,
  p.proname as function_name,
  p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'disclosure_issue_confirmation_nonce_atomic',
    'disclosure_consume_confirmation_nonce_atomic',
    'prooforigin_check_rate_limit_atomic',
    'prooforigin_get_lockout_state',
    'prooforigin_record_lockout_failure_atomic',
    'vault_append_document_state_event_atomic',
    'vault_mark_document_compromised_atomic',
    'vault_mark_document_deleted_atomic'
  );

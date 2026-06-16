-- ProofOrigin Phase 9A-1 — disclosure hardening REPAIR migration
-- Run in Supabase SQL Editor against the SAME project as NEXT_PUBLIC_SUPABASE_URL.
--
-- Why a repair file exists:
-- The original docs/sql/disclosure_grants_phase9a1_hardening.sql wraps all DDL in
-- BEGIN/COMMIT. If ANY statement fails (missing base tables, duplicate chain rows,
-- permission error), PostgreSQL rolls back the entire transaction and nothing is
-- created — yet Supabase may still show a generic success message for the editor run.
--
-- This repair file:
-- - Does NOT use BEGIN/COMMIT (each statement auto-commits independently)
-- - Creates the unique index and RPC explicitly
-- - Revokes execute from public, anon, authenticated
-- - Grants execute to service_role only
-- - Ends with validation SELECTs that MUST return rows when successful
--
-- Prerequisite: docs/sql/disclosure_grants.sql must already be applied.

-- ---------------------------------------------------------------------------
-- Step 0 (optional diagnostic): duplicate parent hashes block the unique index
-- If this returns rows, resolve duplicates before creating the index.
-- ---------------------------------------------------------------------------
select
  grant_ref,
  previous_event_hash,
  count(*) as duplicate_count
from public.disclosure_grant_events
group by grant_ref, previous_event_hash
having count(*) > 1;

-- ---------------------------------------------------------------------------
-- Step 1: unique index (fork prevention)
-- ---------------------------------------------------------------------------
create unique index if not exists disclosure_grant_events_grant_prev_hash_uidx
  on public.disclosure_grant_events (grant_ref, previous_event_hash);

-- ---------------------------------------------------------------------------
-- Step 2: atomic verify RPC
-- ---------------------------------------------------------------------------
create or replace function public.disclosure_verify_grant_atomic(
  p_grant_id uuid,
  p_session_id uuid,
  p_event_type text,
  p_actor_type text,
  p_result text,
  p_reason_code text,
  p_timestamp timestamptz,
  p_previous_event_hash char(64),
  p_event_hash char(64),
  p_metadata jsonb default '{}'::jsonb
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
  v_latest_hash char(64);
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
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Step 3: permissions (service_role only)
-- ---------------------------------------------------------------------------
revoke all on function public.disclosure_verify_grant_atomic(
  uuid, uuid, text, text, text, text, timestamptz, char, char, jsonb
) from public;

revoke all on function public.disclosure_verify_grant_atomic(
  uuid, uuid, text, text, text, text, timestamptz, char, char, jsonb
) from anon;

revoke all on function public.disclosure_verify_grant_atomic(
  uuid, uuid, text, text, text, text, timestamptz, char, char, jsonb
) from authenticated;

grant execute on function public.disclosure_verify_grant_atomic(
  uuid, uuid, text, text, text, text, timestamptz, char, char, jsonb
) to service_role;

-- ---------------------------------------------------------------------------
-- Step 4: validation (MUST return rows after successful repair)
-- ---------------------------------------------------------------------------
select
  n.nspname as schema_name,
  p.proname as function_name,
  p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'disclosure_verify_grant_atomic';

select
  schemaname,
  tablename,
  indexname
from pg_indexes
where schemaname = 'public'
  and indexname = 'disclosure_grant_events_grant_prev_hash_uidx';

select
  has_function_privilege(
    'service_role',
    'public.disclosure_verify_grant_atomic(uuid, uuid, text, text, text, text, timestamptz, char, char, jsonb)',
    'execute'
  ) as service_role_can_execute,
  has_function_privilege(
    'public',
    'public.disclosure_verify_grant_atomic(uuid, uuid, text, text, text, text, timestamptz, char, char, jsonb)',
    'execute'
  ) as public_can_execute,
  has_function_privilege(
    'anon',
    'public.disclosure_verify_grant_atomic(uuid, uuid, text, text, text, text, timestamptz, char, char, jsonb)',
    'execute'
  ) as anon_can_execute,
  has_function_privilege(
    'authenticated',
    'public.disclosure_verify_grant_atomic(uuid, uuid, text, text, text, text, timestamptz, char, char, jsonb)',
    'execute'
  ) as authenticated_can_execute;

-- Phase 10E-6: Asset Transfer MVP (two-party custody handoff)
-- Privacy:
-- - Stores opaque reference hashes, fingerprint hashes, and receipt hashes only.
-- - No identities, no plaintext recipient handles, no raw signatures (signature hash only).
-- - RLS remains locked down; service_role only.
-- Invariants enforced here:
-- - At most one pending transfer per asset (unique partial index).
-- - Exactly one current ownership claim per asset (unique partial index).
-- - Provenance records remain immutable (untouched by transfers).

begin;

create table if not exists public.asset_ownership_claims (
  claim_id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.registered_assets(asset_id) on delete cascade,
  claim_version integer not null,
  claimant_vault_ref_hash char(64) not null,
  claim_source text not null,
  transfer_ref uuid,
  previous_claim_id uuid,
  status text not null default 'current',
  claim_hash char(64) not null,
  created_at timestamptz not null default now(),

  constraint asset_ownership_claims_source_allowed
    check (claim_source in (
      'registration', 'transfer_accept', 'self_attested', 'disputed_claim'
    )),
  constraint asset_ownership_claims_status_allowed
    check (status in ('current', 'superseded', 'disputed')),
  constraint asset_ownership_claims_claimant_ref_len
    check (char_length(claimant_vault_ref_hash) = 64),
  constraint asset_ownership_claims_hash_len
    check (char_length(claim_hash) = 64),
  constraint asset_ownership_claims_version_positive
    check (claim_version >= 1)
);

create unique index if not exists asset_ownership_claims_asset_version_idx
  on public.asset_ownership_claims (asset_id, claim_version);

-- Exactly one current ownership claim per asset.
create unique index if not exists asset_ownership_claims_one_current_idx
  on public.asset_ownership_claims (asset_id)
  where status = 'current';

create index if not exists asset_ownership_claims_asset_created_idx
  on public.asset_ownership_claims (asset_id, claim_version asc);

create table if not exists public.asset_transfers (
  transfer_id uuid primary key,
  asset_id uuid not null references public.registered_assets(asset_id) on delete cascade,
  from_vault_ref_hash char(64) not null,
  from_device_ref_hash char(64) not null,
  public_handle_hash char(64) not null,
  recipient_binding_hash char(64) not null,
  transfer_terms text not null default 'custody_and_ownership',
  transfer_terms_hash char(64) not null,
  status text not null default 'pending',
  expires_at timestamptz not null,
  to_vault_ref_hash char(64),
  to_device_ref_hash char(64),
  previous_claim_id uuid,
  new_claim_id uuid,
  transfer_message_hash char(64),
  acceptance_signature_hash char(64),
  transfer_receipt_id uuid,
  transfer_receipt_hash char(64),
  custody_event_hash char(64),
  provenance_record_hash char(64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  declined_at timestamptz,
  revoked_at timestamptz,

  constraint asset_transfers_status_allowed
    check (status in ('pending', 'accepted', 'declined', 'expired', 'revoked')),
  constraint asset_transfers_terms_allowed
    check (transfer_terms in ('custody', 'custody_and_ownership')),
  constraint asset_transfers_from_vault_ref_len
    check (char_length(from_vault_ref_hash) = 64),
  constraint asset_transfers_from_device_ref_len
    check (char_length(from_device_ref_hash) = 64),
  constraint asset_transfers_public_handle_len
    check (char_length(public_handle_hash) = 64),
  constraint asset_transfers_recipient_binding_len
    check (char_length(recipient_binding_hash) = 64),
  constraint asset_transfers_terms_hash_len
    check (char_length(transfer_terms_hash) = 64),
  constraint asset_transfers_to_vault_ref_len
    check (to_vault_ref_hash is null or char_length(to_vault_ref_hash) = 64),
  constraint asset_transfers_to_device_ref_len
    check (to_device_ref_hash is null or char_length(to_device_ref_hash) = 64),
  constraint asset_transfers_receipt_hash_len
    check (transfer_receipt_hash is null or char_length(transfer_receipt_hash) = 64)
);

create unique index if not exists asset_transfers_public_handle_idx
  on public.asset_transfers (public_handle_hash);

-- At most one pending transfer per asset.
create unique index if not exists asset_transfers_one_pending_idx
  on public.asset_transfers (asset_id)
  where status = 'pending';

create unique index if not exists asset_transfers_receipt_id_idx
  on public.asset_transfers (transfer_receipt_id)
  where transfer_receipt_id is not null;

create index if not exists asset_transfers_from_vault_idx
  on public.asset_transfers (from_vault_ref_hash, created_at desc);

create index if not exists asset_transfers_to_vault_idx
  on public.asset_transfers (to_vault_ref_hash, created_at desc);

-- Transfer phases are recorded on the existing append-only custody chain. Extend
-- the allowed event-type set and add an optional transfer reference column.
alter table public.asset_custody_events
  add column if not exists related_transfer_id uuid;

alter table public.asset_custody_events
  drop constraint if exists asset_custody_events_type_allowed;

alter table public.asset_custody_events
  add constraint asset_custody_events_type_allowed
  check (event_type in (
    'registered', 'verified', 'disclosed', 'custody_transfer',
    'ownership_claim_update', 'retired',
    'transfer_initiated', 'transfer_accepted', 'transfer_declined',
    'transfer_expired', 'transfer_revoked'
  ));

-- Allow B's consume-once acceptance signature challenge to reuse the 10D-1 ceremony.
alter table public.vault_ownership_verifications
  drop constraint if exists vault_ownership_verifications_challenge_type_allowed;

alter table public.vault_ownership_verifications
  add constraint vault_ownership_verifications_challenge_type_allowed
  check (challenge_type in (
    'migration_authority_verify', 'ownership_key_register', 'asset_transfer_accept'
  ));

alter table public.asset_transfers enable row level security;
alter table public.asset_ownership_claims enable row level security;

-- Atomic two-party custody handoff. Phase 10E-6A (H1/M1 repair).
-- All-or-nothing: validates the transfer is still pending and that the offer source
-- still matches BOTH the current ownership claim and the registered asset owner, then
-- supersedes the prior claim, inserts the new current claim, reassigns custody, appends
-- the transfer_accepted custody event, and writes the transfer receipt onto the transfer
-- row. Any failure rolls the whole function back. No zero-current-claim window is visible
-- to other transactions (READ COMMITTED sees the pre-transaction state until commit).
create or replace function public.asset_transfer_accept_atomic(
  p_transfer_id uuid,
  p_asset_id uuid,
  p_from_vault_ref_hash char(64),
  p_to_vault_ref_hash char(64),
  p_to_device_ref_hash char(64),
  p_acceptance_signature_hash char(64),
  p_previous_claim_id uuid,
  p_new_claim_id uuid,
  p_new_claim_version integer,
  p_new_claim_hash char(64),
  p_claim_source text,
  p_event_type text,
  p_event_actor_type text,
  p_event_result text,
  p_event_previous_hash char(64),
  p_event_hash char(64),
  p_event_metadata jsonb,
  p_receipt_id uuid,
  p_receipt_hash char(64),
  p_provenance_record_hash char(64),
  p_asset_status text,
  p_accepted_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_genesis constant char(64) := repeat('0', 64);
  v_transfer public.asset_transfers%rowtype;
  v_asset public.registered_assets%rowtype;
  v_current public.asset_ownership_claims%rowtype;
  v_new_claim public.asset_ownership_claims%rowtype;
  v_event public.asset_custody_events%rowtype;
  v_latest char(64);
begin
  perform pg_advisory_xact_lock(hashtextextended(p_asset_id::text, 0));

  -- 1. Transfer must still be pending.
  select * into v_transfer
  from public.asset_transfers
  where transfer_id = p_transfer_id
  for update;
  if not found then
    raise exception 'transfer_not_found';
  end if;
  if v_transfer.status <> 'pending' then
    raise exception 'transfer_not_pending';
  end if;
  if v_transfer.from_vault_ref_hash <> p_from_vault_ref_hash then
    raise exception 'source_owner_mismatch';
  end if;

  -- 2a. Source must still own the registered asset.
  select * into v_asset
  from public.registered_assets
  where asset_id = p_asset_id
  for update;
  if not found then
    raise exception 'asset_not_found';
  end if;
  if v_asset.retired_at is not null then
    raise exception 'asset_retired';
  end if;
  if v_asset.vault_ref_hash <> p_from_vault_ref_hash then
    raise exception 'source_owner_mismatch';
  end if;

  -- 2b. Source must still hold the single current ownership claim.
  select * into v_current
  from public.asset_ownership_claims
  where asset_id = p_asset_id
    and status = 'current'
  for update;
  if not found then
    raise exception 'current_claim_missing';
  end if;
  if v_current.claim_id <> p_previous_claim_id then
    raise exception 'source_claim_mismatch';
  end if;
  if v_current.claimant_vault_ref_hash <> p_from_vault_ref_hash then
    raise exception 'source_claim_mismatch';
  end if;

  -- 3. Custody event chain must be at the expected head.
  select coalesce(
    (
      select e.event_hash
      from public.asset_custody_events e
      where e.asset_id = p_asset_id
      order by e.created_at desc, e.event_id desc
      limit 1
    ),
    v_genesis
  )
  into v_latest;
  if v_latest <> p_event_previous_hash then
    raise exception 'event_chain_desync';
  end if;

  -- 4. Supersede the prior current claim (leaves zero current within this txn only).
  update public.asset_ownership_claims
  set status = 'superseded'
  where claim_id = v_current.claim_id
    and status = 'current';
  if not found then
    raise exception 'event_chain_desync';
  end if;

  -- 5. Insert the new, single current claim.
  insert into public.asset_ownership_claims (
    claim_id, asset_id, claim_version, claimant_vault_ref_hash,
    claim_source, transfer_ref, previous_claim_id, status, claim_hash, created_at
  )
  values (
    p_new_claim_id, p_asset_id, p_new_claim_version, p_to_vault_ref_hash,
    p_claim_source, p_transfer_id, p_previous_claim_id, 'current', p_new_claim_hash, p_accepted_at
  )
  returning * into v_new_claim;

  -- 6. Reassign custody authority on the asset (owner now equals the new current claim).
  update public.registered_assets
  set vault_ref_hash = p_to_vault_ref_hash,
      asset_status = p_asset_status,
      updated_at = p_accepted_at
  where asset_id = p_asset_id;

  -- 7. Append the transfer_accepted custody event.
  insert into public.asset_custody_events (
    asset_id, event_type, event_result, actor_type, vault_ref_hash, device_ref_hash,
    related_transfer_id, related_receipt_id, previous_event_hash, event_hash, metadata, created_at
  )
  values (
    p_asset_id, p_event_type, p_event_result, p_event_actor_type, p_to_vault_ref_hash, p_to_device_ref_hash,
    p_transfer_id, p_receipt_id, p_event_previous_hash, p_event_hash,
    coalesce(p_event_metadata, '{}'::jsonb), p_accepted_at
  )
  returning * into v_event;

  -- 8. Mark transfer accepted + persist the receipt (pending guard re-checked).
  update public.asset_transfers
  set status = 'accepted',
      to_vault_ref_hash = p_to_vault_ref_hash,
      to_device_ref_hash = p_to_device_ref_hash,
      acceptance_signature_hash = p_acceptance_signature_hash,
      previous_claim_id = p_previous_claim_id,
      new_claim_id = p_new_claim_id,
      transfer_receipt_id = p_receipt_id,
      transfer_receipt_hash = p_receipt_hash,
      custody_event_hash = p_event_hash,
      provenance_record_hash = coalesce(provenance_record_hash, p_provenance_record_hash),
      accepted_at = p_accepted_at,
      updated_at = p_accepted_at
  where transfer_id = p_transfer_id
    and status = 'pending'
  returning * into v_transfer;
  if not found then
    raise exception 'transfer_not_pending';
  end if;

  return jsonb_build_object(
    'transfer', to_jsonb(v_transfer),
    'claim', to_jsonb(v_new_claim),
    'previous_claim', to_jsonb(v_current),
    'event', to_jsonb(v_event)
  );
end;
$$;

revoke all on function public.asset_transfer_accept_atomic(
  uuid, uuid, char, char, char, char, uuid, uuid, integer, char, text, text, text, text,
  char, char, jsonb, uuid, char, char, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.asset_transfer_accept_atomic(
  uuid, uuid, char, char, char, char, uuid, uuid, integer, char, text, text, text, text,
  char, char, jsonb, uuid, char, char, text, timestamptz
) to service_role;

commit;

select
  tablename
from pg_tables
where schemaname = 'public'
  and tablename in (
    'asset_transfers',
    'asset_ownership_claims'
  )
order by tablename;

select
  n.nspname as schema_name,
  p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'asset_transfer_accept_atomic';

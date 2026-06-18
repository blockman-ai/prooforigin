-- Phase 10E-2: Asset Registry MVP foundation
-- Privacy:
-- - Stores asset metadata, opaque reference hashes, fingerprint hashes, and custody events only.
-- - Does not store plaintext serial numbers, certificate numbers, or private descriptors.
-- - RLS remains locked down; service_role only.

begin;

create table if not exists public.registered_assets (
  asset_id uuid primary key,
  asset_type text not null,
  asset_status text not null default 'registered',
  vault_ref_hash char(64) not null,
  created_by_device_ref char(64) not null,
  asset_fingerprint char(64) not null,
  provenance_record_hash char(64) not null,
  verification_slug text not null,
  visibility text not null default 'verification_public',
  display_name text,
  public_summary text,
  primary_image_url text,
  primary_image_hash char(64),
  vault_document_id uuid,
  primary_evidence_hash char(64),
  metadata_hash char(64),
  physical_descriptor_hash char(64),
  serial_or_cert_hash char(64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  retired_at timestamptz,

  constraint registered_assets_type_allowed
    check (asset_type in (
      'document', 'photo', 'video', 'audio', 'artwork', 'collectible',
      'psa_card', 'memorabilia', 'watch', 'certificate', 'other'
    )),
  constraint registered_assets_status_allowed
    check (asset_status in (
      'registered', 'verified', 'disclosed', 'custody_transfer',
      'ownership_claim_update', 'retired'
    )),
  constraint registered_assets_vault_ref_hash_len
    check (char_length(vault_ref_hash) = 64),
  constraint registered_assets_device_ref_hash_len
    check (char_length(created_by_device_ref) = 64),
  constraint registered_assets_fingerprint_len
    check (char_length(asset_fingerprint) = 64),
  constraint registered_assets_provenance_hash_len
    check (char_length(provenance_record_hash) = 64),
  constraint registered_assets_visibility_allowed
    check (visibility in ('private', 'verification_public', 'disclosure_only')),
  constraint registered_assets_primary_image_hash_len
    check (primary_image_hash is null or char_length(primary_image_hash) = 64),
  constraint registered_assets_primary_evidence_hash_len
    check (primary_evidence_hash is null or char_length(primary_evidence_hash) = 64),
  constraint registered_assets_metadata_hash_len
    check (metadata_hash is null or char_length(metadata_hash) = 64),
  constraint registered_assets_physical_descriptor_hash_len
    check (physical_descriptor_hash is null or char_length(physical_descriptor_hash) = 64),
  constraint registered_assets_serial_or_cert_hash_len
    check (serial_or_cert_hash is null or char_length(serial_or_cert_hash) = 64),
  constraint registered_assets_retired_consistent
    check (asset_status <> 'retired' or retired_at is not null)
);

create unique index if not exists registered_assets_verification_slug_idx
  on public.registered_assets (verification_slug);

create index if not exists registered_assets_vault_created_idx
  on public.registered_assets (vault_ref_hash, created_at desc);

create table if not exists public.asset_provenance_records (
  provenance_record_id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.registered_assets(asset_id) on delete cascade,
  provenance_version integer not null default 1,
  vault_ref_hash char(64) not null,
  created_by_device_ref char(64) not null,
  asset_type text not null,
  evidence_bundle_hash char(64),
  owner_claim_hash char(64),
  public_claims jsonb not null default '{}'::jsonb,
  provenance_record_hash char(64) not null,
  created_at timestamptz not null default now(),

  constraint asset_provenance_records_vault_ref_hash_len
    check (char_length(vault_ref_hash) = 64),
  constraint asset_provenance_records_device_ref_hash_len
    check (char_length(created_by_device_ref) = 64),
  constraint asset_provenance_records_evidence_hash_len
    check (evidence_bundle_hash is null or char_length(evidence_bundle_hash) = 64),
  constraint asset_provenance_records_owner_claim_hash_len
    check (owner_claim_hash is null or char_length(owner_claim_hash) = 64),
  constraint asset_provenance_records_hash_len
    check (char_length(provenance_record_hash) = 64),
  constraint asset_provenance_records_public_claims_object
    check (jsonb_typeof(public_claims) = 'object')
);

create unique index if not exists asset_provenance_records_asset_version_idx
  on public.asset_provenance_records (asset_id, provenance_version);

create table if not exists public.asset_custody_events (
  event_id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.registered_assets(asset_id) on delete cascade,
  event_type text not null,
  event_result text not null default 'success',
  actor_type text not null,
  vault_ref_hash char(64) not null,
  device_ref_hash char(64),
  related_vault_document_id uuid,
  related_disclosure_grant_id uuid,
  related_receipt_id uuid,
  previous_event_hash char(64) not null,
  event_hash char(64) not null,
  metadata_hash char(64),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint asset_custody_events_type_allowed
    check (event_type in (
      'registered', 'verified', 'disclosed', 'custody_transfer',
      'ownership_claim_update', 'retired'
    )),
  constraint asset_custody_events_result_allowed
    check (event_result in ('success', 'denied')),
  constraint asset_custody_events_actor_allowed
    check (actor_type in ('owner', 'system', 'recipient')),
  constraint asset_custody_events_vault_ref_hash_len
    check (char_length(vault_ref_hash) = 64),
  constraint asset_custody_events_device_ref_hash_len
    check (device_ref_hash is null or char_length(device_ref_hash) = 64),
  constraint asset_custody_events_prev_hash_len
    check (char_length(previous_event_hash) = 64),
  constraint asset_custody_events_hash_len
    check (char_length(event_hash) = 64),
  constraint asset_custody_events_metadata_hash_len
    check (metadata_hash is null or char_length(metadata_hash) = 64),
  constraint asset_custody_events_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index if not exists asset_custody_events_asset_created_idx
  on public.asset_custody_events (asset_id, created_at asc);

alter table public.registered_assets enable row level security;
alter table public.asset_provenance_records enable row level security;
alter table public.asset_custody_events enable row level security;

commit;

select
  tablename
from pg_tables
where schemaname = 'public'
  and tablename in (
    'registered_assets',
    'asset_provenance_records',
    'asset_custody_events'
  )
order by tablename;

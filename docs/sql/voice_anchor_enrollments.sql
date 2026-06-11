-- ProofOrigin Voice Identity Anchor V1
-- Run in Supabase SQL Editor when ready to persist fingerprint metadata.
--
-- Privacy:
-- - Raw audio is never stored.
-- - enrollment_token_hash stores SHA-256 of the delete token (plain token stays in browser only).
-- - fingerprint_hash is not publicly readable (RLS + service_role only).
-- - No auth.users link in V1.

begin;

create table if not exists public.voice_anchor_enrollments (
  id uuid primary key default gen_random_uuid(),
  enrollment_token_hash text not null,
  fingerprint_hash text not null,
  mime_type text,
  byte_size integer,
  duration_ms integer,
  contact_email text,
  enrolled_at timestamptz not null default now(),
  deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,

  constraint voice_anchor_enrollments_fingerprint_len
    check (char_length(fingerprint_hash) = 64),
  constraint voice_anchor_enrollments_token_hash_len
    check (char_length(enrollment_token_hash) = 64)
);

create index if not exists voice_anchor_enrollments_active_idx
  on public.voice_anchor_enrollments (enrolled_at desc)
  where deleted_at is null;

create index if not exists voice_anchor_enrollments_token_hash_idx
  on public.voice_anchor_enrollments (enrollment_token_hash)
  where deleted_at is null;

alter table public.voice_anchor_enrollments enable row level security;

revoke all on table public.voice_anchor_enrollments from anon, authenticated, public;
grant select, insert, update, delete on table public.voice_anchor_enrollments to service_role;

commit;

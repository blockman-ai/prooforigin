-- ProofOrigin Sentinel S1 — snapshot history
-- Run in Supabase SQL Editor after core vault/trust pass tables exist.

begin;

create table if not exists public.sentinel_snapshot_history (
  id uuid primary key default gen_random_uuid(),
  captured_at timestamptz not null default now(),
  version text not null,
  label text,
  snapshot jsonb not null,
  source text not null default 'ops',

  constraint sentinel_snapshot_history_version_len check (char_length(version) >= 1),
  constraint sentinel_snapshot_history_source_allowed check (
    source in ('ops', 'cron', 'manual')
  )
);

create index if not exists sentinel_snapshot_history_captured_at_idx
  on public.sentinel_snapshot_history (captured_at desc);

create index if not exists sentinel_snapshot_history_label_idx
  on public.sentinel_snapshot_history (label, captured_at desc)
  where label is not null;

alter table public.sentinel_snapshot_history enable row level security;

revoke all on table public.sentinel_snapshot_history from anon, authenticated, public;
grant select, insert, update, delete on table public.sentinel_snapshot_history to service_role;

commit;

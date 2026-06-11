-- ProofOrigin private dataset candidate training jobs
-- Run in Supabase SQL Editor (service role / postgres)

begin;

create table if not exists public.dataset_training_jobs (
  id uuid primary key default gen_random_uuid(),
  requested_by text not null,
  status text not null default 'requested',
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  result_report_path text,
  candidate_model_path text,
  error text,

  constraint dataset_training_jobs_status_allowed check (
    status in (
      'requested',
      'blocked_gate_closed',
      'running',
      'failed',
      'passed_candidate',
      'rejected_candidate',
      'promotion_ready'
    )
  )
);

create index if not exists dataset_training_jobs_status_requested_idx
  on public.dataset_training_jobs (status, requested_at desc);

alter table public.dataset_training_jobs enable row level security;

revoke all on table public.dataset_training_jobs from anon, authenticated, public;
grant select, insert, update, delete on table public.dataset_training_jobs to service_role;

commit;

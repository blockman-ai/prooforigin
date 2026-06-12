-- ProofOrigin Sentinel S1-C2 — durable aggregate counters
-- Run in Supabase SQL Editor after core vault/trust pass tables exist.
--
-- Counters store aggregate counts only (no raw questions, IPs, or secrets).

begin;

create table if not exists public.sentinel_counters (
  counter_key text primary key,
  count bigint not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),

  constraint sentinel_counters_key_len check (char_length(counter_key) between 3 and 120),
  constraint sentinel_counters_count_nonnegative check (count >= 0)
);

create index if not exists sentinel_counters_last_seen_at_idx
  on public.sentinel_counters (last_seen_at desc);

alter table public.sentinel_counters enable row level security;

revoke all on table public.sentinel_counters from anon, authenticated, public;
grant select, insert, update, delete on table public.sentinel_counters to service_role;

-- Atomic increment/upsert for concurrent writers (service_role only)
create or replace function public.sentinel_increment_counter(
  p_counter_key text,
  p_amount bigint default 1
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_counter_key is null or char_length(trim(p_counter_key)) = 0 then
    raise exception 'counter_key_required';
  end if;

  if p_amount is null or p_amount < 1 then
    raise exception 'invalid_counter_amount';
  end if;

  insert into public.sentinel_counters (counter_key, count, first_seen_at, last_seen_at)
  values (p_counter_key, p_amount, now(), now())
  on conflict (counter_key) do update
  set
    count = public.sentinel_counters.count + excluded.count,
    last_seen_at = now();
end;
$$;

revoke all on function public.sentinel_increment_counter(text, bigint) from public;
grant execute on function public.sentinel_increment_counter(text, bigint) to service_role;

commit;

-- Phase 10D-1: allow server-issued ownership registration challenges.
alter table public.vault_ownership_verifications
  drop constraint if exists vault_ownership_verifications_challenge_type_allowed;

alter table public.vault_ownership_verifications
  add constraint vault_ownership_verifications_challenge_type_allowed
  check (challenge_type in ('migration_authority_verify', 'ownership_key_register'));

select
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.vault_ownership_verifications'::regclass
  and conname = 'vault_ownership_verifications_challenge_type_allowed';

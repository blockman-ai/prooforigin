# Phase 10B Durability & Custody Chain Hardening Rollout

## Order

1. Apply `docs/sql/disclosure_phase10_controlled_protocol_repair.sql`.
2. Apply `docs/sql/phase10b_durability_custody_hardening_repair.sql`.
3. Confirm validation queries return:
   - `disclosure_policies`
   - `disclosure_receipts`
   - `disclosure_confirmation_nonces`
   - `prooforigin_rate_limit_buckets`
   - `prooforigin_lockouts`
   - `vault_document_state_events_document_prev_hash_uidx`
   - all Phase 10B RPCs with `security_definer = true`
4. Deploy application code.
5. Run post-deploy smoke checks.

## Preflight Gates

- The duplicate parent-hash diagnostic in `phase10b_durability_custody_hardening_repair.sql` must return no rows before relying on the custody-chain unique index.
- `service_role` must have execute privileges for every Phase 10 and Phase 10B RPC.
- `public`, `anon`, and `authenticated` must not have table or function access to new durability tables.

## Smoke Tests

- Owner disclosure confirmation survives process restart and is single-use.
- Disclosure accept/verify/access lockout survives process restart.
- `scoped_verify` access writes an `access.receipted` event and a disclosure receipt atomically.
- Voice anchor enrollment returns 503 when Supabase is unconfigured, never `success: true`.
- Trust pass create/revoke/public lookup return 503 when Supabase is unconfigured, never `success: true, stored: false`.
- Mark compromised and delete append custody-chain events through RPC; `chain-verify` stays green.

## Rollback Criteria

- If Phase 10B migration fails before app deploy, do not deploy code.
- If app deploy happens and durable stores are missing, production requests fail closed by design; roll back app or apply the missing migration.
- Do not drop the document-chain fork index after app rollout unless duplicate rows are first isolated and mutation routes are disabled.

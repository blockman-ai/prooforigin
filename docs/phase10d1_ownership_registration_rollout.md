# Phase 10D-1 — Ownership Registration Hardening Rollout

## Order

1. Apply `docs/sql/ownership_registration_hardening_repair.sql` in Supabase (Production).
2. Confirm the `vault_ownership_verifications_challenge_type_allowed` check constraint includes `ownership_key_register`.
3. Deploy application code with the hardened registration ceremony.
4. Run post-deploy smoke checks below.

## Preflight Gates

- `service_role` must retain execute privileges on vault ownership RPCs used by registration and verify flows.
- Registration challenges must store **nonce hash only** — plaintext nonce is returned once in the challenge response and never persisted.

## Smoke Tests

### Challenge issuance

- Authenticated device calls `POST /api/vault/ownership/register/challenge` with `{ "vault_id": "<uuid>" }`.
- Expect `200`, `success: true`, `challenge_id`, and `challenge.challenge_nonce` (non-empty, single-use).
- Confirm DB row in `vault_ownership_verifications` has matching `challenge_id`, `challenge_type = ownership_key_register`, hashed nonce, future `expires_at`, and `status = pending`.

### Valid registration

- Complete unlock on a fresh vault with no registered ownership key.
- Client flow: challenge → sign with local ownership private key → `POST /api/vault/ownership/register`.
- Expect `200`, `ownership_key_registered: true`, `device_bound: true`.
- Challenge row transitions to `verified` with `consumed_at` set.

### Invalid signature

- Replay the register request with a tampered `signature` or wrong `ownership_public_key_jwk`.
- Expect `401` with `OWNERSHIP_SIGNATURE_INVALID`.

### Wrong key

- Sign the challenge with a different local key than the submitted public JWK.
- Expect `401` with `OWNERSHIP_SIGNATURE_INVALID`.

### Replay / nonce reuse

- Submit the same consumed registration payload again.
- Expect `409` with `CHALLENGE_ALREADY_USED`.

### Expired challenge

- Wait until after `expires_at` (or use a test vault with a short TTL) and attempt registration.
- Expect `410` with `CHALLENGE_EXPIRED`.

### Legacy payload rejection

- Send register body with client-built `ownership_proof.challenge` only (no server `challenge_id` / `challenge_nonce`).
- Expect `400` requiring server challenge fields.

### Already registered vault

- Call `POST /api/vault/ownership/register/challenge` for a vault that already has an ownership key.
- Expect `409` with `OWNERSHIP_KEY_ALREADY_REGISTERED`.

### Migration verify unchanged

- Run existing migration authority flow: `POST /api/vault/ownership/challenge` → sign → `POST /api/vault/ownership/verify`.
- Expect verify still succeeds for registered ownership keys.

## Rollback Criteria

- If SQL repair is not applied before deploy, challenge issuance fails at insert time — do not leave app deployed without the migration.
- If registration succeeds without signature verification in production, roll back immediately (regression of audit finding #1).

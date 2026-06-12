# ProofOrigin Vault — Protected View Lifecycle (Audit Spec)

This document standardizes custody events for the device-bound Private Vault.

## Canonical lifecycle events

| Event | Status | When recorded |
|-------|--------|---------------|
| `view_started` | **Canonical** | After Protected View renders decrypted content |
| `view_ended` | **Canonical** | On Protected View teardown (best-effort keepalive) |

These are the events new clients must emit and auditors should rely on.

## Legacy compatibility

| Event | Status | Notes |
|-------|--------|-------|
| `viewed` | **Legacy** | Kept for backward compatibility with older clients and SQL constraints |

- Existing `viewed` rows remain valid in the hash chain.
- **New clients must not emit `viewed`.**
- Protected View V0.2+ records `view_started` / `view_ended` only.

## Dedup rules

Unique partial indexes (see `docs/sql/vault_document_state_events_view_lifecycle.sql`) enforce one row per `(document_id, view_session_id)` for:

- `view_started`
- `view_ended`
- `viewed` (legacy)

## Duration audit

`view_ended` stores:

- `server_duration_ms` — computed server-side from `view_started.created_at`
- `client_duration_ms` — client hint for comparison
- `duration_mismatch` — flagged when client/server diverge beyond threshold

## Related custody events

Document-level events (same hash chain, separate from view session):

- `created`
- `compromised`
- `deleted`

Genesis (`vault_genesis_hash`) is client-local and displayed in the Vault Timeline UI but is **not** part of the document state chain table.

# ProofOrigin Sentinel — Durable Counters (S1-C2)

Sentinel counters are **aggregate-only** metrics stored in Supabase. They let ops track trends over time without storing raw user content.

## Privacy guarantees

Counters must never store:

- Raw guide questions or answers
- IP addresses or device identifiers
- PINs, MVKs, recovery phrases, or recovery kit data
- Document content, ciphertext, or Trust Pass secret seeds
- API keys, service role keys, or other secrets

Counter keys are **fixed event names** chosen at development time (for example `guide.request.blocked`), not derived from user input.

Allowed key prefixes (S1-C2):

| Prefix | Example keys |
|--------|----------------|
| `vault.auth.` | `vault.auth.nonce_replay`, `vault.auth.signature_invalid` |
| `guide.` | `guide.request.success`, `guide.request.blocked` |
| `trust.verify.` | `trust.verify.success`, `trust.verify.rate_limited` |

Keys containing forbidden fragments (`pin`, `secret`, `ip`, `question`, `raw`, etc.) are rejected by the server helper.

## SQL required before use

Run in Supabase SQL Editor **after** core vault/trust tables exist:

```
docs/sql/sentinel_counters.sql
```

This creates:

- `public.sentinel_counters` — durable key/count rows with `first_seen_at` / `last_seen_at`
- `public.sentinel_increment_counter(key, amount)` — atomic upsert/increment RPC

Security: RLS enabled; `anon`, `authenticated`, and `public` revoked; **service_role only**.

## Server helpers

`app/lib/sentinelCounters.js`:

| Function | Behavior |
|----------|----------|
| `incrementSentinelCounter(key, amount = 1)` | Best-effort write; never throws; returns `{ ok }` |
| `getSentinelCounters(prefix?)` | Read counters, optionally filtered by prefix |
| `validateSentinelCounterKey(key)` | Allowlist + forbidden-fragment validation |

**S1-C2 is foundation only** — counters are not wired into vault/guide/trust routes yet. Future commits will call `incrementSentinelCounter` from route handlers; failures must not break user flows.

## Ops read API

Requires `PROOFORIGIN_OPS_SECRET` and vault admin Supabase config:

```http
POST /api/health/prooforigin/ops
Authorization: Bearer <PROOFORIGIN_OPS_SECRET>
Content-Type: application/json

{ "action": "sentinel_counters" }
```

Optional prefix filter:

```json
{ "action": "sentinel_counters", "prefix": "guide." }
```

Response:

```json
{
  "success": true,
  "action": "sentinel_counters",
  "prefix": "guide.",
  "counters": [
    {
      "counter_key": "guide.request.success",
      "count": 42,
      "first_seen_at": "2026-06-12T00:00:00.000Z",
      "last_seen_at": "2026-06-12T18:00:00.000Z"
    }
  ]
}
```

No reset function in S1-C2. Counter resets require a deliberate future migration or ops procedure.

## Related

- `docs/sql/sentinel_s1.sql` — snapshot history (S1)
- `docs/PRODUCTION_READINESS.md` — deployment and ops overview

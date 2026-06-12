# ProofOrigin Sentinel — Durable Counters (S1-C2)

Sentinel counters are **aggregate-only** metrics stored in Supabase. They let ops track trends over time without storing raw user content.

## Privacy guarantees

Counters must never store:

- Raw guide questions or answers
- IP addresses or device identifiers
- PINs, MVKs, recovery phrases, or recovery kit data
- Document content, ciphertext, or Trust Pass secret seeds
- API keys, service role keys, or other secrets

Counter keys are **fixed event names** chosen at development time (for example `guide.request.total`), not derived from user input.

## Guide counters (S1-C3)

Wired in `/api/guide` via `app/lib/guideSentinelCounters.js`. Best-effort only — counter write failures never break guide responses.

| Counter key | When incremented |
|-------------|------------------|
| `guide.request.total` | Valid guide request answered or abuse-refused |
| `guide.mode.openai` | OpenAI answer returned |
| `guide.mode.deterministic` | Deterministic answer returned |
| `guide.refusal.prompt_injection` | Abuse guard blocked injection pattern |
| `guide.refusal.secret_request` | Abuse guard blocked secret/file request |
| `guide.refusal.empty_question` | Empty/whitespace question rejected |
| `guide.rate_limited` | Guide rate limit exceeded |
| `guide.output_filter.rejected` | OpenAI output failed safety filter |

Topic-level counters (for example `guide.topic.passkey`) are planned for a later commit.

## Trust verify counters (S1-C4)

Wired in `/api/identity-card/verify-code` via `app/lib/trustVerifySentinelCounters.js`. Best-effort only — counter write failures never break verification responses.

| Counter key | When incremented |
|-------------|------------------|
| `trust.verify.success` | Rotating code matched |
| `trust.verify.invalid_code` | Card active but code did not match |
| `trust.verify.card_not_found` | No card row for submitted card ID |
| `trust.verify.revoked` | Card revoked or suspicious |
| `trust.verify.expired` | Card expired |
| `trust.verify.rate_limited` | Verify rate limit exceeded |
| `trust.verify.server_error` | Supabase/DTS misconfig, decrypt failure, or unexpected 500 |

No card IDs, submitted codes, IPs, or user content are stored in counter keys or values.

## Vault auth counters (S1-C5)

Wired in `authorizeVaultRequest` (`app/lib/vaultAuth.js`) and `/api/vault/register-device` via `app/lib/vaultAuthSentinelCounters.js`. Best-effort only — counter write failures never break vault auth or registration responses.

| Counter key | When incremented |
|-------------|------------------|
| `vault.auth.missing_headers` | Required vault auth headers absent |
| `vault.auth.device_not_registered` | Device id not found in registrations |
| `vault.auth.signature_failed` | HMAC signature verification failed |
| `vault.auth.replay_rejected` | Nonce already used (replay) |
| `vault.auth.replay_expired_nonce` | Nonce expired in replay guard |
| `vault.auth.rate_limited` | Device registration rate limit exceeded |

No device IDs, nonces, IPs, or request bodies are stored in counter keys or values.

Allowed key prefixes (S1-C2+):

| Prefix | Example keys |
|--------|----------------|
| `vault.auth.` | `vault.auth.replay_rejected`, `vault.auth.signature_failed`, `vault.auth.rate_limited` |
| `guide.` | `guide.request.total`, `guide.mode.openai`, `guide.refusal.prompt_injection` |
| `trust.verify.` | `trust.verify.success`, `trust.verify.invalid_code`, `trust.verify.rate_limited` |

Keys containing forbidden fragments (`pin`, `secret`, `ip`, `question`, `raw`, etc.) are rejected unless the key is in the operational allowlist (`SENTINEL_OPERATIONAL_COUNTER_KEYS`).

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

**S1-C5** wires vault auth counters in `authorizeVaultRequest` and `/api/vault/register-device`. Guide, trust verify, and vault auth all emit aggregate Sentinel counters.

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

# ProofOrigin — Production Readiness

Operational guide for deploying and maintaining ProofOrigin Trust Pass, Private Vault, and Voice Anchor in production. This document supports **Production Readiness Phase 1** — survivability hardening without new product features.

## Beta disclaimer

ProofOrigin is in **cautious beta**. It is not a government ID, not a password manager with account recovery, and not a guaranteed document archive. Users must understand:

- **Vault:** Losing device + PIN + recovery kit = **permanent lockout** (by design).
- **Trust Pass:** Live verification reduces screenshot fraud but does not eliminate social engineering.
- **Voice Anchor:** V1 stores a fingerprint hash placeholder, not a robust anti-spoof voiceprint.

---

## Required environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only DB/storage admin (never expose to browser) |
| `PROOFORIGIN_DTS_MASTER_KEY` | Yes in production | Encrypts Trust Pass secret seeds at rest |
| `PROOFORIGIN_OPS_SECRET` | Recommended | Protects vault ops endpoints (nonce cleanup, storage audit) |
| `OPENAI_API_KEY` | Optional | `/api/reason`, dataset classify |
| `HIVE_*` | Optional | Hive moderation proxy |

**Never commit** `.env.local`, service role keys, or DTS master key to git.

### Health check

```http
GET /api/health/prooforigin
```

Returns safe status only: env presence, table reachability, vault bucket privacy flag, orphan counts, expired nonce counts. **Never returns secret values.**

- `200` — ok or degraded (non-fatal blockers)
- `503` — error (missing required config or unreachable core tables)

### Vault ops (protected)

Configure `PROOFORIGIN_OPS_SECRET`, then:

```http
POST /api/health/prooforigin/ops
Authorization: Bearer <PROOFORIGIN_OPS_SECRET>
Content-Type: application/json

{ "action": "cleanup_nonces" }
```

Allowed actions:

| Action | Description |
|--------|-------------|
| `audit_storage` | Bucket privacy + orphan/missing ciphertext report |
| `cleanup_nonces` | Runs `vault_cleanup_expired_request_nonces()` RPC |

Schedule `cleanup_nonces` daily via Supabase cron, Vercel Cron, or external scheduler.

---

## SQL migration order

Run in Supabase SQL Editor **in order**:

### Vault

1. `docs/sql/vault_documents.sql`
2. `docs/sql/vault_document_state_events.sql`
3. `docs/sql/vault_document_state_events_view_lifecycle.sql`
4. `docs/sql/vault_p1_integrity.sql`
5. `docs/sql/vault_encryption_v2.sql` — required before MVK-mode uploads (`encryption_version = 2`)

### Trust Pass

1. `docs/sql/identity_cards.sql`
2. `docs/sql/identity_cards_dts_foundation.sql`

### Voice Anchor

1. `docs/sql/voice_anchor_enrollments.sql`

All vault and identity tables: **RLS enabled, service_role only**. Browser never queries these tables directly.

---

## Storage bucket configuration

### `vault-documents`

| Setting | Value |
|---------|--------|
| Public | **Off** |
| Path pattern | `{vault_device_id}/{doc_id}.enc` |
| Access | Short-lived signed URLs via API only |

Verify after setup:

1. Health check reports `bucket_public: false`
2. Anonymous URL to an object returns 403/404
3. Ops audit shows `orphan_count: 0` under normal operation

### Orphan ciphertext

Orphans occur when upload PUT succeeds but `/complete` fails. Ops audit reports counts; delete orphans manually in Supabase Storage after confirming no active `vault_documents` row references the path.

---

## Deployment checklist

- [ ] All required env vars set in Vercel (Production + Preview as appropriate)
- [ ] `PROOFORIGIN_DTS_MASTER_KEY` set in production (Trust Pass server verify)
- [ ] SQL migrations applied in order
- [ ] `vault-documents` bucket private
- [ ] `GET /api/health/prooforigin` returns `status: "ok"` or acceptable `degraded`
- [ ] `npm run test:vault` passes in CI or locally before deploy
- [ ] `npm run build` passes
- [ ] DNS points to Vercel; HTTPS enforced
- [ ] Schedule nonce cleanup job
- [ ] Document beta limitations for users (vault recovery warning visible)

---

## Emergency rollback

1. **Bad deploy:** Revert to previous Vercel deployment (Instant Rollback in dashboard).
2. **Broken API route:** Roll back git commit; redeploy.
3. **Schema mistake:** Do not drop production tables without backup. Prefer forward-fix migration.
4. **Leaked service_role key:** Rotate immediately in Supabase → Project Settings → API. Update Vercel env. Redeploy. Audit access logs.
5. **Leaked DTS master key:** Rotate `PROOFORIGIN_DTS_MASTER_KEY` only with a migration plan — existing encrypted seeds become undecryptable without re-encryption strategy.

---

## Key rotation notes

| Secret | Rotation impact |
|--------|-------------------|
| `SUPABASE_SERVICE_ROLE_KEY` | Update Vercel env; redeploy; no user impact if done promptly |
| `PROOFORIGIN_DTS_MASTER_KEY` | Breaks server-side Trust Pass verify for existing cards unless dual-key decrypt period |
| Device HMAC secrets | Per-device in browser; user re-registers device if compromised |
| Vault MVK / PIN | User-held only; ProofOrigin cannot rotate on user's behalf |

**Policy:** ProofOrigin staff must never request user PINs, recovery phrases, or Trust Pass secret seeds.

---

## DNS checklist

- [ ] Apex + `www` (if used) point to Vercel
- [ ] TLS certificate active (Vercel-managed)
- [ ] Consider DNSSEC at registrar (Namecheap or other)
- [ ] Monitor for look-alike domains (phishing clones)
- [ ] Publish official verify URL pattern: `https://<your-domain>/id/{cardId}`

---

## Security headers (Phase 1)

| Scope | Headers |
|-------|---------|
| Global (`/:path*`) | `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: SAMEORIGIN`, `COOP`, `Permissions-Policy` |
| Vault page/API | Strict CSP, `no-referrer`, `DENY` framing, no-store |
| Trust Pass + Voice | Global + `no-referrer`, `DENY` framing, no-store |
| Health + ops API | Minimal API headers, no-store |

Review vault CSP when adding scripts or workers.

---

## Known limitations (Phase 1)

- No recovery kit export UI (warning shown in vault)
- No passkey unlock (stub only)
- Single active document slot per device
- In-memory rate limits — weak under multi-instance Vercel until Redis/DB limits
- Voice Anchor not wired to Trust Pass create flow
- No Sign in with ProofOrigin / public developer API
- Bitcoin anchor and TrustDNA are UI placeholders
- Screenshot / screen recording cannot be prevented in Protected View
- `vault_id` (genesis) not server-bound to devices (Phase 2)

---

## Production blockers to track

1. service_role blast radius — mitigate with rotation runbook + least-privilege review
2. XSS → localStorage theft — CSP + minimal third-party scripts
3. Recovery kit missing — Phase 1 warning only; full kit in Vault Recovery Commit 6
4. Nonce table growth — schedule cleanup
5. Orphan blobs — schedule audit
6. Multi-instance rate limits — Phase 2 hardening
7. Trust Pass phishing — user education + future signed RP assertions

---

## Related docs

- `docs/VAULT_RECOVERY.md` — MVK key ring, passkey, recovery kit roadmap
- `docs/VAULT_STORAGE_SETUP.md` — bucket and schema setup
- `docs/VAULT_LIFECYCLE.md` — Protected View audit events
- `docs/sql/vault_encryption_v2.sql` — MVK upload constraint

---

## Monitoring suggestions

- Uptime probe: `GET /api/health/prooforigin` every 5 minutes
- Alert on `status: "error"` or `vault_bucket_public: true`
- Alert on `orphan_count` increasing over baseline
- Alert on `expired_nonce_count` > 100k (cleanup job failure)
- Vercel deployment notifications on failed builds

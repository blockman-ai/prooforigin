---
id: ops/health-blockers
version: 1
title: Health status triage
audience: ops
product: sentinel
status: active
sentinel_rules:
  - health.not_ok
source_of_truth: docs/knowledge/ops/health-blockers.md
last_reviewed: 2026-06-14
---

# Health status triage

Use when Sentinel reports `health.not_ok` or `/api/health/prooforigin` returns non-OK status.

## Blocker triage

1. `GET /api/health/prooforigin` and capture `status`, `blockers`, and table reachability flags.
2. If `status` is `error` (HTTP 503), treat as production-blocking until required env and core tables recover.
3. Map each blocker code to the checklist below before restarting services.

### Common blockers

| Blocker | Investigation |
|---------|----------------|
| `missing_required_env` | Verify Vercel env vars; no placeholder `YOUR_` values |
| `dts_master_key_missing` | Set `PROOFORIGIN_DTS_MASTER_KEY` in production |
| `supabase_not_configured` | Supabase URL or service role missing/invalid |
| `vault_tables_unreachable` | Run vault SQL migrations; check Supabase status |
| `trust_pass_tables_unreachable` | Run identity card SQL migrations |
| `voice_anchor_table_unreachable` | Run voice anchor SQL migration |
| `vault_bucket_public` | See `ops/storage-audit#bucket-privacy` |
| `vault_orphan_ciphertext` | See `ops/storage-audit#orphan-reconciliation` |
| `vault_missing_ciphertext` | See `ops/storage-audit#missing-ciphertext` |

## After remediation

1. Re-run health check until `status` is `ok` or known acceptable `degraded`.
2. Run `sentinel_recommendations` to confirm related storage/auth signals cleared.
3. Pin a fresh Sentinel baseline if the incident changed storage or auth counters materially.

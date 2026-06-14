---
id: ops/nonce-housekeeping
version: 1
title: Replay nonce housekeeping
audience: ops
product: sentinel
status: active
sentinel_rules:
  - replay.expired_nonce_housekeeping
source_of_truth: docs/knowledge/ops/nonce-housekeeping.md
last_reviewed: 2026-06-14
---

# Replay nonce housekeeping

Use when expired vault replay-guard nonce rows accumulate.

## Cleanup procedure

1. Confirm `PROOFORIGIN_OPS_SECRET` and Supabase service role are configured.
2. `POST /api/health/prooforigin/ops` with `{ "action": "cleanup_nonces" }`.
3. Review deleted row count in the ops response.
4. Re-check health snapshot `expired_nonce_count` or Sentinel `replay.expired_nonce_housekeeping`.

## Scheduling

1. Schedule daily `cleanup_nonces` via Supabase cron, Vercel Cron, or external scheduler.
2. Alert when `expired_nonce_count` exceeds 1,000 (Sentinel low) or 10,000 (Sentinel medium).

## When not to panic

Expired nonce retention alone does not indicate active replay attacks. Pair with `vault.auth.replay_rejected` counter spikes before investigating client regressions.

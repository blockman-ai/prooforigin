---
id: ops/production-readiness
version: 1
title: Deploy and environment checklist
audience: ops
product: sentinel
status: active
sentinel_rules: []
source_of_truth: docs/knowledge/ops/production-readiness.md
last_reviewed: 2026-06-14
---

# Deploy and environment checklist

Ops runbook for ProofOrigin production deployment and environment verification.

## Required environment

1. Confirm `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in Vercel (never exposed to the browser).
2. Confirm `PROOFORIGIN_DTS_MASTER_KEY` is set in production for Trust Pass seed encryption.
3. Set `PROOFORIGIN_OPS_SECRET` before using protected ops routes.
4. Optional: `OPENAI_API_KEY` for Guide OpenAI mode and `/api/reason`.

## Health verification

1. `GET /api/health/prooforigin` should return `status: "ok"` or acceptable `degraded`.
2. Review `blockers` — any non-empty list requires triage before traffic increases.
3. Confirm vault bucket is private (`bucket_public: false`).

## SQL migration order

Run Supabase migrations in the order documented in `docs/PRODUCTION_READINESS.md` before enabling vault uploads, Trust Pass persistence, Voice Anchor, or Sentinel counters.

## Beta boundaries

ProofOrigin is cautious beta. Ops should not promise account recovery, government ID equivalence, or absolute truth verification to users.

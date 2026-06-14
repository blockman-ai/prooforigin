---
id: ops/sentinel-runbook
version: 1
title: Sentinel counter and Guide abuse runbook
audience: ops
product: sentinel
status: active
sentinel_rules:
  - guide.prompt_injection
  - guide.secret_request
  - guide.output_filter_rejected
  - trust.invalid_code_ratio
source_of_truth: docs/knowledge/ops/sentinel-runbook.md
last_reviewed: 2026-06-14
---

# Sentinel counter and Guide abuse runbook

Ops runbook for Guide refusal counters and Trust Pass verification ratio anomalies.

## Guide prompt injection

1. Read `guide.refusal.prompt_injection` via `sentinel_counters` prefix `guide.`.
2. Low isolated counts are expected — Guide abuse guard is working.
3. Investigate only if volume spikes sharply or correlates with a deploy/regression.
4. No user questions or answers are stored in counters.

## Guide secret requests

1. Read `guide.refusal.secret_request` counter volume.
2. Users may ask Guide for PIN, recovery phrase, or kit contents — refusals are correct behavior.
3. Confirm Guide help covers Recovery Kit and vault unlock (`recovery-kit`, `vault-unlock` topics).
4. Optional user-education hint: `guide_topic: recovery-kit` on the recommendation (Phase 2b).

## Guide output filter

1. Read `guide.output_filter.rejected` when OpenAI mode is enabled.
2. Review recent guide knowledge corpus changes if rejections increase after deploy.
3. Deterministic fallback should remain safe when OpenAI output is rejected.
4. Do not log or export raw model output in ops tools.

## Trust verify ratio

1. Compare `trust.verify.invalid_code` vs `trust.verify.success` counters.
2. Sentinel flags when invalid ≥ 5 and invalid > success × 3.
3. Investigate brute-force probing, user confusion, or clock skew on rotating codes.
4. No submitted codes or card IDs are stored in counters.

## Counter hygiene

Counter keys are fixed at development time. Never create keys from user input. Use prefix filters in ops API for triage.

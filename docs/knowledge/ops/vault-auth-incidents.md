---
id: ops/vault-auth-incidents
version: 1
title: Vault auth incident triage
audience: ops
product: sentinel
status: active
sentinel_rules:
  - vault.auth.replay_rejected
  - vault.auth.signature_failed
  - vault.auth.device_not_registered
source_of_truth: docs/knowledge/ops/vault-auth-incidents.md
last_reviewed: 2026-06-14
---

# Vault auth incident triage

Ops runbook for vault device HMAC auth anomalies. Counters are aggregate-only — no device IDs or nonces are stored in Sentinel.

## Replay rejected

1. Check `vault.auth.replay_rejected` counter trend via `sentinel_counters` prefix `vault.auth.`.
2. Investigate duplicate client retries, proxy caching of POST bodies, or double-submitted forms.
3. Confirm clients generate a fresh `x-prooforigin-vault-nonce` per signed request.
4. Spike after deploy → inspect recent vault client or API changes.

## Signature failed

1. Check `vault.auth.signature_failed` counter volume.
2. Verify client clock skew is within the allowed window (5 minutes).
3. Confirm body hash matches the exact request body bytes the server receives.
4. Check for device secret rotation without re-registration.
5. Compare failure rate with deploy/version changes.

## Device not registered

1. Check `vault.auth.device_not_registered` counter volume.
2. Confirm `/api/vault/register-device` succeeds after vault unlock on new profiles.
3. Investigate stale browsers holding old `vault_device_id` after recovery import (device reset is expected).
4. Review revoked device rows if a user restored on a new device.
5. Low volume may be benign probing; sustained medium volume warrants client flow review.

## Escalation notes

Vault auth failures do not expose PINs, MVK, or document plaintext. Do not request user secrets during triage.

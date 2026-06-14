---
id: ops/storage-audit
version: 1
title: Vault storage audit runbook
audience: ops
product: sentinel
status: active
sentinel_rules:
  - storage.bucket_public
  - storage.orphan_objects
  - storage.missing_ciphertext
source_of_truth: docs/knowledge/ops/storage-audit.md
last_reviewed: 2026-06-14
---

# Vault storage audit runbook

Ops runbook for vault ciphertext bucket privacy and integrity drift.

## Bucket privacy

1. `POST /api/health/prooforigin/ops` with `{ "action": "audit_storage" }` and valid ops auth.
2. Confirm `bucket_public` is `false` in the audit response and health snapshot.
3. In Supabase Storage, verify `vault-documents` bucket access is **private**.
4. Re-run health check after the bucket policy change.

## Orphan reconciliation

1. Run `audit_storage` and note `orphan_count` and reported orphan paths.
2. For each orphan path, confirm no active row in `vault_documents` references the object.
3. Orphans often occur when upload PUT succeeds but `/api/vault/document/complete` fails.
4. Delete confirmed orphan objects in Supabase Storage only after verifying no active metadata row.
5. Re-run audit until `orphan_count` returns to baseline.

## Missing ciphertext

1. Run `audit_storage` and note `missing_ciphertext_count`.
2. For each affected document row, inspect `storage_path` and recent upload/complete failures.
3. Treat as **user access risk** — active rows without storage objects may be unrecoverable without user re-upload.
4. Investigate failed `/complete` calls, storage outages, or manual bucket edits.
5. Do not delete active document rows without an explicit product decision.

## Verification

After any storage remediation:

1. `GET /api/health/prooforigin` — storage blockers should clear.
2. `POST .../ops` `{ "action": "sentinel_recommendations" }` — storage recommendations should disappear when counts return to zero.

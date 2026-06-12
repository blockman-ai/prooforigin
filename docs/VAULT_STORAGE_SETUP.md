# ProofOrigin Private Vault — Storage Setup (V0.2)

This guide prepares Supabase for **one encrypted document slot** per browser device. It covers schema and storage only — no upload UI or API routes in this phase.

## Identity model

ProofOrigin uses two related identifiers:

| Identifier | Source | Purpose |
|------------|--------|---------|
| **`vault_id`** | Vault Genesis (`app/lib/vaultGenesis.js`, localStorage) | User-facing vault identity, genesis hash, sealed/active custody state |
| **`vault_device_id`** | Vault Device (`app/lib/vaultDevice.js`, localStorage) | API and storage scope for this browser/device; HMAC request signing |

They are created independently in the browser:

- **Genesis** establishes the vault’s origin proof before documents exist.
- **Device** establishes the server-side scope for ciphertext storage and future signed API calls.

A future ProofOrigin account system may bind **multiple `vault_device_id` records** to one ProofOrigin identity or `vault_id`. V0.2 keeps them local and device-bound.

## What is stored

- **Supabase Postgres:** metadata only — ciphertext SHA-256, byte size, storage path, encryption version, optional encrypted label fields, timestamps.
- **Supabase Storage:** encrypted ciphertext blobs at `{vault_device_id}/{doc_id}.enc`.

Never stored on the server:

- Plaintext documents
- PIN or master keys
- Decrypted labels
- OCR output

This is **private encrypted custody**, not government ID verification or legal attestation.

## 1. Run SQL migration

In the Supabase SQL Editor, run:

```
docs/sql/vault_documents.sql
```

This creates `public.vault_documents` with:

- One active row per `vault_device_id` (partial unique index where `deleted_at is null`)
- RLS enabled; `service_role` only

## 2. Create private storage bucket

In **Supabase Dashboard → Storage → New bucket**:

| Setting | Value |
|---------|--------|
| **Name** | `vault-documents` |
| **Public bucket** | **Off** (private) |

Do **not** enable public access, CDN, or public URLs for this bucket.

### Object path convention

```
{vault_device_id}/{doc_id}.enc
```

Example:

```
a1b2c3d4-e5f6-7890-abcd-ef1234567890/f9e8d7c6-b5a4-3210-fedc-ba0987654321.enc
```

- `vault_device_id` — UUID from `ensureVaultDevice()` in the browser
- `doc_id` — UUID primary key from `vault_documents.id`
- `.enc` suffix — encrypted ciphertext only (AES-256-GCM from client)

### Bucket policy expectations

- No anonymous read/write
- No permanent public links
- Future API routes will issue **short-lived signed URLs** for ciphertext upload/download only
- Decrypted content never passes through the server

## 3. Environment variables (existing)

Vault admin helpers use the same Supabase project credentials as other server routes:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

No new env vars are required for V0.2 schema setup.

## 4. Operational notes

- **No OCR** — do not pipe vault objects through vision or text extraction services.
- **No sharing** — no share links or public verify pages for vault documents.
- **Soft delete** — set `deleted_at` on the row and remove the storage object; do not leave orphaned `.enc` files.
- **Compromised state** — `compromised_at` blocks future API access until the user completes recovery (implemented in a later commit).

## 5. Verification checklist

After setup:

1. Table `public.vault_documents` exists with RLS enabled.
2. Bucket `vault-documents` exists and is **private**.
3. No public bucket policy or anon grants on vault storage.
4. Service role can insert/select/update/delete on `vault_documents` (via API routes in a later commit).

## Related code (not deployed in this commit)

- `app/lib/vaultAdmin.js` — table/bucket constants and admin client stub
- `app/lib/vaultCrypto.js` — client-side encryption (Commit 1)
- `app/lib/vaultDevice.js` — device identity and HMAC signing (Commit 1)

Next: API routes for metadata and short-lived signed ciphertext URLs (Commit 3).

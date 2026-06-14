## Phase 3 - Device Binding + Ownership Key Registration (Persistence Only)

Phase 3 adds a guarded ownership registration path and client ownership key helper without
activating migration execution:

- Client generates vault ownership signing keypair locally (ECDSA P-256 SHA-256).
- Public JWK is sent to server for immutable one-time registration under `vault_id`.
- Private key is never sent to server and is locally wrapped with MVK for future recovery-kit export.
- Server binds the authenticated `vault_device_id` to the provided `vault_id` and writes:
  - `vault_id_bound_at`
  - `vault_ownership_proof_metadata`
- Duplicate ownership key registration for a `vault_id` is rejected (TOFU immutable model).
- Phase 3 is TOFU only. It does not yet prove server-side control of the target
  `vault_id`; a caller that already knows an unclaimed high-entropy `vault_id` could
  preempt first registration. Migration execution must not rely on this binding until
  a future vault-specific ownership proof is implemented.

### Retrofit Path (Existing MVK Vaults)

On unlocked MVK vault sessions:

1. Ensure `vault_device_id` is registered.
2. If no ownership key exists for `vault_id`, generate local keypair.
3. Register public key through authenticated ownership route.
4. Persist wrapped private key locally and mark recovery-kit boundary for next export.

### Phase 3.2 TOFU Authority Boundary

The earlier "device has an MVK document" gate was intentionally removed because it did
not prove ownership of the target `vault_id`; it only proved that the authenticated
device had some MVK document. Phase 3.2 keeps the route authenticated and immutable, but
documents the remaining first-use risk honestly:

- `vault_id` is high-entropy and not enumerable, but if it is disclosed before ownership
  registration, first registration could be preempted.
- The server stores only the submitted public key and safe proof metadata.
- A future phase must add a real vault-specific authority proof before document migration
  execution trusts this binding.
- Private JWK material is rejected server-side if a buggy or malicious client sends it.

### Recovery Kit Boundary (Phase 3 Placeholder)

- Old kits (created before ownership key registration) remain **identity restore only**.
- New kits exported after ownership key registration are the boundary for future
  migration-proof eligibility.
- Phase 3 records this boundary metadata only. It does not change restore behavior and
  does not claim old kits can migrate documents.

### Explicit Non-Goals Preserved

- No document migration execution.
- No migration UI.
- No activation of AAD v3 uploads.
- No decrypt-path behavior changes.

# ProofOrigin Vault — Cross-Device Document Migration

Phase 1.1 is a schema/model hardening spec only. It defines ownership, migration states, AAD v3, and future schema invariants. It does not activate document migration, change upload behavior, change decrypt behavior, or add routes/UI.

## Ownership model

ProofOrigin currently separates two identifiers:

| Identifier | Current role | Migration role |
|------------|--------------|----------------|
| `vault_id` | Local vault genesis identity restored from Recovery Kit | Stable vault ownership scope for documents and device registrations |
| `vault_device_id` | Browser/device API auth scope and current storage path owner | Active device session scope under a `vault_id` |

Model C keeps this separation. `vault_id` owns the vault. `vault_device_id` authenticates a browser/device acting for that vault.

Future schema work should bind:

- `vault_device_registrations.vault_id`
- `vault_documents.vault_id`
- migration records that reference source and target `vault_device_id` values

The server must never receive plaintext documents, PINs, recovery phrases, Recovery Kits, or MVK material.

Privacy note: binding `vault_id` server-side intentionally allows ProofOrigin to correlate device registrations and encrypted document metadata that belong to the same vault. This is required for cross-device migration and must remain metadata-only.

## Phase 1 decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Legacy document backfill | Existing rows get `aad_version = 1`; `vault_id` may remain `null` until the original device binds it | Server cannot infer `vault_id` for existing device-scoped rows without client proof |
| Ownership key retrofit | Existing MVK vaults generate/register an ownership key on a future unlocked-device flow, then export a fresh Recovery Kit | Old kits do not contain the ownership private key |
| Old Recovery Kits | Restore identity only; no self-serve document migration until a fresh kit with ownership key exists | Preserves zero knowledge and avoids server-side kit upload |
| Ownership key immutability | TOFU immutable: first public key binding wins; replacement/rotation is not represented in schema | Prevents ownership-key takeover |
| Stale uploading | `uploading` expires after 30 minutes and may be marked `failed` with `upload_expired` by future cleanup | Prevents permanent non-terminal locks |
| Target doc id | Create a new `target_document_id`; never reuse `source_document_id` | Keeps source and target audit chains/storage objects distinct |

## Vault ownership proof model

A restored device must prove control of `vault_id` without sending recovery secrets to the server.

Future Phase 1 design should add a **vault ownership public key**:

1. During MVK vault setup, the browser creates a non-extractable signing key pair for vault ownership.
2. The public key is stored server-side with `vault_id`.
3. The private key is wrapped into the user-held Recovery Kit alongside the MVK.
4. Recovery import unwraps the private ownership key locally with the recovery phrase.
5. New device registration signs a server nonce containing `vault_id`, `vault_device_id`, timestamp, and action.
6. Server verifies that signature against the stored public key before binding the new `vault_device_id` to `vault_id`.

This preserves zero knowledge:

- No MVK server-side
- No recovery phrase server-side
- No Recovery Kit upload to the server
- No plaintext document material server-side

Device HMAC auth still authenticates requests from a registered device. Vault ownership signatures authorize adding that device under a `vault_id`.

Ownership-key lifecycle:

- Missing ownership key: no `vault_ownership_keys` row exists for the `vault_id`; legacy restore remains identity-only.
- Active ownership key: one immutable `vault_ownership_keys` row exists for the `vault_id`; future registration may prove vault ownership.
- Replacement: not represented by the Phase 1.1 schema. There is no `revoked_at` column and the database uses a unique index on `vault_id`, so rotation cannot be modeled accidentally. A future break-glass recovery chapter would need a separate threat model, user ceremony, and schema.

TOFU policy:

- If no public key exists for a `vault_id`, the first valid ownership-key registration may bind it.
- If a public key already exists for a `vault_id`, all replacement attempts must fail at the application layer and at the database uniqueness layer.
- Public keys are not secrets; private keys are wrapped into future Recovery Kits and never uploaded.

Ownership binding auditability:

- `vault_device_registrations.vault_id` records the stable vault that a device is authorized to act for.
- `vault_device_registrations.vault_id_bound_at` records when the server accepted that binding.
- `vault_device_registrations.vault_ownership_proof_metadata` stores safe audit metadata about the proof ceremony, such as nonce id, algorithm, public-key fingerprint, and proof version. It must never store recovery phrases, private keys, MVK material, PINs, Recovery Kits, or raw signatures if those signatures become replayable.
- `vault_id_bound_at` must remain `null` unless `vault_id` is set.

## AAD v3

Current document AAD is device-scoped:

```text
{vault_device_id}|{doc_id}|{content_type}
```

That means ciphertext cannot be safely re-homed by only changing metadata from one device id to another. The old AAD would no longer match.

AAD v3 is vault-scoped:

```text
prooforigin-vault-document-aad-v3|vault_id={vault_id}|doc_id={doc_id}|content_type={content_type}
```

Phase 0 adds only the pure builder (`buildVaultScopedDocumentAad`). Future migration must decrypt with the legacy/source AAD and re-encrypt with AAD v3 on the restored device.

## AAD discriminator

Use a future `aad_version` field, **not** `encryption_version = 3`.

Reason:

- `encryption_version` currently selects the document root key (`1` = legacy PIN-derived root, `2` = MVK root).
- AAD format is orthogonal. Current v1 and v2 documents both use device-scoped AAD.
- Overloading `encryption_version` would mix root-key selection with AAD selection.

Future schema should add:

```sql
aad_version smallint not null default 1
```

Meaning:

| `aad_version` | AAD builder |
|---------------|-------------|
| `1` | `{vault_device_id}|{doc_id}|{content_type}` |
| `3` | `prooforigin-vault-document-aad-v3|vault_id={vault_id}|doc_id={doc_id}|content_type={content_type}` |

Future migrated documents should remain `encryption_version = 2` and set `aad_version = 3`.

Phase 0 constants define this discriminator but do not activate it in upload or decrypt.

Safety invariant:

- `aad_version = 1` preserves device-scoped legacy behavior and may have `vault_id = null`.
- `aad_version = 3` is vault-scoped and must have `vault_id` set before a row can be stored.
- Runtime DDL must encode this as `check (aad_version <> 3 or vault_id is not null)` to avoid undecryptable vault-scoped rows.

## Migration state machine

Document migration records use exactly these states:

| State | Meaning |
|-------|---------|
| `pending` | Migration intent exists, but no verified target ciphertext is committed |
| `uploading` | Target upload or verification may be in progress; target object may exist but is not authoritative |
| `completed` | Target ciphertext was uploaded, verified, and committed |
| `failed` | Migration attempted and failed; source document remains authoritative |
| `cancelled` | User or system cancelled before completion; source document remains authoritative |

Allowed transitions:

```text
pending -> uploading
uploading -> completed
uploading -> failed
uploading -> cancelled
```

Disallowed:

- `completed -> pending`
- `completed -> failed`
- `completed -> cancelled`
- `failed -> pending`
- `cancelled -> pending`

Completed migrations are final unless a future version introduces an explicit reverse migration record.

Source retirement is represented separately from migration completion:

| Field | Values | Meaning |
|-------|--------|---------|
| `source_retirement_state` | `active`, `source_retired` | Whether the old source document/device has been retired after a completed migration |
| `source_retired_at` | timestamp or null | When source retirement happened |

`completed` means the target ciphertext is authoritative. `source_retired` means the source document/device has also been retired. This prevents a partial failure between target commit and source retirement from being collapsed into one state.

Concurrency invariant:

- At most one non-terminal migration may exist per `(vault_id, source_document_id)`.
- A future database migration should enforce this with a partial unique index for `pending` and `uploading`.
- At most one completed migration may exist per `(vault_id, source_document_id)`.
- A future reverse migration must create a new source/target pair instead of adding a second completed row for the same source.

Migration row consistency:

- `completed` requires `target_document_id` and `completed_at`, and must not have `failure_reason`.
- `failed` requires a non-cancellation `failure_reason` and must not have `completed_at`.
- `cancelled` requires `failure_reason = user_cancelled` and must not have `completed_at`.
- `pending` and `uploading` must not have `failure_reason` or `completed_at`.
- `source_retirement_state = source_retired` requires `state = completed` and `source_retired_at`.
- `source_retirement_state = active` requires `source_retired_at = null`.

Stale upload policy:

- `uploading` rows older than 30 minutes are stale.
- Future cleanup may transition stale rows to `failed` with `failure_reason = upload_expired`.
- Cleanup must not alter source document metadata or revoke source devices.

Target document id policy:

- Future migrations create a new `target_document_id`.
- `target_document_id` must differ from `source_document_id`.
- The migration record stores both ids, preserving separate source and target audit chains.

## Required future commit behavior

Future runtime migration must follow this order:

1. New device proves restored `vault_id` locally by Recovery Kit import.
2. New device registers under that `vault_id`.
3. Server verifies the vault ownership signature before binding the new device.
4. Server checks that the target device slot is empty.
5. Server exposes eligible source document metadata and a short-lived ciphertext download URL for the same `vault_id`.
6. Browser downloads old ciphertext.
7. Browser decrypts using the source document encryption version and source AAD.
8. Browser re-encrypts using MVK root key and AAD v3.
9. Browser uploads target ciphertext.
10. Server verifies hash and byte count.
11. Server commits the target document row and migration record atomically.
12. Only after successful commit may source document be marked migrated/deleted or old device be revoked.

Target slot precondition:

- The target `vault_device_id` must have no active document before migration starts.
- If occupied, fail before download/upload with `slot_occupied`.

## Backward compatibility

Phase 0 does not add `aad_version = 3` to active upload, decrypt, or complete-route validation.

Existing behavior remains:

- v1 documents use the legacy PIN-derived root key.
- v2 documents use MVK root key.
- v1/v2 AAD remains `{vault_device_id}|{doc_id}|{content_type}`.
- Existing documents implicitly have `aad_version = 1`.
- Existing documents may have `vault_id = null` until a future original-device binding flow proves ownership.
- Recovery import restores vault identity only; documents remain on the source device until migration ships.

Backfill rules:

- Add `aad_version default 1 not null` for document rows.
- Add nullable `vault_id` for existing rows.
- Do not backfill `vault_id` from server guesses.
- New Phase 1 schema may permit `vault_id null` only for legacy rows; future vault-scoped rows must set it.
- Add `vault_id_bound_at` and `vault_ownership_proof_metadata` to device registrations for future binding auditability.
- Do not add or preserve a `vault_ownership_key_state` cache on device registrations; ownership-key state is derived from `vault_ownership_keys`.

## Rollback strategy

Until `completed`, rollback is simple:

- Do not alter source document metadata.
- Do not revoke source device.
- If state is `uploading`, delete any target object whose hash was not committed.
- Mark migration `failed` or `cancelled` with a safe reason code.

If commit fails after target upload, the target object is orphan cleanup work, not a custody transfer. The source document remains authoritative.

## Phase 0 non-goals

- No migration route.
- No migration UI.
- No upload/decrypt integration.
- No Sentinel runtime behavior change.
- No Guide wording change.
- No dataset-capture changes.

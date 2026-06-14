# ProofOrigin Vault — Recovery & Key Ring (Phase 1+)

This document defines the zero-knowledge recovery model for the Private Vault. It is the source of truth for future passkey, PIN, and recovery-kit work.

## Policy (non-negotiable)

ProofOrigin **cannot decrypt** user vault documents. The server stores ciphertext and metadata only.

| Allowed | Not allowed |
|---------|-------------|
| Client-side passkey unlock | Email or SMS “reset my vault” |
| Client-side PIN fallback | ProofOrigin staff unlock |
| User-held recovery kit export | Server-held master vault key (MVK) |
| Encrypted recovery blob the user controls | Automatic cloud backup of MVK or recovery phrase |
| Explicit “no kit = unrecoverable” consent | Social recovery or admin override |

**If the user loses their device and did not save a recovery kit, the vault is unrecoverable by design.** This is intentional, not a support gap.

## Key Ring architecture

The vault moves from **PIN-derived document keys** to a **Master Vault Key (MVK)** model:

```
Recovery phrase (Phase 2+) ──wraps──► MVK ──HKDF──► Document encryption key
Passkey (Phase 2+)       ──wraps──► MVK
PIN (fallback)           ──wraps──► MVK
```

- **MVK:** Random 256-bit secret generated at vault setup. Never sent to ProofOrigin servers.
- **Document key:** Derived from MVK via HKDF (see `app/lib/vaultCrypto.js`). AAD still binds ciphertext to device scope until Phase 2 custody transfer.
- **PIN wrap:** PBKDF2 + AES-256-GCM protects MVK locally (`app/lib/vaultKeyRing.js`).
- **Passkey wrap:** WebAuthn PRF wraps MVK locally (`vaultPasskey.js`, `vaultPasskeyEnroll.js`, `vaultUnlock.js`); enrollment orchestration in P1-C2; unlock wiring in P1-C3; enroll UI in P1-C4.
- **Recovery kit:** User-held phrase encrypts MVK export; export UI and restore wizard shipped in Phase 1–2.

## Unlock priority (target behavior)

1. **Passkey** — primary when enrolled (local WebAuthn, no server key material).
2. **PIN** — fallback when passkey unavailable or user chooses PIN.
3. **Recovery kit** — disaster recovery on a new device; requires phrase and imported kit file via `/vault/restore`.

Session behavior (vanish mode, Protected View) is unchanged by the Key Ring.

## User scenarios

### Daily unlock (same device)

Passkey or PIN unwraps MVK in browser memory only. MVK is cleared on vanish / lock.

### Forgotten PIN

- Passkey enrolled → unlock with passkey, set new PIN, re-wrap MVK.
- Recovery kit saved → phrase unwraps MVK, set new PIN.
- Neither → **unrecoverable**.

### Lost phone

Requires recovery kit and phrase via the restore wizard. Identity restore is available; cross-device **document** migration is a future phase.

### Stolen phone

User marks vault **compromised** (existing flow). Attacker needs PIN/passkey to decrypt. Recovery on new device uses recovery kit + device re-registration via restore wizard.

## Phase roadmap

| Phase | Scope |
|-------|--------|
| **1 — Commit 1** | `vaultKeyRing.js` + spec; tests only; no production change |
| **1 — Commit 2** | MVK storage on **new** vault setup; `isVaultUsingMasterVaultKey()`; legacy unlock/crypto unchanged |
| **1 — Commit 3** | Unlock branching + MVK-mode crypto; `encryption_version` 2 for MVK uploads; legacy vaults unchanged |
| **1 — Commit 4** | Recovery kit generate/export + acknowledgment gate (export only) |
| **1 — Commit 5** | Legacy vault migration to MVK on unlock (optional future commit) |
| **1 — Import Phase 1** | `vaultRecoveryImport.js` orchestration (kit + phrase + PIN apply) |
| **1 — Import Phase 2** | Restore wizard UI at `/vault/restore`; identity restore on clean targets |
| **1 — P1-C1** | `vaultPasskey.js` PRF wrap/unwrap primitives + capability detection; tests only |
| **1 — P1-C2** | `vaultPasskeyStorage.js` + `vaultPasskeyEnroll.js`; local passkey wrap persistence + enroll orchestration; no UI/unlock yet |
| **1 — P1-C3** | Passkey unlock in `vaultUnlock.js` + minimal vault page unlock button; PIN fallback unchanged |
| **1 — P1-C4** | Passkey enrollment UI (`VaultPasskeySection.jsx`) |
| **2** | Cross-device document migration, `vault_id` server binding, ciphertext re-homing |

## Storage

Wrapped MVK records live in browser `localStorage` (`prooforigin_vault_wrapped_mvk_v1`) after **brand-new vault setup** only. Existing vaults without this key remain on the legacy PIN-derived path.

### Commit 3 — encryption versions

| `encryption_version` | Vault mode | Document root key |
|---------------------|------------|-------------------|
| `1` | Legacy or MVK (v1 docs) | PIN-derived bytes (`legacyPinKey`) |
| `2` | MVK-mode uploads | Unwrapped MVK (`masterVaultKey`) |

- **Legacy vault** (no wrapped MVK): unlock, upload, and decrypt unchanged — all use PIN-derived root, version `1`.
- **MVK vault** (wrapped MVK present): unlock stores both MVK and legacy PIN key; new uploads use MVK + version `2`; v1 documents (e.g. Commit 2 gap) decrypt with legacy PIN key.
- **No migration** and **no re-encryption** in Commit 3.

Run `docs/sql/vault_encryption_v2.sql` on Supabase before MVK-mode uploads (`encryption_version = 2`).

Wrapped records must never contain plaintext MVK.

### Commit 4 — recovery kit export

- Available for **MVK vaults only** while unlocked.
- User generates a **12-word recovery phrase** and downloads a **recovery kit JSON** containing `vault_id`, `wrapped_mvk`, `version`, and `created_at`.
- The recovery phrase is **never** included in the kit file or sent to ProofOrigin servers.
- After the user confirms they saved phrase + kit, this device marks recovery as configured (`prooforigin_vault_recovery_kit_confirmed_v1`).
- **No cross-device document restore** and **no server-side recovery** in Commit 4. Identity restore ships in Import Phase 1–2; document re-homing remains Phase 2.

### P1-C2 — passkey storage + enrollment orchestration

- Passkey wrap records persist in browser `localStorage` (`prooforigin_vault_passkey_wrap_v1`).
- `enrollVaultPasskey()` requires unlocked MVK + legacy PIN key, WebAuthn PRF support, and creates:
  1. A resident platform passkey credential
  2. A PRF evaluation using `vault_id + credential_id` salt
  3. A local wrap record for MVK and legacy PIN key
- Enrollment returns **safe metadata only** (`vault_id`, `credential_id`, `enrolled_at`, version).
- **No UI** and **no server passkey registration** in P1-C2.
- PIN wrap and recovery kit flows remain unchanged.

### P1-C3 — passkey unlock wiring

- `resolveVaultUnlockKeysWithPasskey()` loads the local passkey wrap record, performs WebAuthn `get` + PRF evaluation, unwraps MVK + legacy PIN key, and returns the same session shape as MVK PIN unlock: `{ mode: "mvk", masterVaultKey, legacyPinKey }`.
- **Fail closed:** no enrolled record, missing PRF support, or unwrap failure returns clear errors; unwrap failure suggests PIN fallback.
- **User cancel:** WebAuthn `NotAllowedError` / `AbortError` is treated as a graceful cancel (no error banner).
- **Vault page:** when a passkey wrap record exists and the vault is not in first-time PIN setup, **Unlock with Passkey** is shown alongside PIN unlock. Successful passkey unlock calls `setVaultSessionUnlockKeys()` and continues the normal unlock bootstrap.
- **Not in P1-C3:** passkey enrollment UI (P1-C4), cross-device restore, server routes.

### Import Phase 2 — restore wizard + hardening

- Restore wizard at `/vault/restore` (kit → phrase → PIN → complete).
- `applyImportedVaultState()` snapshots pre-apply localStorage and **rolls back on failure** so PIN/MVK/genesis cannot orphan.
- Successful import clears stale local vault device identity; first unlock registers a fresh device.
- **Identity restore only** — document slot starts empty; cross-device ciphertext migration remains Phase 2.


- `VaultPasskeySection` shows passkey status (not enrolled / enrolled + timestamp) for MVK vaults while unlocked.
- **Enroll Passkey** calls `enrollVaultPasskey()`; **Replace Passkey** re-wraps with `replace: true`.
- Unlock modal shows **Unlock with Passkey** above the PIN form when a wrap record exists; PIN remains fallback.
- Requires WebAuthn PRF on the device; unsupported browsers see a clear status message and keep PIN unlock.

## Related code

- `app/lib/vaultRecovery.js` — recovery phrase, key derivation, kit export/import
- `app/lib/vaultRecoveryImport.js` — import orchestration, atomic apply rollback, device reset on success
- `app/lib/vaultRecoveryImportWizard.js` — restore wizard validation/navigation
- `components/vault/RecoveryImportWizard.jsx` — restore wizard UI
- `app/vault/restore/page.jsx` — `/vault/restore` route
- `docs/knowledge/guide/restore-vault.md` — Guide restore flow and limitations
- `components/vault/VaultRecoverySection.jsx` — generate/download/confirm UI
- `app/lib/vaultPasskey.js` — passkey PRF wrap/unwrap foundation + capability detection (P1-C1)
- `app/lib/vaultPasskeyStorage.js` — passkey wrap record persistence (P1-C2)
- `components/vault/VaultPasskeySection.jsx` — passkey enroll/replace UI (P1-C4)
- `app/lib/vaultPasskeyStatus.js` — passkey status helpers for UI
- `app/lib/vaultUnlock.js` — unlock branching (MVK vs legacy) + passkey unlock (P1-C3)
- `app/lib/vaultKeyRing.js` — MVK wrap/unwrap foundation
- `app/lib/vaultKeyRingStorage.js` — wrapped MVK persistence and MVK mode detection
- `app/lib/vaultPin.js` — PIN normalization and PBKDF2
- `app/lib/vaultCrypto.js` — document encrypt/decrypt (HKDF root from session keys)
- `app/lib/vaultDevice.js` — device-bound API auth (unchanged in Phase 1)

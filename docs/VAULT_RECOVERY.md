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
- **Passkey wrap:** Planned — WebAuthn PRF when available; gates local MVK wrap (Phase 2).
- **Recovery kit:** Planned — user-held phrase encrypts MVK export; setup/export UI in a later commit.

## Unlock priority (target behavior)

1. **Passkey** — primary when enrolled (local WebAuthn, no server key material).
2. **PIN** — fallback when passkey unavailable or user chooses PIN.
3. **Recovery kit** — disaster recovery on a new device (Phase 2+); requires phrase or imported kit file.

Session behavior (vanish mode, Protected View) is unchanged by the Key Ring.

## User scenarios

### Daily unlock (same device)

Passkey or PIN unwraps MVK in browser memory only. MVK is cleared on vanish / lock.

### Forgotten PIN

- Passkey enrolled → unlock with passkey, set new PIN, re-wrap MVK.
- Recovery kit saved → phrase unwraps MVK, set new PIN.
- Neither → **unrecoverable**.

### Lost phone

Requires recovery kit (Phase 2). Same-device Phase 1 does not promise cross-device restore.

### Stolen phone

User marks vault **compromised** (existing flow). Attacker needs PIN/passkey to decrypt. Recovery on new device uses recovery kit + device re-registration (Phase 2).

## Phase roadmap

| Phase | Scope |
|-------|--------|
| **1 — Commit 1** (this doc + `vaultKeyRing.js`) | MVK generate/wrap/unwrap with PIN; tests only; **no production unlock change** |
| **1 — Commit 2** | Migrate unlock/upload to MVK root; legacy PIN-only migration on next unlock |
| **1 — Commit 3** | Passkey enroll/unlock (no recovery UI) |
| **1 — Commit 4** | Recovery kit generate/export + acknowledgment gate |
| **2** | Cross-device recovery, `vault_id` device registry, ciphertext re-homing |

## Storage

Phase 1 foundation defines wrapped MVK **records** (versioned JSON). Production `localStorage` integration arrives in Commit 2. Until then, existing PIN-derived unlock remains in production.

Wrapped records must never contain plaintext MVK.

## Related code

- `app/lib/vaultKeyRing.js` — MVK wrap/unwrap foundation
- `app/lib/vaultPin.js` — PIN normalization and PBKDF2
- `app/lib/vaultCrypto.js` — document encrypt/decrypt (MVK root in Commit 2)
- `app/lib/vaultDevice.js` — device-bound API auth (unchanged in Phase 1)

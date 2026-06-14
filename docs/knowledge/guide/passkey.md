---
id: passkey
version: 1
title: Vault passkeys
audience: guide
product: vault
status: active
source_of_truth: docs/knowledge/guide/passkey.md
last_reviewed: 2026-06-14
---

# Vault passkeys

A vault passkey lets you unlock with Face ID, Touch ID, Windows Hello, or your device screen lock.

## Requirements

ProofOrigin requires **secure passkey encryption (WebAuthn PRF)**, not just basic passkey login. Some browsers and in-app browsers do not support this yet.

## Recommended browsers

- **iPhone / iPad:** Safari (latest)
- **Android:** Chrome (latest)
- **Windows:** Edge or Chrome with Windows Hello
- **Mac:** Safari or Chrome with Touch ID

## Enroll a passkey

1. Unlock the vault with your PIN.
2. Open the **Passkey** section below Recovery.
3. Tap **Enroll Passkey** and complete your device prompt.

Your PIN remains backup if passkey unlock is unavailable.

## Why passkey may not work here

- In-app browsers (social apps, email wrappers) often block secure passkey encryption
- Older browsers without PRF support
- A passkey enrolled on another device is not restored automatically in Phase 1

ProofOrigin does **not** offer a weakened passkey mode. If PRF is unavailable, use your PIN.

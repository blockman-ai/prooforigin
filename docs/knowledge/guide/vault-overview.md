---
id: vault-overview
version: 1
title: Your Private Vault
audience: guide
product: vault
status: active
source_of_truth: docs/help/vault-overview.md
last_reviewed: 2026-06-14
---

# Your Private Vault

ProofOrigin Vault stores **encrypted** trust documents on your device and in ProofOrigin storage. ProofOrigin **cannot read** your files. Only you can unlock the vault with your PIN, passkey, or recovery materials.

## What the vault is for

- Identity and trust records you want to keep private
- Encrypted uploads with a clear audit timeline
- Lock and vanish behavior when you step away

## Protected View

Protected View lets you **read** an encrypted document inside the vault without downloading an unprotected copy.

- Documents open in a view-only overlay
- A watermark helps discourage casual screenshots
- Export and save-as are not the goal of Protected View
- Close Protected View or lock the vault when you are finished

## What ProofOrigin never sees

- Your PIN
- Your master vault key
- Recovery phrase or recovery kit contents
- Decrypted document content

If you lose your device, PIN, passkey, **and** recovery kit, the vault may be **permanently locked**. That is intentional zero-knowledge security.

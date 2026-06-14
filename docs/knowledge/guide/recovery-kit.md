---
id: recovery-kit
version: 1
title: Recovery Kit
audience: guide
product: vault
status: active
source_of_truth: docs/knowledge/guide/recovery-kit.md
last_reviewed: 2026-06-14
---

# Recovery Kit

A Recovery Kit helps you recover access if you lose this device or forget your PIN—**only if you saved it safely beforehand**.

## What it includes

- A **recovery kit file** you download (encrypted metadata about your vault)
- A **12-word recovery phrase** you write down separately

The phrase is **never** stored inside the kit file or on ProofOrigin servers.

## How to create one

1. Unlock your vault with PIN or passkey.
2. Open the **Recovery** section.
3. Generate, download, and store the kit file offline.
4. Write the recovery phrase on paper or another offline backup.
5. Confirm you saved both on this device.

## How to restore on a new device

1. Open **Restore from Recovery Kit** (`/vault/restore`) on the new device.
2. Upload your saved kit JSON file and enter your 12-word phrase.
3. Set a new PIN, then open the vault and unlock to register this device.

Restore recovers **vault identity** only. Documents from your previous device are **not migrated yet**—your document slot starts empty until cross-device migration ships.

See also: **Restore Vault on a New Device** in Guide for the full flow and limitations.

## If you did not save a kit

ProofOrigin **cannot** unlock your vault for you. No email reset. No staff override. This protects your privacy by design.

## Passkey enrolled but no kit?

You may still unlock with passkey or PIN on this device. A Recovery Kit is your disaster backup if the device is lost.

Never paste your recovery phrase into help chat or upload it anywhere.

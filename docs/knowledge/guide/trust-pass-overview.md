---
id: trust-pass-overview
version: 1
title: ProofOrigin Trust Pass
audience: guide
product: trust_pass
status: active
source_of_truth: docs/knowledge/guide/trust-pass-overview.md
last_reviewed: 2026-06-14
---

# ProofOrigin Trust Pass

A **Trust Pass** is ProofOrigin's public verification credential for online trust. It helps people confirm that a profile or link belongs to the holder who controls the pass right now.

## What a Trust Pass is

- A **Live Trust Code** that rotates on a refresh window for your plan
- A public verification link and trust history on ProofOrigin servers
- A way to show **trust state** and verification events over time

This is an **online trust pass**, not a government ID and not legal identity verification.

## How verification works

1. The holder shares their public Trust Pass link or displays the current **Live Trust Code**.
2. A verifier opens the link or enters the 6-digit code while it is still valid.
3. ProofOrigin checks the code against the active card and records a verification event when it matches.

The **Live Trust Code is the primary proof** in every check. Always confirm the current code — not a screenshot, badge, or old message.

## Optional Voice documented signal

If the holder linked an optional **Voice Anchor** enrollment, public verifiers may see **Voice documented**. That means a voice enrollment was linked as a **historical documentation signal** at link time.

- It is **not** live voice matching
- It is **not** biometric proof
- It does **not** replace the Live Trust Code

## What public verifiers see

- Trust state and card metadata you chose to publish
- Live Trust Code verification results
- Trust history events (created, verified, and related state changes)
- Optional **Voice documented** badge when linked

Public verifiers do **not** receive vault contents, PINs, recovery materials, or private Voice Anchor secrets.

## What a Trust Pass is not

- Not a government ID or driver's license replacement
- Not absolute proof of who someone is in all contexts
- Not automatic trust for every session or message
- Not hardware-backed identity keys presented to verifiers
- Not proof that bypasses social engineering or impersonation on its own

Use Trust Pass as one signal alongside context, channel safety, and your own judgment.

---
id: trust-pass-voice
version: 1
title: Trust Pass + Voice Anchor
audience: guide
product: trust_pass
status: active
source_of_truth: docs/help/trust-pass-voice.md
last_reviewed: 2026-06-14
---

# Trust Pass + Voice Anchor

**Voice documented** means the Trust Pass holder linked an optional Voice Anchor enrollment to this pass. It is a **historical documentation signal**, not live voice verification and not biometric proof.

## What linking does

- Connects your existing Voice Anchor enrollment to your Trust Pass on ProofOrigin servers
- Adds a public **Voice documented** badge on your verification page
- Records an append-only trust history event

## What linking does not do

- Does not verify someone's voice in real time during Trust Code checks
- Does not store or play raw audio on the Trust Pass
- Does not expose your fingerprint hash, enrollment token, or enrollment ID publicly
- Does not replace the Live Trust Code as primary proof

## How to link

1. Create a Trust Pass and enroll a Voice Anchor on this device
2. Open your Trust Pass page
3. Choose **Link Voice Anchor** and confirm
4. Verifiers will see **Voice documented** on your public link

Both the Trust Pass and Voice enrollment must be saved to ProofOrigin servers (`stored: true`) for the public signal to appear.

## How to unlink

On your Trust Pass page, choose **Unlink Voice Anchor**. The public badge is removed. Your Voice Anchor enrollment may still exist separately until you delete it on the Voice Anchor page.

## For verifiers

Trust Code verification remains the primary check. Voice documented only means the holder chose to document a voice enrollment at link time. Always confirm the live 6-digit code — screenshots and voice badges alone are not sufficient proof.

---
id: voice-anchor-overview
version: 1
title: Voice Anchor overview
audience: guide
product: voice_anchor
status: active
source_of_truth: docs/knowledge/guide/voice-anchor-overview.md
last_reviewed: 2026-06-14
---

# Voice Anchor overview

**Voice Anchor** is an optional ProofOrigin feature that documents a voice enrollment signal. It is V1 enrollment and documentation — not live caller verification.

## What Voice Anchor does

- Lets you record or upload a short audio sample in your browser
- Sends audio to ProofOrigin for **in-memory processing** to create a private **fingerprint hash**
- Stores enrollment metadata and the hash on ProofOrigin servers
- Keeps a local enrollment token in this browser session for holder actions

Describe the public signal as **Voice documented**, not **Voice verified**.

## What Voice Anchor does not do

- Does not perform live voice matching during Trust Code checks
- Does not prove the speaker is live on a call
- Does not provide anti-spoof or synthetic-voice detection in V1
- Does not guarantee biometric certainty
- Does not block scam calls automatically

## Linking to a Trust Pass

Linking is **optional**. On your Trust Pass page you can connect an existing Voice Anchor enrollment so verifiers see **Voice documented** on your public pass.

Linking records a trust history event. Unlinking removes the public badge; your separate Voice Anchor enrollment may still exist until you delete it.

## What public verifiers never see

Public Trust Pass pages never expose:

- Fingerprint hash values
- Enrollment tokens
- Enrollment IDs
- Raw audio recordings

Verifiers should still rely on the **Live Trust Code** as primary proof.

## Privacy notes

- Raw audio is processed to create the hash and is **not permanently stored** as a playable recording
- ProofOrigin does not sell voiceprints or share them with third parties for advertising
- You can delete your voice anchor record from the Voice Anchor page when supported on this device

Voice Anchor is a documentation layer — useful context, not a standalone identity guarantee.

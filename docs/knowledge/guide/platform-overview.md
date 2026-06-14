---
id: platform-overview
version: 1
title: How ProofOrigin fits together
audience: guide
product: platform
status: active
source_of_truth: docs/knowledge/guide/platform-overview.md
last_reviewed: 2026-06-14
---

# How ProofOrigin fits together

ProofOrigin combines several layers that work together while keeping sensitive secrets off the server.

## The trust stack

| Layer | Role |
|-------|------|
| **Trust Pass** | Public identity and trust signal — Live Trust Code, verification link, trust history |
| **Voice Anchor** | Optional authenticity documentation — fingerprint hash enrollment, not live verification |
| **Vault** | Private encrypted custody for documents — client-side keys |
| **Recovery Kit** | User-held phrase + kit file for vault identity disaster recovery |
| **Guide** | Safe in-app explanations — no access to your secrets |
| **Sentinel** | Ops monitoring, counters, and recommendations — never accesses user secrets |

## How the layers interact

- **Trust Pass** and **Voice Anchor** support **public trust signals** verifiers can check.
- **Vault** holds **private encrypted documents** separate from Trust Pass display data.
- **Recovery Kit** restores **vault identity** on a new device; cross-device document migration is a future phase.
- **Guide** answers product questions using approved help articles and safe context flags only.
- **Sentinel** observes platform health and abuse patterns for operators; it does not auto-unlock vaults or read user content.

## Who does what

- **Guide** explains shipped behavior to users.
- **Sentinel** observes and recommends for operators.
- **Developers** change product code, docs, and deployments — not end-user secrets.

## Zero-knowledge boundaries

ProofOrigin servers should **not** receive or store:

- Master Vault Key (MVK)
- Vault PIN
- Recovery phrase or recovery kit plaintext
- Raw voice audio as permanent recordings
- Decrypted vault document contents

Ciphertext, trust metadata, aggregate counters, and public Trust Pass fields may exist on servers by design.

## Labs and experiments

Media provenance tools, arcade experiments, and other evaluation features live under **Labs**. They are not the core homepage trust stack and may change independently of Vault or Trust Pass.

## Vault vs Trust Pass

- **Trust Pass** — shareable verification for chats, communities, and public links.
- **Vault** — private encrypted storage for documents you do not want to expose publicly.

You can use either or both. They serve different jobs in the same personal trust infrastructure.

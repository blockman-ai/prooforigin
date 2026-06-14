---
id: product-boundaries
version: 1
title: What ProofOrigin is and is not
audience: guide
product: platform
status: active
source_of_truth: docs/knowledge/guide/product-boundaries.md
last_reviewed: 2026-06-14
---

# What ProofOrigin is and is not

ProofOrigin is **personal trust infrastructure** in careful beta. It helps people verify trust signals and protect sensitive records **without** collecting everything about you.

## What ProofOrigin helps with

- **Trust Pass** — rotating live codes and public trust history for online verification
- **Voice Anchor** — optional voice documentation signals
- **Private Vault** — encrypted document custody with keys that stay on your device
- **Recovery Kit** — user-held materials for disaster recovery
- **Guide** — safe explanations about how these features work

## What ProofOrigin cannot do

- **Cannot unlock your vault** — no staff override, email reset, or support backdoor
- **Cannot recover** a lost PIN, passkey, recovery phrase, or recovery kit if you did not save them
- **Cannot read** decrypted vault documents, MVK, PIN, or recovery phrase on the server
- **Cannot guarantee** legal outcomes, medical decisions, or financial results

## What ProofOrigin is not

- Not a **bank** or payment system
- Not a **government ID** or legal identity document
- Not **absolute truth verification** for every claim or image
- Not a **medical authority** or electronic health record system
- Not a substitute for **legal, medical, or financial advice**

## Residual risks you should know

ProofOrigin reduces server-side exposure, but **browser and device risks remain**:

- **Screenshots and screen recording** during viewing — Protected View uses watermarks but cannot prevent all capture
- **Compromised devices** — malware or shared devices may expose unlocked sessions
- **Clipboard** — copying codes or links may leak to other apps
- **Malicious browser extensions** — can interfere with pages you visit
- **XSS and phishing** — always confirm you are on the real ProofOrigin site before entering secrets

Guide explains product behavior. It never asks for your PIN, recovery phrase, recovery kit file, or vault keys.

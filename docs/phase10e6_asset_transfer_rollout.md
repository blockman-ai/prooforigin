# Phase 10E-6 — Asset Transfer MVP Rollout

Two-party, signature-backed custody transfer for registered assets. Reuses ownership
verification (10D-1), the disclosure offer/accept handshake, receipt verification, and
the append-only asset custody timeline. Hash-only storage, no identities.

## 1. Database migration

Apply, in order (the registry MVP must already be applied):

1. `docs/sql/asset_registry_mvp.sql` (existing prerequisite)
2. `docs/sql/asset_transfer_mvp.sql` (this phase)

`asset_transfer_mvp.sql`:

- Creates `asset_ownership_claims` (versioned claims, unique current claim per asset).
- Creates `asset_transfers` (5 states, unique pending transfer per asset, receipt fields).
- Adds `related_transfer_id` to `asset_custody_events` and extends the allowed event types
  with `transfer_initiated|accepted|declined|expired|revoked`.
- Extends `vault_ownership_verifications.challenge_type` to allow `asset_transfer_accept`.
- **Creates `public.asset_transfer_accept_atomic(...)`** — the single all-or-nothing custody
  handoff function (Phase 10E-6A). `security definer`, `service_role`-only execute. Takes a
  per-asset advisory lock, re-validates pending state + source ownership, supersedes the prior
  claim, inserts the new current claim, reassigns custody, appends the `transfer_accepted`
  event, and writes the receipt — all in one transaction.

RLS stays service-role only. Verify the closing `select`s list both new tables and the
`asset_transfer_accept_atomic` function.

## 2. Invariants enforced

- **Provenance immutable** — transfers never write `asset_provenance_records`.
- **One current ownership claim per asset** — `asset_ownership_claims_one_current_idx`.
- **One pending transfer per asset** — `asset_transfers_one_pending_idx`.
- **Custody moves only on accept, atomically (10E-6A / H1)** — the entire handoff runs inside
  `asset_transfer_accept_atomic`. No partial state and no zero-current-claim window is visible
  to other transactions; any failure rolls the whole operation back.
- **Source ownership asserted (10E-6A / M1)** — acceptance is rejected unless
  `transfer.from_vault_ref_hash` still equals **both** the current ownership claim's claimant
  **and** the registered asset owner (`source_owner_mismatch` / `source_claim_mismatch`).
  Asserted in the API/store layer (defense-in-depth) and authoritatively inside the RPC under
  the advisory lock + `for update` row locks.
- **Hash-only / no identities** — only ref hashes, fingerprint hashes, receipt hashes stored.

## 3. APIs

- `POST /api/assets/[asset_id]/transfer` — owner creates an offer (returns one-time handle).
- `GET  /api/assets/[asset_id]/transfer` — owner lists transfers + ownership chain.
- `POST /api/assets/[asset_id]/transfer/revoke` — owner revokes a pending offer.
- `POST /api/assets/transfers/challenge` — recipient consume-once acceptance challenge (10D-1).
- `POST /api/assets/transfers/[handle]/preview` — recipient previews an offer (handle + secret).
- `POST /api/assets/transfers/[handle]/accept` — recipient accepts + signs (atomic handoff).
- `POST /api/assets/transfers/[handle]/decline` — recipient declines.
- `GET  /api/assets/transfers/incoming` — recipient lists received assets.
- `POST /api/assets/transfers/receipt/verify` — public transfer-receipt verification.

## 4. Pages

- `/assets/[asset_id]` — owner transfer panel (offer/revoke), ownership chain, transfer history.
- `/assets/transfers` — incoming transfer review + accept/decline; received-asset list.
- `/verify/asset/[verification_slug]` — public ownership chain (A → B → C) by opaque ref hash.

## 5. Production smoke

Use two vaults (A and B), both with a registered ownership key and a verified bound device.

1. **Offer (A).** On an asset A owns, open `/assets/[asset_id]` → "Transfer asset". Enter a
   recipient secret (16+ chars), choose terms, set expiry, create offer. Confirm a one-time
   transfer link appears and the asset shows a pending transfer.
2. **One-pending guard.** Attempt a second offer → expect `TRANSFER_ALREADY_PENDING` (409).
3. **Preview (B).** As B, open the transfer link (`/assets/transfers?handle=…`), enter the
   recipient secret → confirm the asset preview renders with terms and expiry.
4. **Accept (B).** Click Accept. B signs a consume-once challenge with B's ownership key.
   Expect success: custody now reflects B's vault, a transfer receipt is issued, and the
   custody timeline shows `transfer_initiated → transfer_accepted`.
5. **Replay.** Re-submit the same acceptance → expect `CHALLENGE_ALREADY_USED` / `TRANSFER_NOT_PENDING`.
   After acceptance, confirm exactly one `status = current` row exists for the asset in
   `asset_ownership_claims` and that `registered_assets.vault_ref_hash` equals that claim's
   `claimant_vault_ref_hash` (asset owner == current claim owner).
5a. **Stale source (10E-6A).** If an asset changes hands out-of-band between offer and accept,
   the accept call returns `SOURCE_OWNERSHIP_MISMATCH` (409) and writes no claim/event.
6. **Ownership chain.** Open the public page `/verify/asset/[slug]` → confirm `Owner 1 → Owner 2`
   with a "Verified transfer (2-party)" badge and current-owner marker. No identities shown.
7. **Receipt verification.** Call `POST /api/assets/transfers/receipt/verify` with the receipt
   id + hash → expect `verified: true`. Tamper the hash → expect `unavailable`.
8. **Revoke / decline.** Create a fresh offer, then revoke (A) and confirm a `transfer_revoked`
   event. Separately, create an offer and decline (B) → confirm `transfer_declined`.
9. **Chain a third hop.** From B, transfer the same asset to C and accept → confirm
   `Owner 1 → Owner 2 → Owner 3` renders on the public page.

## 6. Out of scope (intentionally not built)

discovery, marketplace, licensing, subscriptions, billing, anchoring, organizations,
dispute adjudication UI (the `disputed` claim status + visible conflict only).

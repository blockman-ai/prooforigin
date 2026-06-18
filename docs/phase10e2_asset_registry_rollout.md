# Phase 10E-2 — Asset Registry MVP Rollout

## Order

1. Apply `docs/sql/asset_registry_mvp.sql` in Supabase (Production).
2. Confirm tables exist:
   - `registered_assets`
   - `asset_provenance_records`
   - `asset_custody_events`
3. Deploy application code with Asset Registry MVP.
4. Run post-deploy smoke checks below.

## Preflight Gates

- Ownership registration hardening (10D-1) should already be deployed.
- `document_ref` disclosure custody repair should be deployed with this release.
- Asset registration requires bound vault device + verified ownership (same authority gate as disclosure owner actions).

## Smoke Tests

### Register PSA card

1. Unlock vault on a bound device with ownership registered.
2. Open `/assets/register`.
3. Register asset type `PSA Card` with display name, primary image, and serial/cert descriptor.
4. Expect redirect to `/assets/[asset_id]`.
5. Confirm page shows:
   - Asset ID
   - Asset fingerprint (64-char hex)
   - Provenance record hash
   - Custody timeline with `registered` event
   - Verification URL
   - Primary asset image

### Register document

1. Register asset type `Document` with optional primary image and evidence descriptor.
2. Confirm same outputs as PSA card flow.

### Public verification

1. Open verification URL from asset detail (`/verify/asset/[slug]`).
2. Expect public certificate page with asset image, asset name, protected-since date, trust language, and custody timeline.
3. Confirm fingerprints and hashes are hidden inside Technical Details.
3. Private visibility assets should return 404 on public verify.

### Registry dashboard

1. Open `/assets`.
2. Confirm registered assets appear with type, status, fingerprint, and links.

### Disclosure regression

1. Complete existing disclosure receipt verification at `/verify/receipt`.
2. Confirm `document_ref` scoped verify access succeeds after custody repair.

## Rollback Criteria

- If SQL is not applied, asset registration fails at insert — do not leave app deployed without migration.
- If public verification exposes private assets, roll back immediately.

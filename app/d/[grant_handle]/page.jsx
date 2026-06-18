"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import GlassPanel from "../../../components/protocol/GlassPanel";
import PageShell from "../../../components/protocol/PageShell";
import ProofField from "../../../components/protocol/ProofField";
import ProtocolBadge from "../../../components/protocol/ProtocolBadge";
import StatusCard from "../../../components/protocol/StatusCard";
import ProofOriginSeal from "../../../components/trust/ProofOriginSeal";
import PrivacyScreenGuard, {
  PRIVACY_CAPTURE_DISCLAIMER,
} from "../../../components/security/PrivacyScreenGuard";
import { TRUST_PASS_WATERMARK } from "../../lib/privacyCapture";
import {
  DISCLOSURE_RECIPIENT_PHASE,
  DISCLOSURE_UNAVAILABLE_MESSAGE,
  formatDisclosureGrantType,
  formatDisclosureScopeType,
  formatDisclosureTimestamp,
  probeDisclosureGrant,
  runDisclosureRecipientFlow,
  truncateDisclosureHash,
} from "../../lib/disclosureRecipientClient";
import { buildReceiptVerifyPagePath } from "../../lib/disclosureReceiptVerifyClient";
import Link from "next/link";

const DISCLOSURE_DISCLAIMER =
  "This is a ProofOrigin owner-authorized disclosure. It verifies authorization scope, not absolute truth.";

function DisclosureUnavailableBanner({ title = "Disclosure unavailable" }) {
  return (
    <div className="alert-banner alert-banner--error" role="alert">
      <strong>{title}</strong>
      {DISCLOSURE_UNAVAILABLE_MESSAGE}
    </div>
  );
}

function DisclosureReceiptCard({ receipt }) {
  if (!receipt) return null;

  return (
    <GlassPanel title="Disclosure receipt" className="disclosure-receipt-panel privacy-print-hide">
      <PrivacyScreenGuard
        strict
        className="privacy-screen-guard--trust-pass privacy-protected-live"
        watermarkText={TRUST_PASS_WATERMARK}
        showWatermark
      >
        <div className="proof-grid">
          <ProofField label="Receipt ID" value={receipt.receipt_id} mono />
          <ProofField label="Receipt hash" value={receipt.receipt_hash} mono />
          <ProofField label="Created" value={formatDisclosureTimestamp(receipt.created_at)} />
          <ProofField
            label="Policy snapshot hash"
            value={truncateDisclosureHash(receipt.policy_snapshot_hash)}
            mono
          />
          <ProofField
            label="Custody snapshot hash"
            value={truncateDisclosureHash(receipt.custody_snapshot_hash)}
            mono
          />
          <ProofField
            label="Disclosure digest"
            value={truncateDisclosureHash(receipt.disclosure_digest)}
            mono
          />
        </div>
        <p className="privacy-capture-disclaimer" role="note">
          {PRIVACY_CAPTURE_DISCLAIMER}
        </p>
        <p className="disclosure-receipt-verify-link">
          <Link href={buildReceiptVerifyPagePath(receipt.receipt_id)}>
            Verify independently
          </Link>
        </p>
      </PrivacyScreenGuard>
    </GlassPanel>
  );
}

export default function DisclosureRecipientPage() {
  const params = useParams();
  const grantHandle = String(params?.grant_handle || "").trim();

  const [phase, setPhase] = useState(DISCLOSURE_RECIPIENT_PHASE.IDLE);
  const [recipientChallenge, setRecipientChallenge] = useState("");
  const [error, setError] = useState("");
  const [accessResult, setAccessResult] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null);
  const [receipt, setReceipt] = useState(null);

  const grantSummary = useMemo(() => {
    const payload = accessResult?.payload || verifyResult?.payload || null;
    if (!payload) return null;

    return {
      grantType: payload.grant_type || null,
      scopeType: payload.scope_type || null,
      purposeLabel: payload.claim || null,
      expiresAt: payload.expires_at || null,
      maxAccessCount: payload.max_access_count ?? null,
      status: payload.status || null,
      accessedAt: payload.accessed_at || payload.verified_at || null,
    };
  }, [accessResult, verifyResult]);

  useEffect(() => {
    if (!grantHandle) return;

    let cancelled = false;

    async function loadGrantProbe() {
      setPhase(DISCLOSURE_RECIPIENT_PHASE.PROBING);
      setError("");

      try {
        const probe = await probeDisclosureGrant(grantHandle);
        if (cancelled) return;

        if (probe.kind === "unavailable") {
          setPhase(DISCLOSURE_RECIPIENT_PHASE.UNAVAILABLE);
          return;
        }

        if (probe.kind === "success") {
          setVerifyResult(probe);
          setPhase(DISCLOSURE_RECIPIENT_PHASE.VERIFIED);
          return;
        }

        setPhase(DISCLOSURE_RECIPIENT_PHASE.READY);
      } catch {
        if (!cancelled) {
          setPhase(DISCLOSURE_RECIPIENT_PHASE.UNAVAILABLE);
        }
      }
    }

    loadGrantProbe();
    return () => {
      cancelled = true;
    };
  }, [grantHandle]);

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      const challenge = recipientChallenge.trim();
      if (challenge.length < 16) {
        setError("Enter the disclosure code provided by the owner (at least 16 characters).");
        return;
      }

      setError("");
      setPhase(DISCLOSURE_RECIPIENT_PHASE.ACCEPTING);
      setAccessResult(null);
      setVerifyResult(null);
      setReceipt(null);

      try {
        setPhase(DISCLOSURE_RECIPIENT_PHASE.ACCESSING);
        const flow = await runDisclosureRecipientFlow(grantHandle, challenge);

        if (flow.phase === DISCLOSURE_RECIPIENT_PHASE.SUCCESS) {
          setAccessResult(flow.access);
          setReceipt(flow.receipt);
          setPhase(DISCLOSURE_RECIPIENT_PHASE.SUCCESS);
          return;
        }

        if (flow.phase === DISCLOSURE_RECIPIENT_PHASE.VERIFIED) {
          setVerifyResult(flow.verify);
          setPhase(DISCLOSURE_RECIPIENT_PHASE.VERIFIED);
          return;
        }

        if (flow.phase === DISCLOSURE_RECIPIENT_PHASE.UNAVAILABLE) {
          setPhase(DISCLOSURE_RECIPIENT_PHASE.UNAVAILABLE);
          return;
        }

        setPhase(DISCLOSURE_RECIPIENT_PHASE.DENIED);
      } catch {
        setPhase(DISCLOSURE_RECIPIENT_PHASE.UNAVAILABLE);
      }
    },
    [grantHandle, recipientChallenge]
  );

  const showChallengeForm =
    phase === DISCLOSURE_RECIPIENT_PHASE.READY ||
    phase === DISCLOSURE_RECIPIENT_PHASE.DENIED ||
    phase === DISCLOSURE_RECIPIENT_PHASE.ACCEPTING ||
    phase === DISCLOSURE_RECIPIENT_PHASE.ACCESSING;

  const isSubmitting =
    phase === DISCLOSURE_RECIPIENT_PHASE.ACCEPTING || phase === DISCLOSURE_RECIPIENT_PHASE.ACCESSING;

  return (
    <PageShell
      narrow
      badge="ProofOrigin Disclosure"
      title="Verify authorized disclosure"
      subtitle={`Enter the owner-provided disclosure code to complete verification. ${DISCLOSURE_DISCLAIMER}`}
      className="trust-cred-page trust-cred-page--verify disclosure-recipient-page"
    >
      <p className="trust-cred-lead">
        This page confirms whether an owner-authorized disclosure grant is valid and, when applicable,
        issues a cryptographic receipt.
      </p>

      {!grantHandle && <DisclosureUnavailableBanner title="Invalid disclosure link" />}

      {grantHandle && phase === DISCLOSURE_RECIPIENT_PHASE.PROBING && (
        <div className="alert-banner alert-banner--warning" role="status">
          Loading disclosure status…
        </div>
      )}

      {grantHandle && phase === DISCLOSURE_RECIPIENT_PHASE.UNAVAILABLE && (
        <DisclosureUnavailableBanner />
      )}

      {grantHandle && phase === DISCLOSURE_RECIPIENT_PHASE.DENIED && (
        <DisclosureUnavailableBanner title="Disclosure could not be completed" />
      )}

      {grantHandle && showChallengeForm && (
        <>
          <article className="titanium-pass titanium-pass--verify" aria-label="Disclosure grant">
            <div className="titanium-pass__sheen" aria-hidden="true" />
            <div className="titanium-pass__grain" aria-hidden="true" />

            <header className="titanium-pass__header">
              <div className="titanium-pass__brand-row">
                <ProofOriginSeal size={28} />
                <div>
                  <p className="titanium-pass__brand">ProofOrigin</p>
                  <h2 className="titanium-pass__title">Authorized disclosure</h2>
                </div>
              </div>
              <ProtocolBadge variant="pending">Awaiting code</ProtocolBadge>
            </header>

            <div className="titanium-pass__body">
              <dl className="identity-card-preview__fields titanium-pass__fields titanium-pass__fields--compact">
                <div>
                  <dt>Status</dt>
                  <dd>{phase === DISCLOSURE_RECIPIENT_PHASE.DENIED ? "Unavailable" : "Ready for verification"}</dd>
                </div>
                <div>
                  <dt>Grant handle</dt>
                  <dd className="identity-card-inline-mono">{truncateDisclosureHash(grantHandle, 8, 8)}</dd>
                </div>
              </dl>
            </div>

            <footer className="titanium-pass__footer">
              <p>{DISCLOSURE_DISCLAIMER}</p>
            </footer>
          </article>

          <GlassPanel title="Disclosure code" className="trust-verify-panel">
            <form className="dts-verify-form trust-verify-form" onSubmit={handleSubmit}>
              <label className="dataset-field">
                <span className="dataset-field__label">Recipient disclosure code</span>
                <input
                  className="dataset-field__input trust-verify-form__code"
                  type="password"
                  autoComplete="off"
                  value={recipientChallenge}
                  onChange={(event) => setRecipientChallenge(event.target.value)}
                  placeholder="Enter owner-provided code"
                  minLength={16}
                  maxLength={256}
                  disabled={isSubmitting}
                  aria-describedby="disclosure-code-hint"
                />
                <span id="disclosure-code-hint" className="dataset-field__hint">
                  This code was shared privately by the vault owner. It is never stored in this browser.
                </span>
              </label>

              {error && (
                <div className="alert-banner alert-banner--error" role="alert">
                  <strong>Input required</strong>
                  {error}
                </div>
              )}

              <div className="protocol-actions">
                <button type="submit" className="primary" disabled={isSubmitting}>
                  {isSubmitting ? "Verifying disclosure…" : "Verify disclosure"}
                </button>
              </div>
            </form>
          </GlassPanel>
        </>
      )}

      {grantHandle && phase === DISCLOSURE_RECIPIENT_PHASE.SUCCESS && (
        <>
          <StatusCard
            variant="success"
            title="Disclosure verified and receipted."
            body="Owner-authorized scoped verification completed. The receipt below records the disclosure event."
          />

          <article className="titanium-pass titanium-pass--verify" aria-label="Disclosure result">
            <div className="titanium-pass__sheen" aria-hidden="true" />
            <div className="titanium-pass__grain" aria-hidden="true" />

            <header className="titanium-pass__header">
              <div className="titanium-pass__brand-row">
                <ProofOriginSeal size={28} />
                <div>
                  <p className="titanium-pass__brand">ProofOrigin</p>
                  <h2 className="titanium-pass__title">Disclosure accessed</h2>
                </div>
              </div>
              <ProtocolBadge variant="success">Receipted</ProtocolBadge>
            </header>

            <div className="titanium-pass__body">
              <dl className="identity-card-preview__fields titanium-pass__fields titanium-pass__fields--compact">
                <div>
                  <dt>Status</dt>
                  <dd>{grantSummary?.status || "accessed"}</dd>
                </div>
                <div>
                  <dt>Grant type</dt>
                  <dd>{formatDisclosureGrantType(grantSummary?.grantType)}</dd>
                </div>
                {grantSummary?.scopeType && (
                  <div>
                    <dt>Scope type</dt>
                    <dd>{formatDisclosureScopeType(grantSummary.scopeType)}</dd>
                  </div>
                )}
                {grantSummary?.purposeLabel && (
                  <div>
                    <dt>Claim</dt>
                    <dd>{grantSummary.purposeLabel}</dd>
                  </div>
                )}
                {grantSummary?.accessedAt && (
                  <div>
                    <dt>Accessed</dt>
                    <dd>{formatDisclosureTimestamp(grantSummary.accessedAt)}</dd>
                  </div>
                )}
                {grantSummary?.expiresAt && (
                  <div>
                    <dt>Expires</dt>
                    <dd>{formatDisclosureTimestamp(grantSummary.expiresAt)}</dd>
                  </div>
                )}
                {grantSummary?.maxAccessCount != null && (
                  <div>
                    <dt>Max access count</dt>
                    <dd>{grantSummary.maxAccessCount}</dd>
                  </div>
                )}
              </dl>
            </div>
          </article>

          <DisclosureReceiptCard receipt={receipt} />
        </>
      )}

      {grantHandle && phase === DISCLOSURE_RECIPIENT_PHASE.VERIFIED && (
        <>
          <StatusCard
            variant="success"
            title="Disclosure verified."
            body="Owner-authorized verification completed for this grant."
          />

          <GlassPanel title="Verification result">
            <div className="proof-grid">
              <ProofField
                label="Grant type"
                value={formatDisclosureGrantType(grantSummary?.grantType)}
              />
              <ProofField label="Status" value={grantSummary?.status || "verified"} />
              <ProofField label="Claim" value={grantSummary?.purposeLabel} />
              <ProofField
                label="Verified"
                value={formatDisclosureTimestamp(grantSummary?.accessedAt)}
              />
              <ProofField label="Expires" value={formatDisclosureTimestamp(grantSummary?.expiresAt)} />
            </div>
          </GlassPanel>
        </>
      )}
    </PageShell>
  );
}

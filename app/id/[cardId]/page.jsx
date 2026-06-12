"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import GlassPanel from "../../../components/protocol/GlassPanel";
import PageShell from "../../../components/protocol/PageShell";
import ProtocolBadge from "../../../components/protocol/ProtocolBadge";
import ProofOriginSeal from "../../../components/trust/ProofOriginSeal";
import TrustDNAV0 from "../../../components/trust/TrustDNAV0";
import TrustPricingTeaser from "../../../components/trust/TrustPricingTeaser";
import TrustTimeline from "../../../components/trust/TrustTimeline";
import TrustRing from "../../../components/trust/TrustRing";
import PrivacyScreenGuard, {
  PRIVACY_CAPTURE_DISCLAIMER,
} from "../../../components/security/PrivacyScreenGuard";
import { TRUST_PASS_WATERMARK } from "../../lib/privacyCapture";
import {
  formatCardDate,
  IDENTITY_DISCLAIMER,
  formatTrustStateLabel,
  formatTrustTierLabel,
  trustStateBadgeVariant,
  resolveCardRotationSeconds,
  resolveCardTrustTier,
  ROTATING_CODE_WINDOW_SECONDS,
  usesStrictVerifyWindow,
} from "../../lib/identityCardShared";

const TRUST_PASS_DISCLAIMER =
  "This is a ProofOrigin Online Trust Pass, not a government ID.";

function truncateHash(hash, head = 12, tail = 8) {
  if (!hash || hash.length <= head + tail + 3) return hash || "—";
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

export default function PublicTrustPassPage() {
  const params = useParams();
  const cardId = String(params?.cardId || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [card, setCard] = useState(null);
  const [trustHistory, setTrustHistory] = useState([]);
  const [trustCode, setTrustCode] = useState("");
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (!cardId) return;

    async function loadCard() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/identity-card/public/${encodeURIComponent(cardId)}`);
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Could not load trust pass.");
        }
        if (!data.card) {
          throw new Error("Trust pass not found.");
        }
        setCard(data.card);
        setTrustHistory(data.trust_history || []);
      } catch (err) {
        setError(err.message || "Could not load trust pass.");
      } finally {
        setLoading(false);
      }
    }

    loadCard();
  }, [cardId]);

  async function handleVerifyCode(event) {
    event.preventDefault();
    setVerifying(true);
    setVerifyResult(null);
    setError("");

    try {
      const normalized = trustCode.replace(/\D/g, "").slice(0, 6);
      if (normalized.length !== 6) {
        throw new Error("Enter the 6-digit trust code shown on the holder's device.");
      }

      const res = await fetch("/api/identity-card/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          card_id: cardId,
          current_code: normalized,
        }),
      });

      const data = await res.json();
      if (!res.ok && !data.success) {
        throw new Error(data.error || "Verification failed.");
      }

      setVerifyResult(data);
      setCard((prev) =>
        prev
          ? {
              ...prev,
              trust_state: data.trust_state || prev.trust_state,
              last_verified_at: data.verified_at || prev.last_verified_at,
              verification_count:
                data.valid && typeof prev.verification_count === "number"
                  ? prev.verification_count + 1
                  : prev.verification_count,
              verification_status: data.valid
                ? "Verified just now"
                : prev.verification_status,
            }
          : prev
      );

      if (data.valid) {
        const historyRes = await fetch(
          `/api/identity-card/public/${encodeURIComponent(cardId)}`
        );
        const historyData = await historyRes.json();
        if (historyData.success) {
          setTrustHistory(historyData.trust_history || []);
          if (historyData.card) {
            setCard((prev) => (prev ? { ...prev, ...historyData.card, card_id: prev.card_id } : prev));
          }
        }
      }
    } catch (err) {
      setError(err.message || "Verification failed.");
    } finally {
      setVerifying(false);
    }
  }

  const badgeVariant = card ? trustStateBadgeVariant(card.trust_state) : "pending";
  const verifiedCount =
    card?.verification_count ??
    trustHistory.filter((event) => event.event_type === "verified").length;
  const rotationWindow = card
    ? resolveCardRotationSeconds(card)
    : ROTATING_CODE_WINDOW_SECONDS;
  const trustTierLabel = card ? formatTrustTierLabel(card.trust_tier || "free") : "Free";
  const strictVerifyWindow = card ? usesStrictVerifyWindow(resolveCardTrustTier(card)) : false;

  return (
    <PageShell
      narrow
      badge="Premium Trust Credential • Verify"
      title="Verify Online Trust Pass"
      subtitle={`Trust is built through history, verification, and proof. ${TRUST_PASS_DISCLAIMER}`}
      className="trust-cred-page trust-cred-page--verify"
    >
      <p className="trust-cred-lead">
        Confirm a live ProofOrigin trust code in real time. A screenshot is not sufficient proof.
      </p>

      {loading && (
        <div className="alert-banner alert-banner--warning" role="status">
          Loading trust pass…
        </div>
      )}

      {error && !card && (
        <div className="alert-banner alert-banner--error" role="alert">
          <strong>Unable to load</strong>
          {error}
        </div>
      )}

      {card && (
        <>
          <article className="titanium-pass titanium-pass--verify" aria-label="Trust pass verification">
            <div className="titanium-pass__sheen" aria-hidden="true" />
            <div className="titanium-pass__grain" aria-hidden="true" />

            <header className="titanium-pass__header">
              <div className="titanium-pass__brand-row">
                <TrustRing progress={1} size={52} label="Trust state ring">
                  <ProofOriginSeal size={28} />
                </TrustRing>
                <div>
                  <p className="titanium-pass__brand">ProofOrigin</p>
                  <h2 className="titanium-pass__title">{card.display_name}</h2>
                </div>
              </div>
              <ProtocolBadge variant={badgeVariant}>
                {formatTrustStateLabel(card.trust_state)}
              </ProtocolBadge>
            </header>

            <div className="titanium-pass__body">
              <dl className="identity-card-preview__fields titanium-pass__fields titanium-pass__fields--compact">
                <div>
                  <dt>Card ID</dt>
                  <dd className="identity-card-inline-mono">{card.card_id}</dd>
                </div>
                {card.username && (
                  <div>
                    <dt>Handle</dt>
                    <dd>@{String(card.username).replace(/^@/, "")}</dd>
                  </div>
                )}
                {card.purpose && (
                  <div>
                    <dt>Purpose</dt>
                    <dd>{card.purpose}</dd>
                  </div>
                )}
                <div>
                  <dt>Issued</dt>
                  <dd>{formatCardDate(card.issued_at)}</dd>
                </div>
                <div>
                  <dt>Expires</dt>
                  <dd>{formatCardDate(card.expires_at)}</dd>
                </div>
                <div>
                  <dt>Verification status</dt>
                  <dd>{card.verification_status}</dd>
                </div>
                <div>
                  <dt>Trust tier</dt>
                  <dd>{trustTierLabel}</dd>
                </div>
                <div>
                  <dt>Code refresh</dt>
                  <dd>{rotationWindow}s</dd>
                </div>
                <div>
                  <dt>Latest state hash</dt>
                  <dd className="identity-card-inline-mono">
                    {truncateHash(card.latest_state_hash)}
                  </dd>
                </div>
              </dl>
            </div>

            <footer className="titanium-pass__footer">
              <p>{IDENTITY_DISCLAIMER}</p>
            </footer>
          </article>

          <GlassPanel title="Live Trust Code" className="trust-verify-panel privacy-print-hide">
            <PrivacyScreenGuard
              strict
              className="privacy-screen-guard--trust-pass privacy-protected-live"
              watermarkText={TRUST_PASS_WATERMARK}
              showWatermark
            >
            <form className="dts-verify-form trust-verify-form" onSubmit={handleVerifyCode}>
              <div className="trust-verify-form__hero">
                <ProofOriginSeal size={36} />
                <p className="trust-live-code__eyebrow">Enter holder&apos;s Live Trust Code</p>
              </div>
              <label className="dataset-field">
                <span className="dataset-field__label">6-digit trust code</span>
                <input
                  className="dataset-field__input dts-verify-form__code trust-verify-form__code"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={trustCode}
                  onChange={(e) => setTrustCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  autoComplete="one-time-code"
                  aria-describedby="trust-code-hint"
                />
                <span id="trust-code-hint" className="dataset-field__hint">
                  {trustTierLabel} tier — code refreshes every {rotationWindow}s on the holder&apos;s
                  device. Enter the live code shown right now
                  {strictVerifyWindow
                    ? " (current or immediately previous window only)."
                    : " (current or adjacent window accepted)."}
                </span>
              </label>
              <div className="protocol-actions">
                <button type="submit" className="primary" disabled={verifying}>
                  {verifying ? "Verifying…" : "Verify Live Trust Code"}
                </button>
              </div>
            </form>

            {verifyResult && (
              <div
                className={`alert-banner ${verifyResult.valid ? "alert-banner--success" : "alert-banner--warning"}`}
                role="status"
              >
                <strong>{verifyResult.valid ? "Trust code valid" : "Trust code invalid"}</strong>
                {verifyResult.valid
                  ? "This code matches ProofOrigin's server-side check for the current time window."
                  : "The code did not match or the trust pass is not active."}
              </div>
            )}

            {error && card && (
              <div className="alert-banner alert-banner--error" role="alert">
                <strong>Verification issue</strong>
                {error}
              </div>
            )}

            <p className="privacy-capture-disclaimer" role="note">
              {PRIVACY_CAPTURE_DISCLAIMER}
            </p>
            </PrivacyScreenGuard>
          </GlassPanel>

          <GlassPanel title="Trust History">
            <TrustTimeline events={trustHistory} />
          </GlassPanel>

          <TrustDNAV0
            issuedAt={card.issued_at}
            verificationCount={verifiedCount}
            historyCount={trustHistory.length}
          />
        </>
      )}

      <div className="protocol-actions">
        <Link href="/identity-card" className="secondary">
          Forge your own trust pass
        </Link>
      </div>

      <TrustPricingTeaser />
    </PageShell>
  );
}

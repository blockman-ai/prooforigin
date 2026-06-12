"use client";

import { useCallback, useEffect, useState } from "react";
import GlassPanel from "../../components/protocol/GlassPanel";
import PageShell from "../../components/protocol/PageShell";
import ProtocolBadge from "../../components/protocol/ProtocolBadge";
import LiveTrustCode from "../../components/trust/LiveTrustCode";
import ProofOriginSeal from "../../components/trust/ProofOriginSeal";
import QrPlaceholder from "../../components/trust/QrPlaceholder";
import TrustDNAV0 from "../../components/trust/TrustDNAV0";
import TrustPricingTeaser from "../../components/trust/TrustPricingTeaser";
import {
  EXPIRATION_OPTIONS,
  formatCardDate,
  formatTrustTierLabel,
  IDENTITY_DISCLAIMER,
  resolveCardRotationSeconds,
  ROTATING_CODE_WINDOW_SECONDS,
} from "../lib/identityCardShared";
import {
  buildVerificationUrl,
  clearStoredIdentityCard,
  computeCardRotatingCode,
  getCardSecondsUntilNextCode,
  readStoredIdentityCard,
  writeStoredIdentityCard,
} from "../lib/identityCardClient";
import { preparePhotoForLocalStorage } from "../lib/identityCardPhoto";

const TRUST_PASS_DISCLAIMER =
  "This is a ProofOrigin Online Trust Pass, not a government ID.";

export default function IdentityCardPage() {
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [purpose, setPurpose] = useState("");
  const [expirationKey, setExpirationKey] = useState("2w");
  const [photoPreview, setPhotoPreview] = useState("");
  const [photoProcessing, setPhotoProcessing] = useState(false);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [card, setCard] = useState(null);
  const [rotatingCode, setRotatingCode] = useState("------");
  const [codeSecondsLeft, setCodeSecondsLeft] = useState(ROTATING_CODE_WINDOW_SECONDS);
  const [verifyCardId, setVerifyCardId] = useState("");

  const refreshRotatingCode = useCallback(async (activeCard) => {
    if (!activeCard?.card_id) return;
    const code = await computeCardRotatingCode(activeCard);
    setRotatingCode(code);
    setCodeSecondsLeft(getCardSecondsUntilNextCode(activeCard));
  }, []);

  useEffect(() => {
    const stored = readStoredIdentityCard();
    if (stored) setCard(stored);

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      setVerifyCardId(params.get("verify") || "");
    }
  }, []);

  useEffect(() => {
    if (!card) return undefined;

    refreshRotatingCode(card);
    const interval = window.setInterval(() => {
      refreshRotatingCode(card);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [card, refreshRotatingCode]);

  async function handlePhotoChange(event) {
    const file = event.target.files?.[0];

    if (!file) {
      setPhotoPreview("");
      return;
    }

    setPhotoProcessing(true);
    setError("");

    try {
      const dataUrl = await preparePhotoForLocalStorage(file);
      setPhotoPreview(dataUrl);
    } catch (err) {
      setPhotoPreview("");
      setError(err.message || "Could not use that photo.");
      event.target.value = "";
    } finally {
      setPhotoProcessing(false);
    }
  }

  async function handleCreateCard() {
    setError("");
    setWarning("");

    if (!displayName.trim()) {
      setError("Display name is required.");
      return;
    }

    if (!consent) {
      setError("Please confirm the online identity disclaimer.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/identity-card/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName.trim(),
          username: username.trim(),
          purpose: purpose.trim(),
          expiration_key: expirationKey,
          consent: true,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Could not create identity card.");
      }

      if (data.warning) setWarning(data.warning);

      const storedCard = {
        ...data.card,
        stored: Boolean(data.stored),
        ...(photoPreview ? { photo_preview: photoPreview } : {}),
      };
      writeStoredIdentityCard(storedCard);
      setCard(storedCard);
      setPhotoPreview("");
    } catch (err) {
      setError(err.message || "Could not create identity card.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevokeCard() {
    if (card?.card_id && (card.secret_seed || card.secret_token)) {
      try {
        await fetch("/api/identity-card/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            card_id: card.card_id,
            secret_seed: card.secret_seed || card.secret_token,
          }),
        });
      } catch {
        // Local revoke still proceeds if network fails.
      }
    }

    clearStoredIdentityCard();
    setCard(null);
    setRotatingCode("------");
    setDisplayName("");
    setUsername("");
    setPurpose("");
    setConsent(false);
    setPhotoPreview("");
  }

  const verificationUrl = card ? buildVerificationUrl(card.card_id) : "";
  const rotationWindow = card ? resolveCardRotationSeconds(card) : ROTATING_CODE_WINDOW_SECONDS;
  const trustTierLabel = card ? formatTrustTierLabel(card.trust_tier || "free") : "Free";

  return (
    <PageShell
      narrow
      badge="Premium Trust Credential • Holder"
      title="Forge your digital reputation."
      subtitle={`Trust is built through history, verification, and proof. ${TRUST_PASS_DISCLAIMER}`}
      className="trust-cred-page"
    >
      <p className="trust-cred-lead">
        {TRUST_PASS_DISCLAIMER} A temporary online pass for digital trust — not a legal
        identity document.
      </p>

      {verifyCardId && !card && (
        <div className="alert-banner alert-banner--warning" role="status">
          <strong>Verification link</strong>
          Open the public verifier at{" "}
          <a href={`/id/${encodeURIComponent(verifyCardId)}`} className="identity-card-verify__link">
            /id/{verifyCardId}
          </a>
        </div>
      )}

      {card ? (
        <>
          <article className="titanium-pass" aria-label="ProofOrigin Online Trust Pass">
            <div className="titanium-pass__sheen" aria-hidden="true" />
            <div className="titanium-pass__grain" aria-hidden="true" />

            <header className="titanium-pass__header">
              <div className="titanium-pass__brand-row">
                <ProofOriginSeal size={44} />
                <div>
                  <p className="titanium-pass__brand">ProofOrigin</p>
                  <h2 className="titanium-pass__title">Online Trust Pass</h2>
                </div>
              </div>
              <ProtocolBadge variant="success">Active</ProtocolBadge>
            </header>

            <div className="titanium-pass__body">
              <div className="titanium-pass__identity">
                {card.photo_preview && (
                  <div className="titanium-pass__photo-wrap">
                    <img
                      src={card.photo_preview}
                      alt=""
                      className="titanium-pass__photo"
                    />
                  </div>
                )}
                <dl className="identity-card-preview__fields titanium-pass__fields">
                  <div>
                    <dt>Display name</dt>
                    <dd>{card.display_name}</dd>
                  </div>
                  {card.username && (
                    <div>
                      <dt>Handle</dt>
                      <dd>@{card.username.replace(/^@/, "")}</dd>
                    </div>
                  )}
                  {card.purpose && (
                    <div>
                      <dt>Purpose</dt>
                      <dd>{card.purpose}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Card ID</dt>
                    <dd className="identity-card-inline-mono">{card.card_id}</dd>
                  </div>
                  <div>
                    <dt>Issued</dt>
                    <dd>{formatCardDate(card.issued_at)}</dd>
                  </div>
                  <div>
                    <dt>Expires</dt>
                    <dd>{formatCardDate(card.expires_at)}</dd>
                  </div>
                  <div>
                    <dt>Trust tier</dt>
                    <dd>{trustTierLabel}</dd>
                  </div>
                  <div>
                    <dt>Code refresh</dt>
                    <dd>{rotationWindow}s</dd>
                  </div>
                </dl>
              </div>

              <LiveTrustCode
                code={rotatingCode}
                secondsLeft={codeSecondsLeft}
                windowSeconds={rotationWindow}
                variant="holder"
              />

              <div className="titanium-pass__verify-row">
                <QrPlaceholder />
                <div className="identity-card-verify__copy">
                  <p className="identity-card-verify__label">Public verification link</p>
                  <a href={verificationUrl} className="identity-card-verify__link">
                    {verificationUrl}
                  </a>
                </div>
              </div>
            </div>

            <footer className="titanium-pass__footer">
              <p>{IDENTITY_DISCLAIMER}</p>
              {!card.stored && (
                <p className="identity-card-preview__hint">
                  Stored in this browser only. Clearing site data removes the card, rotating code
                  secret{card.photo_preview ? ", and photo" : ""}.
                </p>
              )}
              {card.photo_preview && (
                <p className="identity-card-preview__hint">
                  Photo is saved only in this browser and is not uploaded.
                </p>
              )}
              <div className="protocol-actions">
                <button type="button" className="secondary" onClick={handleRevokeCard}>
                  Revoke this pass
                </button>
              </div>
            </footer>
          </article>

          <TrustDNAV0
            issuedAt={card.issued_at}
            verificationCount={0}
            historyCount={1}
          />
        </>
      ) : (
        <>
          <GlassPanel title="Forge your pass" className="trust-forge-panel">
            <p className="trust-forge-panel__intro">
              Generate a rotating Live Trust Code and share a verification link. Optional photo
              stays in this browser only.
            </p>

            <label className="dataset-field">
              <span className="dataset-field__label">Display name</span>
              <input
                className="dataset-field__input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How you want to be recognized online"
                maxLength={80}
              />
            </label>

            <label className="dataset-field">
              <span className="dataset-field__label">Username / handle (optional)</span>
              <input
                className="dataset-field__input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="@yourhandle"
                maxLength={40}
              />
            </label>

            <label className="dataset-field">
              <span className="dataset-field__label">Purpose / note (optional)</span>
              <textarea
                className="dataset-field__textarea"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="Why you're issuing this temporary online pass"
                maxLength={240}
                rows={3}
              />
            </label>

            <label className="dataset-field">
              <span className="dataset-field__label">Expiration</span>
              <select
                className="dataset-field__input"
                value={expirationKey}
                onChange={(e) => setExpirationKey(e.target.value)}
              >
                {EXPIRATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="dataset-field">
              <span className="dataset-field__label">Photo (optional)</span>
              <input
                className="dataset-field__file"
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                disabled={photoProcessing}
              />
              <span className="dataset-field__hint">
                Photo is saved only in this browser and is not uploaded.
              </span>
            </label>

            {photoProcessing && (
              <p className="dataset-field__hint">Compressing photo…</p>
            )}

            {photoPreview && (
              <div className="identity-card-photo-preview trust-photo-preview">
                <img src={photoPreview} alt="Card photo preview" />
              </div>
            )}

            <label className="identity-card-consent">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                {TRUST_PASS_DISCLAIMER} I understand this is for online trust only.
              </span>
            </label>

            <div className="protocol-actions">
              <button
                type="button"
                className="primary trust-forge-panel__cta"
                onClick={handleCreateCard}
                disabled={submitting || photoProcessing}
              >
                {submitting ? "Forging pass…" : "Forge Trust Pass"}
              </button>
            </div>
          </GlassPanel>

          <GlassPanel title="How trust works">
            <ul className="identity-card-notices trust-manifesto">
              <li>
                Live Trust Code rotates on your plan&apos;s refresh window — Free 60s, Plus 30s,
                Professional 20s, Business &amp; Enterprise 10s.
              </li>
              <li>Trust History records created and verified events on ProofOrigin servers.</li>
              <li>Optional photo stays in this browser only and is never uploaded.</li>
              <li>No SSN, driver license, date of birth, or legal ID verification.</li>
              <li>Trust is built through history, verification, and proof.</li>
            </ul>
          </GlassPanel>
        </>
      )}

      {warning && (
        <div className="alert-banner alert-banner--warning" role="status">
          <strong>Notice</strong>
          {warning}
        </div>
      )}

      {error && (
        <div className="alert-banner alert-banner--error" role="alert">
          <strong>Unable to continue</strong>
          {error}
        </div>
      )}

      <TrustPricingTeaser />
    </PageShell>
  );
}

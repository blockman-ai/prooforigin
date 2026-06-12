"use client";

import { useCallback, useEffect, useState } from "react";
import GlassPanel from "../../components/protocol/GlassPanel";
import PageShell from "../../components/protocol/PageShell";
import ProtocolBadge from "../../components/protocol/ProtocolBadge";
import {
  EXPIRATION_OPTIONS,
  formatCardDate,
  IDENTITY_DISCLAIMER,
  ROTATING_CODE_WINDOW_SECONDS,
} from "../lib/identityCardShared";
import {
  buildVerificationUrl,
  clearStoredIdentityCard,
  computeCardRotatingCode,
  readStoredIdentityCard,
  secondsUntilNextCode,
  writeStoredIdentityCard,
} from "../lib/identityCardClient";
import { preparePhotoForLocalStorage } from "../lib/identityCardPhoto";

function QrPlaceholder() {
  const cells = Array.from({ length: 64 }, (_, index) => {
    const row = Math.floor(index / 8);
    const col = index % 8;
    const filled =
      (row < 3 && col < 3) ||
      (row < 3 && col > 4) ||
      (row > 4 && col < 3) ||
      (index % 5 === 0 || index % 7 === 2);
    return filled;
  });

  return (
    <div className="identity-qr" aria-hidden="true">
      {cells.map((filled, index) => (
        <span
          key={index}
          className={`identity-qr__cell ${filled ? "identity-qr__cell--on" : ""}`.trim()}
        />
      ))}
    </div>
  );
}

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
    setCodeSecondsLeft(secondsUntilNextCode());
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

  return (
    <PageShell
      narrow
      badge="Dynamic Trust State • Holder"
      title="ProofOrigin Online Trust Pass"
      subtitle="A temporary online identity pass for digital trust — not a government ID or legal identity document."
    >
      <GlassPanel title="What this is">
        <ul className="identity-card-notices">
          <li>Optional temporary pass you generate for online interactions.</li>
          <li>Includes a rotating verification code similar to authenticator apps.</li>
          <li>Optional photo stays in this browser only and is never uploaded.</li>
          <li>No SSN, driver license, date of birth, or legal ID verification.</li>
          <li>{IDENTITY_DISCLAIMER}</li>
        </ul>
      </GlassPanel>

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
        <article className="identity-card-preview" aria-label="ProofOrigin online identity card">
          <div className="identity-card-preview__glow" aria-hidden="true" />
          <header className="identity-card-preview__header">
            <div>
              <p className="identity-card-preview__brand">ProofOrigin</p>
              <h2 className="identity-card-preview__title">Online Identity Card</h2>
            </div>
            <ProtocolBadge variant="success">Active</ProtocolBadge>
          </header>

          <div className="identity-card-preview__body">
            {card.photo_preview && (
              <div className="identity-card-preview__photo-wrap">
                <img
                  src={card.photo_preview}
                  alt=""
                  className="identity-card-preview__photo"
                />
              </div>
            )}

            <dl className="identity-card-preview__fields">
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
            </dl>

            <div className="identity-card-code">
              <p className="identity-card-code__label">Rotating verification code</p>
              <p className="identity-card-code__value" aria-live="polite">
                {rotatingCode}
              </p>
              <p className="identity-card-code__timer">
                Refreshes in {codeSecondsLeft}s · changes every {ROTATING_CODE_WINDOW_SECONDS}s
              </p>
            </div>

            <div className="identity-card-verify">
              <QrPlaceholder />
              <div className="identity-card-verify__copy">
                <p className="identity-card-verify__label">Public verification link</p>
                <a href={verificationUrl} className="identity-card-verify__link">
                  {verificationUrl}
                </a>
              </div>
            </div>
          </div>

          <footer className="identity-card-preview__footer">
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
                Revoke this card
              </button>
            </div>
          </footer>
        </article>
      ) : (
        <GlassPanel title="Create an Online Identity Card">
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
            <div className="identity-card-photo-preview">
              <img src={photoPreview} alt="Card photo preview" />
            </div>
          )}

          <label className="identity-card-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>{IDENTITY_DISCLAIMER} I understand this is for online trust only.</span>
          </label>

          <div className="protocol-actions">
            <button
              type="button"
              className="primary"
              onClick={handleCreateCard}
              disabled={submitting || photoProcessing}
            >
              {submitting ? "Generating card…" : "Generate identity card"}
            </button>
          </div>
        </GlassPanel>
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
    </PageShell>
  );
}

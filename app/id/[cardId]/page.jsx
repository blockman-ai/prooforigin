"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import GlassPanel from "../../../components/protocol/GlassPanel";
import PageShell from "../../../components/protocol/PageShell";
import ProtocolBadge from "../../../components/protocol/ProtocolBadge";
import {
  formatCardDate,
  formatCardDateTime,
  IDENTITY_DISCLAIMER,
  formatTrustStateLabel,
  trustStateBadgeVariant,
} from "../../lib/identityCardShared";

function truncateHash(hash, head = 12, tail = 8) {
  if (!hash || hash.length <= head + tail + 3) return hash || "—";
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

function formatEventLabel(eventType) {
  if (!eventType) return "Event";
  return eventType.charAt(0).toUpperCase() + eventType.slice(1);
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
        }
      }
    } catch (err) {
      setError(err.message || "Verification failed.");
    } finally {
      setVerifying(false);
    }
  }

  const badgeVariant = card
    ? trustStateBadgeVariant(card.trust_state)
    : "pending";

  return (
    <PageShell
      narrow
      badge="Dynamic Trust State • Public Verify"
      title="Verify Online Trust Pass"
      subtitle="Confirm a live ProofOrigin trust code — not a government ID or legal identity document."
    >
      <GlassPanel title="Disclaimer">
        <p className="identity-card-notices" style={{ margin: 0, listStyle: "none" }}>
          {IDENTITY_DISCLAIMER} Ask the holder to show a live code that refreshes every 60
          seconds. A screenshot is not sufficient proof.
        </p>
      </GlassPanel>

      {loading && (
        <div className="alert-banner alert-banner--warning" role="status">
          Loading trust pass…
        </div>
      )}

      {error && (
        <div className="alert-banner alert-banner--error" role="alert">
          <strong>Unable to load</strong>
          {error}
        </div>
      )}

      {card && (
        <>
          <GlassPanel title="Trust Pass Status">
            <div className="dts-verify-summary">
              <ProtocolBadge variant={badgeVariant}>
                {formatTrustStateLabel(card.trust_state)}
              </ProtocolBadge>
              <dl className="identity-card-preview__fields">
                <div>
                  <dt>Card ID</dt>
                  <dd className="identity-card-inline-mono">{card.card_id}</dd>
                </div>
                <div>
                  <dt>Display name</dt>
                  <dd>{card.display_name}</dd>
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
                  <dt>Issue date</dt>
                  <dd>{formatCardDate(card.issued_at)}</dd>
                </div>
                <div>
                  <dt>Expiration date</dt>
                  <dd>{formatCardDate(card.expires_at)}</dd>
                </div>
                <div>
                  <dt>Verification status</dt>
                  <dd>{card.verification_status}</dd>
                </div>
                <div>
                  <dt>Trust state</dt>
                  <dd>{formatTrustStateLabel(card.trust_state)}</dd>
                </div>
                <div>
                  <dt>Latest state hash</dt>
                  <dd className="identity-card-inline-mono">
                    {truncateHash(card.latest_state_hash)}
                  </dd>
                </div>
              </dl>
            </div>
          </GlassPanel>

          <GlassPanel title="Verify Trust Code">
            <form className="dts-verify-form" onSubmit={handleVerifyCode}>
              <label className="dataset-field">
                <span className="dataset-field__label">6-digit trust code</span>
                <input
                  className="dataset-field__input dts-verify-form__code"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={trustCode}
                  onChange={(e) => setTrustCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  autoComplete="one-time-code"
                />
                <span className="dataset-field__hint">
                  Enter the live code from the holder&apos;s ProofOrigin trust pass.
                </span>
              </label>
              <div className="protocol-actions">
                <button type="submit" className="primary" disabled={verifying}>
                  {verifying ? "Verifying…" : "Verify"}
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
          </GlassPanel>

          <GlassPanel title="Trust History">
            {trustHistory.length === 0 ? (
              <p className="dts-history-empty">No trust events recorded yet.</p>
            ) : (
              <ul className="dts-history-list">
                {trustHistory.map((event) => (
                  <li key={event.id} className="dts-history-item">
                    <div className="dts-history-item__header">
                      <strong>{formatEventLabel(event.event_type)}</strong>
                      <ProtocolBadge variant={trustStateBadgeVariant(event.trust_state)}>
                        {formatTrustStateLabel(event.trust_state)}
                      </ProtocolBadge>
                    </div>
                    <p className="dts-history-item__time">
                      {formatCardDateTime(event.created_at)}
                    </p>
                    <p className="dts-history-item__hash identity-card-inline-mono">
                      {truncateHash(event.card_state_hash)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </GlassPanel>
        </>
      )}

      <div className="protocol-actions">
        <Link href="/identity-card" className="secondary">
          Create your own trust pass
        </Link>
      </div>
    </PageShell>
  );
}

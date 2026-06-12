"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import PageShell from "../../components/protocol/PageShell";
import ProofOriginSeal from "../../components/trust/ProofOriginSeal";
import {
  hasVaultPinConfigured,
  isValidPinFormat,
  setupVaultPin,
  verifyVaultPin,
  VAULT_PIN_MIN_LENGTH,
} from "../lib/vaultPin";
import {
  formatLastUnlockTime,
  VAULT_INACTIVITY_MS,
  VAULT_STATES,
  VAULT_VANISH_MESSAGE,
} from "../lib/vaultSession";

const VAULT_SECTIONS = [
  { title: "Identity Assets", detail: "Online Trust Passes and identity proofs" },
  { title: "Trust Assets", detail: "Trust history and verification records" },
  { title: "Secure Documents", detail: "Encrypted personal document vault" },
  { title: "Bitcoin Anchors", detail: "Future proof-of-existence anchors" },
];

export default function VaultPage() {
  const [vaultState, setVaultState] = useState(VAULT_STATES.LOCKED);
  const [showUnlockPanel, setShowUnlockPanel] = useState(false);
  const [showLearnMore, setShowLearnMore] = useState(false);
  const [pinConfigured, setPinConfigured] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [confirmPinInput, setConfirmPinInput] = useState("");
  const [isSetupMode, setIsSetupMode] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastUnlockTime, setLastUnlockTime] = useState(null);
  const [vanishNotice, setVanishNotice] = useState("");

  const inactivityTimerRef = useRef(null);
  const vanishNoticeTimerRef = useRef(null);

  const triggerVanish = useCallback((reason = "manual") => {
    setVaultState(VAULT_STATES.VANISH);
    setShowUnlockPanel(false);
    setPinInput("");
    setConfirmPinInput("");
    setIsSetupMode(false);
    setError("");
    setLastUnlockTime(null);

    if (inactivityTimerRef.current) {
      window.clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }

    setVanishNotice(VAULT_VANISH_MESSAGE);

    if (vanishNoticeTimerRef.current) {
      window.clearTimeout(vanishNoticeTimerRef.current);
    }

    vanishNoticeTimerRef.current = window.setTimeout(() => {
      setVaultState(VAULT_STATES.LOCKED);
      setVanishNotice("");
    }, reason === "manual" ? 900 : 1200);
  }, []);

  const resetInactivityTimer = useCallback(() => {
    if (vaultState !== VAULT_STATES.UNLOCKED) return;

    if (inactivityTimerRef.current) {
      window.clearTimeout(inactivityTimerRef.current);
    }

    inactivityTimerRef.current = window.setTimeout(() => {
      triggerVanish("inactivity");
    }, VAULT_INACTIVITY_MS);
  }, [vaultState, triggerVanish]);

  useEffect(() => {
    setPinConfigured(hasVaultPinConfigured());
  }, []);

  useEffect(() => {
    if (vaultState !== VAULT_STATES.UNLOCKED) return undefined;

    resetInactivityTimer();

    const activityEvents = ["mousemove", "mousedown", "keydown", "touchstart", "click", "scroll"];
    const onActivity = () => resetInactivityTimer();
    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, onActivity, { passive: true });
    });

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        triggerVanish("hidden");
      }
    };

    const onWindowBlur = () => {
      triggerVanish("blur");
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onWindowBlur);

    return () => {
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, onActivity);
      });
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onWindowBlur);
      if (inactivityTimerRef.current) {
        window.clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [vaultState, resetInactivityTimer, triggerVanish]);

  useEffect(() => {
    return () => {
      if (vanishNoticeTimerRef.current) {
        window.clearTimeout(vanishNoticeTimerRef.current);
      }
    };
  }, []);

  function openUnlockPanel() {
    setError("");
    setPinInput("");
    setConfirmPinInput("");
    setIsSetupMode(!hasVaultPinConfigured());
    setShowUnlockPanel(true);
  }

  async function handlePinSubmit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);

    try {
      if (isSetupMode) {
        if (!isValidPinFormat(pinInput)) {
          throw new Error(`PIN must be at least ${VAULT_PIN_MIN_LENGTH} digits.`);
        }
        if (pinInput !== confirmPinInput) {
          throw new Error("PIN confirmation does not match.");
        }
        await setupVaultPin(pinInput);
        setPinConfigured(true);
      } else {
        const valid = await verifyVaultPin(pinInput);
        if (!valid) {
          throw new Error("Incorrect PIN. Try again.");
        }
      }

      setShowUnlockPanel(false);
      setPinInput("");
      setConfirmPinInput("");
      setVaultState(VAULT_STATES.UNLOCKED);
      setLastUnlockTime(new Date());
      setVanishNotice("");
    } catch (err) {
      setError(err.message || "Could not unlock vault.");
    } finally {
      setBusy(false);
    }
  }

  const isLocked = vaultState === VAULT_STATES.LOCKED;
  const isVanish = vaultState === VAULT_STATES.VANISH;
  const isUnlocked = vaultState === VAULT_STATES.UNLOCKED;
  const showProtectedOverlay = isVanish || (isLocked && Boolean(vanishNotice));

  return (
    <PageShell
      narrow
      badge="Private Vault • V0.1"
      title="ProofOrigin Private Vault"
      subtitle="Your encrypted trust assets."
      className="vault-page trust-cred-page"
    >
      <div
        className={`vault-shell ${isUnlocked ? "vault-shell--unlocked" : "vault-shell--locked"} ${showProtectedOverlay ? "vault-shell--vanish" : ""}`.trim()}
      >
        <div className="vault-shell__sheen" aria-hidden="true" />
        <div className="vault-shell__grain" aria-hidden="true" />

        <header className="vault-shell__header">
          <div className="vault-shell__brand-row">
            <ProofOriginSeal size={48} />
            <div>
              <p className="vault-shell__eyebrow">ProofOrigin Private Vault</p>
              <h2 className="vault-shell__title">Luxury trust custody</h2>
            </div>
          </div>
          <span
            className={`vault-status-pill vault-status-pill--${isUnlocked ? "unlocked" : "locked"}`.trim()}
          >
            {isUnlocked ? "Unlocked" : isVanish ? "Vanish" : "Locked"}
          </span>
        </header>

        {showProtectedOverlay && (
          <div className="vault-vanish-overlay" role="status" aria-live="polite">
            <p className="vault-vanish-overlay__message">{vanishNotice || VAULT_VANISH_MESSAGE}</p>
          </div>
        )}

        <div className={`vault-shell__body ${showProtectedOverlay ? "vault-shell__body--blurred" : ""}`.trim()}>
          {isUnlocked ? (
            <>
              <section className="vault-status-card" aria-label="Vault status">
                <h3 className="vault-status-card__title">Vault Status</h3>
                <dl className="vault-status-card__grid">
                  <div>
                    <dt>Protection</dt>
                    <dd>Protected</dd>
                  </div>
                  <div>
                    <dt>State</dt>
                    <dd>Unlocked</dd>
                  </div>
                  <div>
                    <dt>Last unlock</dt>
                    <dd>{formatLastUnlockTime(lastUnlockTime)}</dd>
                  </div>
                  <div>
                    <dt>Auto-lock</dt>
                    <dd>30s inactivity · blur on focus loss</dd>
                  </div>
                </dl>
                <div className="protocol-actions vault-status-card__actions">
                  <button type="button" className="secondary" onClick={() => triggerVanish("manual")}>
                    Lock Now
                  </button>
                </div>
              </section>

              <div className="vault-sections">
                {VAULT_SECTIONS.map((section) => (
                  <article key={section.title} className="vault-section-card">
                    <p className="vault-section-card__eyebrow">Coming Soon</p>
                    <h3 className="vault-section-card__title">{section.title}</h3>
                    <p className="vault-section-card__detail">{section.detail}</p>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <section className="vault-locked-panel">
              <p className="vault-locked-panel__lead">
                Your vault opens locked by default. Unlock with a PIN to enter the premium custody
                shell. Document storage arrives in a later phase.
              </p>
              <div className="protocol-actions vault-locked-panel__actions">
                <button type="button" className="primary" onClick={openUnlockPanel}>
                  Unlock Vault
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setShowLearnMore((value) => !value)}
                >
                  Learn More
                </button>
              </div>
              {showLearnMore && (
                <ul className="vault-learn-more">
                  <li>View-only encrypted document storage is planned — not available in V0.1.</li>
                  <li>PIN is stored as a hash only. Plaintext PIN is never saved.</li>
                  <li>Vanish Mode locks the vault after 30 seconds idle or when you leave the tab.</li>
                  <li>This is private personal storage — not legal ID verification.</li>
                </ul>
              )}
            </section>
          )}
        </div>
      </div>

      {showUnlockPanel && (
        <div className="vault-modal-backdrop" role="presentation" onClick={() => setShowUnlockPanel(false)}>
          <div
            className="vault-modal"
            role="dialog"
            aria-labelledby="vault-unlock-title"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="vault-modal__header">
              <ProofOriginSeal size={36} />
              <div>
                <h3 id="vault-unlock-title" className="vault-modal__title">
                  {isSetupMode ? "Create Vault PIN" : "Unlock Vault"}
                </h3>
                <p className="vault-modal__subtitle">
                  {isSetupMode
                    ? `Choose a ${VAULT_PIN_MIN_LENGTH}-digit PIN or longer.`
                    : "Enter your vault PIN to continue."}
                </p>
              </div>
            </header>

            <form className="vault-modal__form" onSubmit={handlePinSubmit}>
              <label className="dataset-field">
                <span className="dataset-field__label">Vault PIN</span>
                <input
                  className="dataset-field__input vault-pin-input"
                  type="password"
                  inputMode="numeric"
                  autoComplete={isSetupMode ? "new-password" : "current-password"}
                  maxLength={12}
                  value={pinInput}
                  onChange={(event) => setPinInput(event.target.value.replace(/\D/g, "").slice(0, 12))}
                  placeholder="••••••"
                />
              </label>

              {isSetupMode && (
                <label className="dataset-field">
                  <span className="dataset-field__label">Confirm PIN</span>
                  <input
                    className="dataset-field__input vault-pin-input"
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    maxLength={12}
                    value={confirmPinInput}
                    onChange={(event) =>
                      setConfirmPinInput(event.target.value.replace(/\D/g, "").slice(0, 12))
                    }
                    placeholder="••••••"
                  />
                </label>
              )}

              <button type="button" className="secondary vault-passkey-placeholder" disabled>
                Unlock with Passkey
                <span className="vault-passkey-placeholder__hint">Coming in a future release</span>
              </button>

              {error && (
                <div className="alert-banner alert-banner--error" role="alert">
                  <strong>Unable to unlock</strong>
                  {error}
                </div>
              )}

              <div className="protocol-actions">
                <button type="submit" className="primary" disabled={busy}>
                  {busy ? "Working…" : isSetupMode ? "Save PIN & Unlock" : "Unlock Vault"}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setShowUnlockPanel(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageShell>
  );
}

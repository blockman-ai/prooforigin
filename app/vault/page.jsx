"use client";



import { useCallback, useEffect, useRef, useState } from "react";

import PageShell from "../../components/protocol/PageShell";

import ProofOriginSeal from "../../components/trust/ProofOriginSeal";

import VaultSecureDocuments from "../../components/vault/VaultSecureDocuments";

import VaultUploadModal from "../../components/vault/VaultUploadModal";

import {

  ensureVaultGenesis,

  formatGenesisHashPreview,

  formatVaultCreatedAt,

  formatVaultIdDisplay,

  VAULT_IDENTITY_STATES,

} from "../lib/vaultGenesis";
import { deriveVaultMasterKey } from "../lib/vaultCrypto";
import {
  getVaultPinSalt,
  hasVaultPinConfigured,
  isValidPinFormat,
  setupVaultPin,
  verifyVaultPinAndDeriveMasterKey,
  VAULT_PIN_MIN_LENGTH,
} from "../lib/vaultPin";

import {

  fetchVaultDocumentMetadata,

  uploadEncryptedVaultDocument,

} from "../lib/vaultDocumentClient";

import {

  ensureVaultDevice,

  isVaultDeviceRegisteredLocally,

  registerVaultDeviceWithServer,

} from "../lib/vaultDevice";

import {

  clearVaultSessionSecrets,

  formatLastUnlockTime,

  getVaultSessionMasterKey,

  setVaultSessionMasterKey,

  VAULT_INACTIVITY_MS,

  VAULT_STATES,

  VAULT_VANISH_MESSAGE,

} from "../lib/vaultSession";



const VAULT_SECTIONS = [

  { title: "Identity Assets", detail: "Online Trust Passes and identity proofs" },

  { title: "Trust Assets", detail: "Trust history and verification records" },

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

  const [genesis, setGenesis] = useState(null);

  const [vaultDocument, setVaultDocument] = useState(null);

  const [documentLoading, setDocumentLoading] = useState(false);

  const [documentError, setDocumentError] = useState("");

  const [displayLabel, setDisplayLabel] = useState(null);

  const [showUploadModal, setShowUploadModal] = useState(false);

  const [uploadBusy, setUploadBusy] = useState(false);

  const [uploadError, setUploadError] = useState("");



  const inactivityTimerRef = useRef(null);

  const vanishNoticeTimerRef = useRef(null);



  const clearUploadState = useCallback(() => {

    setShowUploadModal(false);

    setUploadBusy(false);

    setUploadError("");

    setVaultDocument(null);

    setDocumentLoading(false);

    setDocumentError("");

    setDisplayLabel(null);

  }, []);



  const triggerVanish = useCallback(

    (reason = "manual") => {

      setVaultState(VAULT_STATES.VANISH);

      setShowUnlockPanel(false);

      setPinInput("");

      setConfirmPinInput("");

      setIsSetupMode(false);

      setError("");

      setLastUnlockTime(null);

      setGenesis(null);

      clearVaultSessionSecrets();

      clearUploadState();



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

    },

    [clearUploadState]

  );



  const bootstrapUnlockedSession = useCallback(async () => {

    setDocumentLoading(true);

    setDocumentError("");



    try {

      ensureVaultDevice();



      if (!isVaultDeviceRegisteredLocally()) {

        await registerVaultDeviceWithServer();

      }



      const result = await fetchVaultDocumentMetadata();

      if (!result.ok) {

        throw new Error(result.data?.error || "Unable to load vault document metadata.");

      }



      setVaultDocument(result.data.document || null);

      setDisplayLabel(null);

    } catch (err) {

      setVaultDocument(null);

      setDocumentError(err.message || "Unable to load vault document metadata.");

    } finally {

      setDocumentLoading(false);

    }

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

      let masterKey = null;



      if (isSetupMode) {

        if (!isValidPinFormat(pinInput)) {

          throw new Error(`PIN must be at least ${VAULT_PIN_MIN_LENGTH} digits.`);

        }

        if (pinInput !== confirmPinInput) {

          throw new Error("PIN confirmation does not match.");

        }

        await setupVaultPin(pinInput);

        setPinConfigured(true);

        const salt = getVaultPinSalt();

        masterKey = await deriveVaultMasterKey(pinInput, salt);

      } else {

        masterKey = await verifyVaultPinAndDeriveMasterKey(pinInput);

        if (!masterKey) {

          throw new Error("Incorrect PIN. Try again.");

        }

      }



      setVaultSessionMasterKey(masterKey);



      const genesisRecord = await ensureVaultGenesis();

      setGenesis(genesisRecord);



      setShowUnlockPanel(false);

      setPinInput("");

      setConfirmPinInput("");

      setVaultState(VAULT_STATES.UNLOCKED);

      setLastUnlockTime(new Date());

      setVanishNotice("");



      await bootstrapUnlockedSession();

    } catch (err) {

      clearVaultSessionSecrets();

      setError(err.message || "Could not unlock vault.");

    } finally {

      setBusy(false);

    }

  }



  async function handleUploadSubmit({ file, label }) {

    setUploadBusy(true);

    setUploadError("");



    try {

      const masterKey = getVaultSessionMasterKey();

      if (!masterKey) {

        throw new Error("Vault session expired. Unlock again to upload.");

      }



      const result = await uploadEncryptedVaultDocument({

        file,

        label,

        masterKey,

      });



      setVaultDocument(result.document);

      setDisplayLabel(result.displayLabel);

      setShowUploadModal(false);

    } catch (err) {

      setUploadError(err.message || "Unable to upload encrypted document.");

      throw err;

    } finally {

      setUploadBusy(false);

    }

  }



  const isLocked = vaultState === VAULT_STATES.LOCKED;

  const isVanish = vaultState === VAULT_STATES.VANISH;

  const isUnlocked = vaultState === VAULT_STATES.UNLOCKED;

  const showProtectedOverlay = isVanish || (isLocked && Boolean(vanishNotice));

  const isSealed = genesis?.vault_state === VAULT_IDENTITY_STATES.SEALED;

  const hasDocument = Boolean(vaultDocument);



  return (

    <PageShell

      narrow

      badge="Private Vault • V0.2"

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

            className={`vault-status-pill vault-status-pill--${

              isUnlocked && isSealed ? "sealed" : isUnlocked ? "unlocked" : "locked"

            }`.trim()}

          >

            {isUnlocked && isSealed

              ? "Sealed"

              : isUnlocked

                ? "Unlocked"

                : isVanish

                  ? "Vanish"

                  : "Locked"}

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

              <section className="vault-genesis-card" aria-label="Vault Genesis">

                <div className="vault-genesis-card__header">

                  <h3 className="vault-genesis-card__title">Vault Genesis</h3>

                  <span className="vault-genesis-card__status">Sealed</span>

                </div>

                <p className="vault-genesis-card__lead">

                  Your vault has been sealed. Future encrypted documents will build from this

                  genesis proof.

                </p>

                <dl className="vault-genesis-card__grid">

                  <div>

                    <dt>Vault status</dt>

                    <dd className="vault-genesis-card__value--emphasis">Sealed</dd>

                  </div>

                  <div>

                    <dt>Vault ID</dt>

                    <dd className="vault-genesis-card__mono">{formatVaultIdDisplay(genesis?.vault_id)}</dd>

                  </div>

                  <div>

                    <dt>Created</dt>

                    <dd>{formatVaultCreatedAt(genesis?.vault_created_at)}</dd>

                  </div>

                  <div>

                    <dt>Genesis hash</dt>

                    <dd className="vault-genesis-card__mono" title={genesis?.vault_genesis_hash || undefined}>

                      {formatGenesisHashPreview(genesis?.vault_genesis_hash)}

                    </dd>

                  </div>

                  <div>

                    <dt>Last unlock</dt>

                    <dd>{formatLastUnlockTime(lastUnlockTime)}</dd>

                  </div>

                  <div>

                    <dt>Documents</dt>

                    <dd>{hasDocument ? "1 protected" : "None yet"}</dd>

                  </div>

                </dl>

                <div className="protocol-actions vault-genesis-card__actions">

                  <button type="button" className="secondary" onClick={() => triggerVanish("manual")}>

                    Lock Now

                  </button>

                </div>

              </section>



              <VaultSecureDocuments

                document={vaultDocument}

                displayLabel={displayLabel}

                loading={documentLoading}

                error={documentError}

                onAddDocument={() => {

                  setUploadError("");

                  setShowUploadModal(true);

                }}

              />



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

                shell and store one encrypted document.

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

                  <li>One encrypted document slot — encrypted on your device before upload.</li>

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



      <VaultUploadModal

        open={showUploadModal && isUnlocked}

        busy={uploadBusy}

        error={uploadError}

        onClose={() => {

          if (!uploadBusy) {

            setShowUploadModal(false);

            setUploadError("");

          }

        }}

        onSubmit={handleUploadSubmit}

      />

    </PageShell>

  );

}



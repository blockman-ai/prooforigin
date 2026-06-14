"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import GlassPanel from "../protocol/GlassPanel";
import {
  completeRecoveryImport,
  VaultRecoveryImportError,
} from "../../app/lib/vaultRecoveryImport.js";
import { readVaultGenesis } from "../../app/lib/vaultGenesis.js";
import { isVaultBootstrapPending, isVaultRestoreBootstrapChosen } from "../../app/lib/vaultBootstrap.js";
import { isValidPinFormat, VAULT_PIN_MIN_LENGTH } from "../../app/lib/vaultPin.js";
import {
  formatVaultRecoveryImportError,
  getNextWizardStep,
  getPreviousWizardStep,
  getWizardStepIndex,
  RECOVERY_WIZARD_STEP_ORDER,
  RECOVERY_WIZARD_STEPS,
  validateRecoveryKitUpload,
  validateRecoveryPhraseStep,
  verifyRecoveryPhraseForWizard,
} from "../../app/lib/vaultRecoveryImportWizard.js";

const STEP_LABELS = {
  [RECOVERY_WIZARD_STEPS.KIT]: "Recovery Kit",
  [RECOVERY_WIZARD_STEPS.PHRASE]: "Recovery Phrase",
  [RECOVERY_WIZARD_STEPS.PIN]: "New PIN",
  [RECOVERY_WIZARD_STEPS.COMPLETE]: "Complete",
};

function RecoveryImportSecurityNotice() {
  return (
    <GlassPanel className="vault-restore-wizard__security" title="Security notice">
      <p className="vault-restore-wizard__security-lead">
        ProofOrigin will never ask for:
      </p>
      <ul className="vault-restore-wizard__security-list">
        <li>PIN</li>
        <li>Recovery Phrase</li>
        <li>Recovery Kit contents</li>
      </ul>
      <p className="vault-restore-wizard__security-copy">
        Enter these only in this restore wizard on your device. Support cannot recover them for you.
      </p>
    </GlassPanel>
  );
}

function WizardStepIndicator({ currentStep }) {
  const currentIndex = getWizardStepIndex(currentStep);

  return (
    <ol className="vault-restore-wizard__steps" aria-label="Restore progress">
      {RECOVERY_WIZARD_STEP_ORDER.map((step, index) => {
        const isComplete = currentIndex > index;
        const isCurrent = currentIndex === index;

        return (
          <li
            key={step}
            className={`vault-restore-wizard__step${
              isCurrent ? " vault-restore-wizard__step--current" : ""
            }${isComplete ? " vault-restore-wizard__step--complete" : ""}`.trim()}
            aria-current={isCurrent ? "step" : undefined}
          >
            <span className="vault-restore-wizard__step-index">{index + 1}</span>
            <span className="vault-restore-wizard__step-label">{STEP_LABELS[step]}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function RecoveryImportWizard() {
  const [step, setStep] = useState(RECOVERY_WIZARD_STEPS.KIT);
  const [recoveryKit, setRecoveryKit] = useState(null);
  const [kitFileName, setKitFileName] = useState("");
  const [recoveryPhrase, setRecoveryPhrase] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [importResult, setImportResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");

  const vaultAlreadyExists = useMemo(() => Boolean(readVaultGenesis()), []);
  const restoreBootstrapReady = useMemo(
    () => isVaultBootstrapPending() && isVaultRestoreBootstrapChosen(),
    []
  );

  function clearError() {
    setError("");
    setErrorCode("");
  }

  function handleImportError(importError) {
    setError(formatVaultRecoveryImportError(importError));
    setErrorCode(importError instanceof VaultRecoveryImportError ? importError.code : "UNKNOWN");
  }

  async function handleKitFileChange(event) {
    clearError();
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setBusy(true);

    try {
      const text = await file.text();
      const parsed = validateRecoveryKitUpload(text);
      setRecoveryKit(parsed.kit);
      setKitFileName(file.name);
      setRecoveryPhrase("");
      setPin("");
      setConfirmPin("");
      setImportResult(null);
    } catch (importError) {
      setRecoveryKit(null);
      setKitFileName("");
      handleImportError(importError);
    } finally {
      setBusy(false);
    }
  }

  function handleContinueFromKit() {
    clearError();

    try {
      if (!recoveryKit) {
        throw new VaultRecoveryImportError(
          "Upload a recovery kit JSON file to continue.",
          "KIT_REQUIRED"
        );
      }

      validateRecoveryKitUpload(recoveryKit);
      setStep(getNextWizardStep(RECOVERY_WIZARD_STEPS.KIT));
    } catch (importError) {
      handleImportError(importError);
    }
  }

  async function handleContinueFromPhrase(event) {
    event.preventDefault();
    clearError();
    setBusy(true);

    try {
      if (!recoveryKit) {
        throw new VaultRecoveryImportError(
          "Recovery kit file is required. Phrase alone is not enough.",
          "KIT_REQUIRED"
        );
      }

      validateRecoveryPhraseStep({ recoveryPhrase, recoveryKit });
      await verifyRecoveryPhraseForWizard({ recoveryPhrase, recoveryKit });
      setStep(getNextWizardStep(RECOVERY_WIZARD_STEPS.PHRASE));
    } catch (importError) {
      handleImportError(importError);
    } finally {
      setBusy(false);
    }
  }

  async function handleRestoreSubmit(event) {
    event.preventDefault();
    clearError();
    setBusy(true);

    try {
      if (!recoveryKit) {
        throw new VaultRecoveryImportError(
          "Recovery kit file is required. Phrase alone is not enough.",
          "KIT_REQUIRED"
        );
      }

      if (!isValidPinFormat(pin)) {
        throw new VaultRecoveryImportError(
          `PIN must be at least ${VAULT_PIN_MIN_LENGTH} digits.`,
          "PIN_INVALID"
        );
      }

      const result = await completeRecoveryImport({
        recoveryPhrase,
        recoveryKit,
        pin,
        confirmPin,
      });

      setImportResult(result);
      setPin("");
      setConfirmPin("");
      setRecoveryPhrase("");
      setStep(RECOVERY_WIZARD_STEPS.COMPLETE);
    } catch (importError) {
      handleImportError(importError);
    } finally {
      setBusy(false);
    }
  }

  function handleBack() {
    clearError();
    const previous = getPreviousWizardStep(step);
    if (previous) {
      setStep(previous);
    }
  }

  if (vaultAlreadyExists) {
    return (
      <section className="vault-restore-wizard vault-restore-wizard--blocked" aria-live="polite">
        <GlassPanel title="Vault already on this device">
          <p className="vault-restore-wizard__lead">
            This browser profile already has vault identity storage. Recovery import is for fresh
            restore targets only.
          </p>
          <div className="protocol-actions vault-restore-wizard__actions">
            <Link href="/vault" className="primary">
              Open Vault
            </Link>
          </div>
        </GlassPanel>
      </section>
    );
  }

  return (
    <section className="vault-restore-wizard" aria-label="Recovery import wizard">
      <RecoveryImportSecurityNotice />

      {!restoreBootstrapReady && (
        <p className="vault-restore-wizard__hint">
          For the safest path, choose <strong>Restore From Recovery Kit</strong> on the{" "}
          <Link href="/vault">vault page</Link> first.
        </p>
      )}

      <WizardStepIndicator currentStep={step} />

      {error && (
        <p className="vault-restore-wizard__error" role="alert" data-error-code={errorCode || undefined}>
          {error}
        </p>
      )}

      {step === RECOVERY_WIZARD_STEPS.KIT && (
        <GlassPanel title="Step 1: Recovery Kit upload">
          <p className="vault-restore-wizard__lead">
            Upload the JSON recovery kit you saved when you exported from your vault. Phrase alone
            is not enough.
          </p>
          <label className="vault-restore-wizard__file-label">
            <span className="vault-restore-wizard__file-label-text">Recovery kit file (.json)</span>
            <input
              type="file"
              accept="application/json,.json"
              className="vault-restore-wizard__file-input"
              disabled={busy}
              onChange={handleKitFileChange}
            />
          </label>
          {kitFileName && (
            <p className="vault-restore-wizard__file-meta">
              Loaded: <strong>{kitFileName}</strong>
              {recoveryKit?.vault_id ? (
                <>
                  {" "}
                  · Vault ID <code>{recoveryKit.vault_id}</code>
                </>
              ) : null}
            </p>
          )}
          <div className="protocol-actions vault-restore-wizard__actions">
            <button
              type="button"
              className="primary"
              disabled={busy || !recoveryKit}
              onClick={handleContinueFromKit}
            >
              Continue
            </button>
            <Link href="/vault" className="secondary">
              Back to Vault
            </Link>
          </div>
        </GlassPanel>
      )}

      {step === RECOVERY_WIZARD_STEPS.PHRASE && (
        <GlassPanel title="Step 2: Recovery phrase entry">
          <p className="vault-restore-wizard__lead">
            Enter the 12-word recovery phrase that was shown when this kit was created. Kit alone
            is not enough.
          </p>
          <form className="vault-restore-wizard__form" onSubmit={handleContinueFromPhrase}>
            <label className="vault-restore-wizard__field">
              <span>Recovery phrase</span>
              <textarea
                className="vault-restore-wizard__textarea"
                value={recoveryPhrase}
                onChange={(event) => setRecoveryPhrase(event.target.value)}
                rows={3}
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
                placeholder="twelve words separated by spaces"
              />
            </label>
            <div className="protocol-actions vault-restore-wizard__actions">
              <button type="submit" className="primary" disabled={busy}>
                {busy ? "Verifying…" : "Continue"}
              </button>
              <button type="button" className="secondary" disabled={busy} onClick={handleBack}>
                Back
              </button>
            </div>
          </form>
        </GlassPanel>
      )}

      {step === RECOVERY_WIZARD_STEPS.PIN && (
        <GlassPanel title="Step 3: New PIN">
          <p className="vault-restore-wizard__lead">
            Choose a new vault PIN for this device. It wraps your recovered master vault key
            locally.
          </p>
          <form className="vault-restore-wizard__form" onSubmit={handleRestoreSubmit}>
            <label className="vault-restore-wizard__field">
              <span>New PIN</span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                className="vault-restore-wizard__input"
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                disabled={busy}
              />
            </label>
            <label className="vault-restore-wizard__field">
              <span>Confirm PIN</span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                className="vault-restore-wizard__input"
                value={confirmPin}
                onChange={(event) => setConfirmPin(event.target.value)}
                disabled={busy}
              />
            </label>
            <div className="protocol-actions vault-restore-wizard__actions">
              <button type="submit" className="primary" disabled={busy}>
                {busy ? "Restoring…" : "Restore Vault"}
              </button>
              <button type="button" className="secondary" disabled={busy} onClick={handleBack}>
                Back
              </button>
            </div>
          </form>
        </GlassPanel>
      )}

      {step === RECOVERY_WIZARD_STEPS.COMPLETE && importResult && (
        <GlassPanel title="Step 4: Restore complete">
          <p className="vault-restore-wizard__success-title">Vault identity restored.</p>
          <p className="vault-restore-wizard__lead">
            Documents from your previous device are not available on this device yet.
          </p>
          <p className="vault-restore-wizard__lead">
            Cross-device document migration is a future phase.
          </p>
          <p className="vault-restore-wizard__file-meta">
            Restored vault ID: <code>{importResult.vault_id}</code>
          </p>
          <div className="protocol-actions vault-restore-wizard__actions">
            <Link href="/vault" className="primary">
              Open Vault
            </Link>
          </div>
        </GlassPanel>
      )}
    </section>
  );
}

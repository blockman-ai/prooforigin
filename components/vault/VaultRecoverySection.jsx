"use client";

import { useMemo, useState } from "react";
import { readVaultGenesis } from "../../app/lib/vaultGenesis.js";
import { isVaultUsingMasterVaultKey } from "../../app/lib/vaultKeyRingStorage.js";
import {
  buildRecoveryKitDownloadFilename,
  exportRecoveryKit,
  generateRecoveryPhrase,
  serializeRecoveryKit,
} from "../../app/lib/vaultRecovery.js";
import {
  isVaultRecoveryKitConfigured,
  markVaultRecoveryKitConfirmed,
  VAULT_RECOVERY_NOT_CONFIGURED_WARNING,
} from "../../app/lib/vaultRecoveryStatus.js";
import { getVaultSessionUnlockKeys } from "../../app/lib/vaultSession.js";

export default function VaultRecoverySection({ onRecoveryConfirmed }) {
  const [recoveryPhrase, setRecoveryPhrase] = useState("");
  const [recoveryKit, setRecoveryKit] = useState(null);
  const [savedConfirmed, setSavedConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const mvkVault = isVaultUsingMasterVaultKey();
  const kitConfigured = isVaultRecoveryKitConfigured();

  const canGenerate = useMemo(() => {
    const { mode, masterVaultKey } = getVaultSessionUnlockKeys();
    return mvkVault && mode === "mvk" && masterVaultKey instanceof Uint8Array;
  }, [mvkVault, recoveryKit, savedConfirmed, kitConfigured]);

  async function handleGenerateRecoveryKit() {
    setError("");
    setSuccess("");

    const genesis = readVaultGenesis();
    const { masterVaultKey } = getVaultSessionUnlockKeys();

    if (!genesis?.vault_id) {
      setError("Vault genesis is not available.");
      return;
    }

    if (!(masterVaultKey instanceof Uint8Array)) {
      setError("Unlock the vault before generating a recovery kit.");
      return;
    }

    setBusy(true);

    try {
      const phrase = generateRecoveryPhrase();
      const kit = await exportRecoveryKit({
        vaultId: genesis.vault_id,
        masterVaultKey,
        recoveryPhrase: phrase,
      });

      setRecoveryPhrase(phrase);
      setRecoveryKit(kit);
      setSavedConfirmed(false);
      setSuccess("Recovery phrase and kit generated. Save both before confirming.");
    } catch (generateError) {
      setError(generateError.message || "Unable to generate recovery kit.");
    } finally {
      setBusy(false);
    }
  }

  function handleDownloadRecoveryKit() {
    setError("");

    if (!recoveryKit) {
      setError("Generate a recovery kit first.");
      return;
    }

    const blob = new Blob([serializeRecoveryKit(recoveryKit)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = buildRecoveryKitDownloadFilename(recoveryKit.vault_id);
    link.click();
    URL.revokeObjectURL(url);
    setSuccess("Recovery kit downloaded. Store it separately from your recovery phrase.");
  }

  function handleConfirmSaved() {
    setError("");

    if (!savedConfirmed) {
      setError("Confirm that you saved your recovery phrase and recovery kit file.");
      return;
    }

    if (!recoveryKit) {
      setError("Generate and download a recovery kit before confirming.");
      return;
    }

    markVaultRecoveryKitConfirmed({
      vaultId: recoveryKit.vault_id,
      kitVersion: recoveryKit.version,
      kitCreatedAt: recoveryKit.created_at,
    });

    setSuccess("Recovery kit marked as saved on this device.");
    setRecoveryPhrase("");
    setRecoveryKit(null);
    setSavedConfirmed(false);
    onRecoveryConfirmed?.();
  }

  if (!mvkVault) {
    return (
      <section className="vault-recovery-card" aria-label="Vault Recovery">
        <h3 className="vault-recovery-card__title">Recovery</h3>
        <p className="vault-recovery-card__lead">
          Recovery kits are available for vaults created with the master vault key model. Legacy
          vaults must migrate before export is supported.
        </p>
      </section>
    );
  }

  return (
    <section className="vault-recovery-card" aria-label="Vault Recovery">
      <div className="vault-recovery-card__header">
        <h3 className="vault-recovery-card__title">Recovery</h3>
        <span
          className={`vault-recovery-card__status ${
            kitConfigured ? "vault-recovery-card__status--ready" : ""
          }`.trim()}
        >
          {kitConfigured ? "Configured" : "Not configured"}
        </span>
      </div>

      {!kitConfigured && (
        <div className="alert-banner alert-banner--warning vault-recovery-warning" role="status">
          <strong>Recovery required</strong>
          <p>{VAULT_RECOVERY_NOT_CONFIGURED_WARNING}</p>
        </div>
      )}

      <p className="vault-recovery-card__lead">
        Export a recovery kit to unwrap your master vault key with a recovery phrase. ProofOrigin
        never stores your phrase or kit on its servers.
      </p>

      <div className="protocol-actions vault-recovery-card__actions">
        <button
          type="button"
          className="primary"
          disabled={!canGenerate || busy}
          onClick={handleGenerateRecoveryKit}
        >
          {busy ? "Generating…" : "Generate Recovery Kit"}
        </button>

        <button
          type="button"
          className="secondary"
          disabled={!recoveryKit || busy}
          onClick={handleDownloadRecoveryKit}
        >
          Download Recovery Kit
        </button>
      </div>

      {recoveryPhrase && (
        <div className="vault-recovery-card__phrase" aria-label="Recovery phrase">
          <p className="vault-recovery-card__label">Recovery phrase — write this down offline</p>
          <p className="vault-recovery-card__phrase-value">{recoveryPhrase}</p>
          <p className="vault-recovery-card__hint">
            Do not store this phrase in the recovery kit file or on ProofOrigin servers.
          </p>
        </div>
      )}

      {recoveryKit && (
        <label className="vault-recovery-card__confirm">
          <input
            type="checkbox"
            checked={savedConfirmed}
            onChange={(event) => setSavedConfirmed(event.target.checked)}
          />
          <span>I saved my recovery phrase and recovery kit file in a safe place.</span>
        </label>
      )}

      {recoveryKit && (
        <div className="protocol-actions">
          <button
            type="button"
            className="secondary"
            disabled={!savedConfirmed || busy}
            onClick={handleConfirmSaved}
          >
            Confirm Recovery Saved
          </button>
        </div>
      )}

      {error && (
        <div className="alert-banner alert-banner--error" role="alert">
          <strong>Recovery error</strong>
          {error}
        </div>
      )}

      {success && (
        <div className="alert-banner alert-banner--success" role="status">
          <strong>Recovery update</strong>
          {success}
        </div>
      )}
    </section>
  );
}

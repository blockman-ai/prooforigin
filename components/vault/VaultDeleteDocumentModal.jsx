"use client";

import { useState } from "react";
import { isValidPinFormat, verifyVaultPin, VAULT_PIN_MIN_LENGTH } from "../../app/lib/vaultPin";

export default function VaultDeleteDocumentModal({ open, busy, error, onClose, onConfirm }) {
  const [pin, setPin] = useState("");
  const [localError, setLocalError] = useState("");

  if (!open) return null;

  function handleClose() {
    if (busy) return;
    setPin("");
    setLocalError("");
    onClose();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setLocalError("");

    if (!isValidPinFormat(pin)) {
      setLocalError(`Enter your ${VAULT_PIN_MIN_LENGTH}-digit vault PIN.`);
      return;
    }

    const verified = await verifyVaultPin(pin);
    if (!verified) {
      setLocalError("Incorrect PIN. Try again.");
      return;
    }

    try {
      await onConfirm();
      setPin("");
    } catch (err) {
      setLocalError(err.message || "Unable to delete document.");
    }
  }

  return (
    <div className="vault-modal-backdrop" role="presentation" onClick={handleClose}>
      <div
        className="vault-modal vault-modal--danger"
        role="dialog"
        aria-labelledby="vault-delete-title"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="vault-modal__header">
          <div>
            <h3 id="vault-delete-title" className="vault-modal__title">
              Delete Document
            </h3>
            <p className="vault-modal__subtitle">
              This permanently removes the encrypted document from your vault and records a deleted
              event in the timeline. This cannot be undone.
            </p>
          </div>
        </header>

        <form className="vault-modal__form" onSubmit={handleSubmit}>
          <div className="alert-banner alert-banner--warning" role="status">
            <strong>Permanent deletion</strong>
            Ciphertext will be removed from storage. You will need to upload again to restore a
            document slot.
          </div>

          <label className="dataset-field">
            <span className="dataset-field__label">Re-enter vault PIN</span>
            <input
              className="dataset-field__input vault-pin-input"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={12}
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
              placeholder={`${VAULT_PIN_MIN_LENGTH}+ digits`}
              disabled={busy}
            />
          </label>

          {(localError || error) && (
            <div className="alert-banner alert-banner--error" role="alert">
              <strong>Unable to delete</strong>
              {localError || error}
            </div>
          )}

          <div className="protocol-actions">
            <button type="submit" className="danger" disabled={busy}>
              {busy ? "Deleting…" : "Delete Document"}
            </button>
            <button type="button" className="secondary" onClick={handleClose} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

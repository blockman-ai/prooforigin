"use client";

import { useState } from "react";

export default function VaultCompromisedModal({ open, busy, error, onClose, onConfirm }) {
  const [localError, setLocalError] = useState("");

  if (!open) return null;

  function handleClose() {
    if (busy) return;
    setLocalError("");
    onClose();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setLocalError("");

    try {
      await onConfirm();
    } catch (err) {
      setLocalError(err.message || "Unable to mark document compromised.");
    }
  }

  return (
    <div className="vault-modal-backdrop" role="presentation" onClick={handleClose}>
      <div
        className="vault-modal vault-modal--danger"
        role="dialog"
        aria-labelledby="vault-compromised-title"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="vault-modal__header">
          <div>
            <h3 id="vault-compromised-title" className="vault-modal__title">
              Mark Compromised
            </h3>
            <p className="vault-modal__subtitle">
              Use this if you believe the document or device may have been exposed. Protected View
              will be blocked and a compromised event will be recorded.
            </p>
          </div>
        </header>

        <form className="vault-modal__form" onSubmit={handleSubmit}>
          <div className="alert-banner alert-banner--warning" role="status">
            <strong>Viewing will be blocked</strong>
            This action is intended for suspected exposure. The document remains in custody history
            but cannot be opened in Protected View.
          </div>

          {(localError || error) && (
            <div className="alert-banner alert-banner--error" role="alert">
              <strong>Unable to mark compromised</strong>
              {localError || error}
            </div>
          )}

          <div className="protocol-actions">
            <button type="submit" className="danger" disabled={busy}>
              {busy ? "Recording…" : "Mark Compromised"}
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

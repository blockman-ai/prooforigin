"use client";

import { useEffect, useRef, useState } from "react";
import {
  isAllowedVaultDocumentFile,
  VAULT_ALLOWED_EXTENSIONS,
  VAULT_MAX_DOCUMENT_BYTES,
  formatVaultDocumentSize,
} from "../../app/lib/vaultDocumentClient";

const FILE_PICKER_RELEASE_MS = 400;

export default function VaultUploadModal({
  open,
  busy,
  error,
  onClose,
  onSubmit,
  onFilePickerOpenChange,
}) {
  const [file, setFile] = useState(null);
  const [label, setLabel] = useState("");
  const [consent, setConsent] = useState(false);
  const [localError, setLocalError] = useState("");
  const releasePickerTimerRef = useRef(null);

  useEffect(() => {
    if (!open) {
      onFilePickerOpenChange?.(false);
    }
  }, [open, onFilePickerOpenChange]);

  useEffect(() => {
    return () => {
      if (releasePickerTimerRef.current) {
        window.clearTimeout(releasePickerTimerRef.current);
      }
    };
  }, []);

  if (!open) return null;

  function markFilePickerOpen() {
    if (releasePickerTimerRef.current) {
      window.clearTimeout(releasePickerTimerRef.current);
      releasePickerTimerRef.current = null;
    }

    onFilePickerOpenChange?.(true);
  }

  function markFilePickerClosed() {
    if (releasePickerTimerRef.current) {
      window.clearTimeout(releasePickerTimerRef.current);
    }

    releasePickerTimerRef.current = window.setTimeout(() => {
      onFilePickerOpenChange?.(false);
      releasePickerTimerRef.current = null;
    }, FILE_PICKER_RELEASE_MS);
  }

  function handleFileChange(event) {
    const nextFile = event.target.files?.[0] || null;
    setLocalError("");

    if (!nextFile) {
      setFile(null);
      markFilePickerClosed();
      return;
    }

    if (!isAllowedVaultDocumentFile(nextFile)) {
      setFile(null);
      setLocalError("Choose a PDF, JPG, PNG, or WebP file up to 10 MB.");
      markFilePickerClosed();
      return;
    }

    setFile(nextFile);
    markFilePickerClosed();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setLocalError("");

    if (!file) {
      setLocalError("Select a document to encrypt and store.");
      return;
    }

    if (!consent) {
      setLocalError("Confirm this is private encrypted storage, not official verification.");
      return;
    }

    try {
      await onSubmit({ file, label: label.trim() });
      setFile(null);
      setLabel("");
      setConsent(false);
    } catch (err) {
      setLocalError(err.message || "Unable to upload encrypted document.");
    }
  }

  return (
    <div className="vault-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="vault-modal"
        role="dialog"
        aria-labelledby="vault-upload-title"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="vault-modal__header">
          <div>
            <h3 id="vault-upload-title" className="vault-modal__title">
              Add Encrypted Document
            </h3>
            <p className="vault-modal__subtitle">
              One document slot. Encrypted on your device before upload. Max{" "}
              {formatVaultDocumentSize(VAULT_MAX_DOCUMENT_BYTES)}.
            </p>
          </div>
        </header>

        <form className="vault-modal__form" onSubmit={handleSubmit}>
          <label className="dataset-field">
            <span className="dataset-field__label">Document file</span>
            <input
              className="dataset-field__input"
              type="file"
              accept={VAULT_ALLOWED_EXTENSIONS}
              disabled={busy}
              onFocus={markFilePickerOpen}
              onClick={markFilePickerOpen}
              onChange={handleFileChange}
              onBlur={markFilePickerClosed}
              onCancel={markFilePickerClosed}
            />
            {file && (
              <span className="vault-upload-file-meta">
                {file.name} · {formatVaultDocumentSize(file.size)}
              </span>
            )}
          </label>

          <label className="dataset-field">
            <span className="dataset-field__label">Display label (optional)</span>
            <input
              className="dataset-field__input"
              type="text"
              maxLength={80}
              value={label}
              disabled={busy}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="e.g. Personal record"
            />
          </label>

          <label className="vault-upload-consent">
            <input
              type="checkbox"
              checked={consent}
              disabled={busy}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>
              I understand this is private encrypted storage — not government ID or legal
              verification.
            </span>
          </label>

          {(localError || error) && (
            <div className="alert-banner alert-banner--error" role="alert">
              <strong>Unable to upload</strong>
              {localError || error}
            </div>
          )}

          <div className="protocol-actions">
            <button type="submit" className="primary" disabled={busy}>
              {busy ? "Encrypting & storing…" : "Encrypt & Store"}
            </button>
            <button type="button" className="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

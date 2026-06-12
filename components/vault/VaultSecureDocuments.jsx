"use client";

import { formatVaultCreatedAt } from "../../app/lib/vaultGenesis";
import {
  isVaultImageContentType,
  isVaultPdfContentType,
} from "../../app/lib/vaultDocumentClient";

export default function VaultSecureDocuments({
  document,
  displayLabel,
  loading,
  error,
  onAddDocument,
  onEnterProtectedView,
  protectedViewAvailable,
}) {
  const hasDocument = Boolean(document);
  const canProtectedView =
    protectedViewAvailable &&
    hasDocument &&
    (isVaultPdfContentType(document.content_type_hint) ||
      isVaultImageContentType(document.content_type_hint));

  return (
    <section className="vault-secure-documents" aria-label="Secure Documents">
      <div className="vault-secure-documents__header">
        <h3 className="vault-secure-documents__title">Secure Documents</h3>
        {hasDocument && <span className="vault-secure-documents__badge">Protected</span>}
      </div>

      <p className="vault-secure-documents__lead">
        One encrypted document slot. Open Protected View for view-only access — no download, no
        print.
      </p>

      {loading && <p className="vault-secure-documents__status">Loading document status…</p>}

      {error && !loading && (
        <div className="alert-banner alert-banner--error" role="alert">
          <strong>Document status unavailable</strong>
          {error}
        </div>
      )}

      {!loading && !hasDocument && (
        <div className="vault-secure-documents__empty">
          <p>No encrypted document stored yet.</p>
          <div className="protocol-actions vault-secure-documents__actions">
            <button type="button" className="primary" onClick={onAddDocument}>
              Add Document
            </button>
          </div>
        </div>
      )}

      {!loading && hasDocument && (
        <article className="vault-document-card">
          <div className="vault-document-card__header">
            <p className="vault-document-card__eyebrow">Protected Document</p>
            <span className="vault-document-card__badge">Protected</span>
          </div>
          <dl className="vault-document-card__grid">
            <div>
              <dt>Label</dt>
              <dd>{displayLabel || (document.label_present ? "Encrypted label" : "—")}</dd>
            </div>
            <div>
              <dt>Stored</dt>
              <dd>{formatVaultCreatedAt(document.created_at)}</dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>{document.content_type_hint || "application/octet-stream"}</dd>
            </div>
          </dl>
          <div className="protocol-actions vault-secure-documents__actions">
            {canProtectedView ? (
              <button type="button" className="primary" onClick={onEnterProtectedView}>
                Enter Protected View
              </button>
            ) : (
              <p className="vault-secure-documents__status">
                Protected View supports PDF and image documents only.
              </p>
            )}
          </div>
        </article>
      )}
    </section>
  );
}

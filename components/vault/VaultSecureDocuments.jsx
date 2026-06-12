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
  onMarkCompromised,
  onDeleteDocument,
  protectedViewAvailable,
  lifecycleBusy = false,
}) {
  const hasDocument = Boolean(document);
  const isCompromised = Boolean(document?.compromised_at);
  const documentState = hasDocument ? (isCompromised ? "compromised" : "protected") : null;
  const canProtectedView =
    protectedViewAvailable &&
    hasDocument &&
    !isCompromised &&
    (isVaultPdfContentType(document.content_type_hint) ||
      isVaultImageContentType(document.content_type_hint));

  const stateBadgeLabel = documentState === "compromised" ? "Compromised" : "Protected";

  return (
    <section className="vault-secure-documents" aria-label="Secure Documents">
      <div className="vault-secure-documents__header">
        <h3 className="vault-secure-documents__title">Secure Documents</h3>
        {documentState && (
          <span
            className={`vault-secure-documents__badge ${
              documentState === "compromised" ? "vault-secure-documents__badge--compromised" : ""
            }`.trim()}
          >
            {stateBadgeLabel}
          </span>
        )}
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
        <article
          className={`vault-document-card ${
            isCompromised ? "vault-document-card--compromised" : ""
          }`.trim()}
        >
          <div className="vault-document-card__header">
            <p className="vault-document-card__eyebrow">Protected Document</p>
            <span
              className={`vault-document-card__badge ${
                isCompromised ? "vault-document-card__badge--compromised" : ""
              }`.trim()}
            >
              {stateBadgeLabel}
            </span>
          </div>

          {isCompromised && (
            <div className="alert-banner alert-banner--warning vault-document-card__notice" role="status">
              <strong>Document compromised</strong>
              Protected View is disabled. Delete the document to clear the slot and upload again.
            </div>
          )}

          <dl className="vault-document-card__grid">
            <div>
              <dt>Label</dt>
              <dd>{displayLabel || (document.label_present ? "Encrypted label" : "—")}</dd>
            </div>
            <div>
              <dt>Stored</dt>
              <dd>
                {document.created_at
                  ? formatVaultCreatedAt(document.created_at)
                  : isCompromised && document.compromised_at
                    ? formatVaultCreatedAt(document.compromised_at)
                    : "—"}
              </dd>
            </div>
            {isCompromised && (
              <div>
                <dt>Compromised</dt>
                <dd>{formatVaultCreatedAt(document.compromised_at)}</dd>
              </div>
            )}
            <div>
              <dt>Type</dt>
              <dd>{document.content_type_hint || "application/octet-stream"}</dd>
            </div>
          </dl>

          <div className="protocol-actions vault-secure-documents__actions vault-document-card__actions">
            {canProtectedView ? (
              <button
                type="button"
                className="primary"
                onClick={onEnterProtectedView}
                disabled={lifecycleBusy}
              >
                Protected View
              </button>
            ) : (
              !isCompromised && (
                <p className="vault-secure-documents__status">
                  Protected View supports PDF and image documents only.
                </p>
              )
            )}

            {!isCompromised && (
              <button
                type="button"
                className="secondary vault-action--warning"
                onClick={onMarkCompromised}
                disabled={lifecycleBusy}
              >
                Mark Compromised
              </button>
            )}

            <button
              type="button"
              className="danger"
              onClick={onDeleteDocument}
              disabled={lifecycleBusy}
            >
              Delete Document
            </button>
          </div>
        </article>
      )}
    </section>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  decryptVaultDocumentPayload,
  downloadVaultDocumentCiphertext,
  fetchVaultDocumentCiphertextUrl,
  isVaultImageContentType,
  isVaultPdfContentType,
  recordVaultDocumentViewed,
} from "../../app/lib/vaultDocumentClient";
import { clearBytes } from "../../app/lib/vaultCrypto";
import {
  endProtectedViewSession,
  formatShortVaultId,
  startProtectedViewSession,
} from "../../app/lib/vaultProtectedView";
import {
  clearVaultSessionDocumentKey,
  setVaultSessionDocumentKey,
} from "../../app/lib/vaultSession";
import VaultWatermark from "./VaultWatermark";

async function configurePdfWorker(pdfjs) {
  if (pdfjs.GlobalWorkerOptions?.workerSrc) return;
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
}

async function renderPdfPages(plaintext, container) {
  const pdfjs = await import("pdfjs-dist");
  await configurePdfWorker(pdfjs);

  const loadingTask = pdfjs.getDocument({ data: plaintext.slice() });
  const pdf = await loadingTask.promise;

  container.replaceChildren();

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.1 });
    const canvas = document.createElement("canvas");
    canvas.className = "protected-view__pdf-page";
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.oncontextmenu = (event) => event.preventDefault();
    canvas.draggable = false;

    const context = canvas.getContext("2d");
    await page.render({ canvasContext: context, viewport }).promise;
    container.appendChild(canvas);
  }
}

export default function ProtectedView({
  document,
  masterKey,
  vaultId,
  onClose,
  onRegisterTeardown,
}) {
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [imageUrl, setImageUrl] = useState(null);
  const [sessionStartedAt, setSessionStartedAt] = useState(null);

  const sessionRef = useRef(null);
  const viewedRecordedRef = useRef(false);
  const plaintextRef = useRef(null);
  const pdfContainerRef = useRef(null);
  const imageUrlRef = useRef(null);
  const teardownDoneRef = useRef(false);

  const vaultIdShort = formatShortVaultId(vaultId);
  const isPdf = isVaultPdfContentType(document.content_type_hint);
  const isImage = isVaultImageContentType(document.content_type_hint);

  const teardown = useCallback(() => {
    if (teardownDoneRef.current) return;
    teardownDoneRef.current = true;

    if (imageUrlRef.current) {
      URL.revokeObjectURL(imageUrlRef.current);
      imageUrlRef.current = null;
    }

    if (plaintextRef.current) {
      clearBytes(plaintextRef.current);
      plaintextRef.current = null;
    }

    if (pdfContainerRef.current) {
      pdfContainerRef.current.replaceChildren();
    }

    clearVaultSessionDocumentKey();
    endProtectedViewSession(sessionRef.current);
    setImageUrl(null);
  }, []);

  useEffect(() => {
    onRegisterTeardown?.(teardown);
    return () => {
      onRegisterTeardown?.(null);
      teardown();
    };
  }, [onRegisterTeardown, teardown]);

  useEffect(() => {
    let cancelled = false;

    async function loadProtectedView() {
      const session = startProtectedViewSession();
      sessionRef.current = session;
      setSessionStartedAt(session.started_at);
      setStatus("loading");
      setError("");

      try {
        const urlResponse = await fetchVaultDocumentCiphertextUrl();
        if (!urlResponse.ok) {
          throw new Error(urlResponse.data?.error || "Unable to prepare protected view download.");
        }

        const encryptedPayload = await downloadVaultDocumentCiphertext(urlResponse.data.signedUrl);
        const decrypted = await decryptVaultDocumentPayload({
          masterKey,
          document,
          encryptedPayload,
        });

        if (cancelled) {
          clearBytes(decrypted.plaintext);
          return;
        }

        plaintextRef.current = decrypted.plaintext;
        setVaultSessionDocumentKey(decrypted.documentKey);

        const contentType = decrypted.contentType;

        if (isVaultImageContentType(contentType)) {
          const blob = new Blob([decrypted.plaintext], { type: contentType });
          const objectUrl = URL.createObjectURL(blob);
          imageUrlRef.current = objectUrl;
          setImageUrl(objectUrl);
          setStatus("ready");
        } else if (isVaultPdfContentType(contentType)) {
          await new Promise((resolve) => requestAnimationFrame(resolve));
          const container = pdfContainerRef.current;
          if (!container) {
            throw new Error("Protected View container is not ready.");
          }
          await renderPdfPages(decrypted.plaintext, container);
          setStatus("ready");
        } else {
          throw new Error("This document type is not supported in Protected View yet.");
        }

        if (!viewedRecordedRef.current && sessionRef.current) {
          const viewedResponse = await recordVaultDocumentViewed({
            documentId: document.id,
            viewSessionId: sessionRef.current.view_session_id,
            startedAt: sessionRef.current.started_at,
          });

          if (!viewedResponse.ok) {
            throw new Error(viewedResponse.data?.error || "Unable to record protected view event.");
          }

          viewedRecordedRef.current = true;
          sessionRef.current.viewed_event_recorded = true;
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to open Protected View.");
          setStatus("error");
        }
      }
    }

    loadProtectedView();

    return () => {
      cancelled = true;
    };
  }, [document, masterKey]);

  function handleClose() {
    teardown();
    onClose();
  }

  function preventInteraction(event) {
    event.preventDefault();
  }

  return (
    <div className="protected-view-backdrop" role="presentation">
      <section
        className="protected-view"
        aria-label="Protected View"
        onContextMenu={preventInteraction}
      >
        <header className="protected-view__header">
          <div>
            <p className="protected-view__eyebrow">ProofOrigin Private Vault</p>
            <h3 className="protected-view__title">Protected View</h3>
            <p className="protected-view__subtitle">View-only session. No download. No print.</p>
          </div>
          <button type="button" className="secondary protected-view__close" onClick={handleClose}>
            Close Protected View
          </button>
        </header>

        <div className="protected-view__stage">
          {status === "loading" && (
            <p className="protected-view__status">Decrypting and preparing protected view…</p>
          )}

          {status === "error" && (
            <div className="alert-banner alert-banner--error" role="alert">
              <strong>Protected View unavailable</strong>
              {error}
            </div>
          )}

          {isImage && imageUrl && status === "ready" && (
            <div className="protected-view__image-wrap">
              <img
                className="protected-view__image"
                src={imageUrl}
                alt=""
                draggable={false}
                onContextMenu={preventInteraction}
                onDragStart={preventInteraction}
              />
            </div>
          )}

          {isPdf && (
            <div
              ref={pdfContainerRef}
              className={`protected-view__pdf-wrap ${status !== "ready" ? "protected-view__pdf-wrap--pending" : ""}`.trim()}
              onContextMenu={preventInteraction}
            />
          )}

          {status === "ready" && sessionStartedAt && (
            <VaultWatermark vaultIdShort={vaultIdShort} timestamp={sessionStartedAt} />
          )}
        </div>
      </section>
    </div>
  );
}

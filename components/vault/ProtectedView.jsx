"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  decryptVaultDocumentPayload,
  downloadVaultDocumentCiphertext,
  fetchVaultDocumentCiphertextUrl,
  isVaultImageContentType,
  isVaultPdfContentType,
  recordVaultDocumentViewStarted,
  sendVaultDocumentViewEndedBestEffort,
} from "../../app/lib/vaultDocumentClient";
import { clearBytes } from "../../app/lib/vaultCrypto";
import {
  computeProtectedViewDurationMs,
  endProtectedViewSession,
  formatShortVaultId,
  startProtectedViewSession,
} from "../../app/lib/vaultProtectedView";
import {
  clearVaultSessionDocumentKey,
  getVaultSessionUnlockKeys,
  setVaultSessionDocumentKey,
} from "../../app/lib/vaultSession";
import VaultWatermark from "./VaultWatermark";

function configurePdfWorker(pdfjs) {
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

async function renderPdfPages(plaintext, container, { isStopped, onLoadingTask }) {
  const pdfjs = await import("pdfjs-dist");
  configurePdfWorker(pdfjs);

  if (isStopped()) {
    return;
  }

  const loadingTask = pdfjs.getDocument({ data: plaintext.slice() });
  onLoadingTask?.(loadingTask);

  if (isStopped()) {
    loadingTask.destroy();
    return;
  }

  let pdf;
  try {
    pdf = await loadingTask.promise;
  } catch (error) {
    if (isStopped()) {
      return;
    }
    throw error;
  }

  if (isStopped()) {
    pdf.destroy?.();
    return;
  }

  container.replaceChildren();

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    if (isStopped()) {
      pdf.destroy?.();
      container.replaceChildren();
      return;
    }

    const page = await pdf.getPage(pageNumber);

    if (isStopped()) {
      pdf.destroy?.();
      container.replaceChildren();
      return;
    }

    const viewport = page.getViewport({ scale: 1.1 });
    const canvas = document.createElement("canvas");
    canvas.className = "protected-view__pdf-page";
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.oncontextmenu = (event) => event.preventDefault();
    canvas.draggable = false;

    const context = canvas.getContext("2d");
    await page.render({ canvasContext: context, viewport }).promise;

    if (isStopped()) {
      pdf.destroy?.();
      container.replaceChildren();
      return;
    }

    container.appendChild(canvas);
  }
}

export default function ProtectedView({
  document,
  vaultId,
  onClose,
  onRegisterTeardown,
}) {
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [imageUrl, setImageUrl] = useState(null);
  const [sessionStartedAt, setSessionStartedAt] = useState(null);

  const sessionRef = useRef(null);
  const plaintextRef = useRef(null);
  const pdfContainerRef = useRef(null);
  const imageUrlRef = useRef(null);
  const teardownDoneRef = useRef(false);
  const abortControllerRef = useRef(null);
  const pdfLoadingTaskRef = useRef(null);
  const renderGenerationRef = useRef(0);

  const vaultIdShort = formatShortVaultId(vaultId);
  const isPdf = isVaultPdfContentType(document.content_type_hint);
  const isImage = isVaultImageContentType(document.content_type_hint);
  const isClosed = status === "closed";

  const isStopped = useCallback(() => teardownDoneRef.current, []);

  const dispatchViewEndedBestEffort = useCallback(() => {
    const session = sessionRef.current;
    if (!session?.view_started_recorded || session.view_ended_recorded) {
      endProtectedViewSession(session);
      return;
    }

    endProtectedViewSession(session);
    session.view_ended_recorded = true;

    sendVaultDocumentViewEndedBestEffort({
      documentId: document.id,
      viewSessionId: session.view_session_id,
      startedAt: session.started_at,
      endedAt: session.ended_at,
      durationMs: computeProtectedViewDurationMs(session),
    });
  }, [document.id]);

  const teardown = useCallback(() => {
    if (teardownDoneRef.current) {
      return;
    }

    teardownDoneRef.current = true;
    renderGenerationRef.current += 1;

    abortControllerRef.current?.abort();
    pdfLoadingTaskRef.current?.destroy();
    pdfLoadingTaskRef.current = null;

    setStatus("closed");
    setImageUrl(null);

    if (plaintextRef.current) {
      clearBytes(plaintextRef.current);
      plaintextRef.current = null;
    }

    clearVaultSessionDocumentKey();

    if (pdfContainerRef.current) {
      pdfContainerRef.current.replaceChildren();
    }

    if (imageUrlRef.current) {
      URL.revokeObjectURL(imageUrlRef.current);
      imageUrlRef.current = null;
    }

    dispatchViewEndedBestEffort();
  }, [dispatchViewEndedBestEffort]);

  useEffect(() => {
    onRegisterTeardown?.(teardown);
    return () => {
      onRegisterTeardown?.(null);
      void teardown();
    };
  }, [onRegisterTeardown, teardown]);

  useEffect(() => {
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    async function loadProtectedView() {
      const session = startProtectedViewSession();
      sessionRef.current = session;
      setSessionStartedAt(session.started_at);
      setStatus("loading");
      setError("");

      try {
        const urlResponse = await fetchVaultDocumentCiphertextUrl();
        if (abortController.signal.aborted || isStopped()) {
          return;
        }

        if (!urlResponse.ok) {
          throw new Error(urlResponse.data?.error || "Unable to prepare protected view download.");
        }

        const encryptedPayload = await downloadVaultDocumentCiphertext(urlResponse.data.signedUrl, {
          signal: abortController.signal,
        });

        if (abortController.signal.aborted || isStopped()) {
          return;
        }

        const decrypted = await decryptVaultDocumentPayload({
          unlockKeys: getVaultSessionUnlockKeys(),
          document,
          encryptedPayload,
        });

        if (abortController.signal.aborted || isStopped()) {
          clearBytes(decrypted.plaintext);
          return;
        }

        plaintextRef.current = decrypted.plaintext;
        setVaultSessionDocumentKey(decrypted.documentKey);

        const contentType = decrypted.contentType;

        if (isVaultImageContentType(contentType)) {
          const blob = new Blob([decrypted.plaintext], { type: contentType });
          const objectUrl = URL.createObjectURL(blob);

          if (abortController.signal.aborted || isStopped()) {
            URL.revokeObjectURL(objectUrl);
            return;
          }

          imageUrlRef.current = objectUrl;
          setImageUrl(objectUrl);
          setStatus("ready");
        } else if (isVaultPdfContentType(contentType)) {
          await new Promise((resolve) => requestAnimationFrame(resolve));

          if (abortController.signal.aborted || isStopped()) {
            return;
          }

          const container = pdfContainerRef.current;
          if (!container) {
            throw new Error("Protected View container is not ready.");
          }

          await renderPdfPages(decrypted.plaintext, container, {
            isStopped,
            onLoadingTask: (task) => {
              pdfLoadingTaskRef.current = task;
            },
          });

          if (abortController.signal.aborted || isStopped()) {
            return;
          }

          setStatus("ready");
        } else {
          throw new Error("This document type is not supported in Protected View yet.");
        }

        const activeSession = sessionRef.current;
        if (activeSession && !activeSession.view_started_recorded) {
          const startedResponse = await recordVaultDocumentViewStarted({
            documentId: document.id,
            viewSessionId: activeSession.view_session_id,
            startedAt: activeSession.started_at,
          });

          if (!startedResponse.ok) {
            throw new Error(
              startedResponse.data?.error || "Unable to record protected view session start."
            );
          }

          activeSession.view_started_recorded = true;
        }
      } catch (err) {
        if (abortController.signal.aborted || isStopped()) {
          return;
        }

        setError(err.message || "Unable to open Protected View.");
        setStatus("error");
      }
    }

    void loadProtectedView();

    return () => {
      abortController.abort();
    };
  }, [document, isStopped]);

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

          {!isClosed && isImage && imageUrl && status === "ready" && (
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

          {!isClosed && isPdf && (
            <div
              ref={pdfContainerRef}
              className={`protected-view__pdf-wrap ${status !== "ready" ? "protected-view__pdf-wrap--pending" : ""}`.trim()}
              onContextMenu={preventInteraction}
            />
          )}

          {!isClosed && status === "ready" && sessionStartedAt && (
            <VaultWatermark vaultIdShort={vaultIdShort} timestamp={sessionStartedAt} />
          )}
        </div>
      </section>
    </div>
  );
}

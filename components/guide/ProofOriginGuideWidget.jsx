"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { GUIDE_DISCLAIMER } from "../../app/lib/guidePrompt.js";
import {
  getGuideSuggestionsForFeature,
  getGuideTitleForFeature,
} from "../../app/lib/guideSafeContext.js";

export default function ProofOriginGuideWidget({ context }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const panelRef = useRef(null);
  const inputRef = useRef(null);
  const titleId = useId();

  const feature = context?.feature || "general";
  const panelTitle = useMemo(() => getGuideTitleForFeature(feature), [feature]);
  const suggestions = useMemo(() => getGuideSuggestionsForFeature(feature), [feature]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    inputRef.current?.focus();

    function onKeyDown(event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const submitQuestion = useCallback(
    async (nextQuestion) => {
      const trimmed = String(nextQuestion || "").trim();
      if (!trimmed || busy) {
        return;
      }

      setBusy(true);
      setError("");
      setAnswer("");

      try {
        const response = await fetch("/api/guide", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            question: trimmed,
            context,
          }),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || "Guide is temporarily unavailable.");
        }

        setQuestion(trimmed);
        setAnswer(data.answer || "No answer available.");
        setTopic(data.topic || "");
      } catch (submitError) {
        setError(submitError.message || "Guide is temporarily unavailable.");
      } finally {
        setBusy(false);
      }
    },
    [busy, context]
  );

  return (
    <div className={`prooforigin-guide ${open ? "prooforigin-guide--open" : ""}`.trim()}>
      {open && (
        <div
          ref={panelRef}
          className="prooforigin-guide__panel prooforigin-guide--mobile-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div className="prooforigin-guide__header">
            <div>
              <p className="prooforigin-guide__eyebrow">ProofOrigin Guide</p>
              <h2 id={titleId} className="prooforigin-guide__title">
                {panelTitle}
              </h2>
            </div>
            <button
              type="button"
              className="prooforigin-guide__close"
              aria-label="Close guide"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>

          <div className="prooforigin-guide__disclaimer" role="note">
            {GUIDE_DISCLAIMER}
          </div>

          <div className="prooforigin-guide__chips" aria-label="Suggested questions">
            {suggestions.map((entry) => (
              <button
                key={entry.label}
                type="button"
                className="prooforigin-guide__chip"
                disabled={busy}
                onClick={() => submitQuestion(entry.question)}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <form
            className="prooforigin-guide__form"
            onSubmit={(event) => {
              event.preventDefault();
              void submitQuestion(question);
            }}
          >
            <label className="prooforigin-guide__label" htmlFor="prooforigin-guide-question">
              Your question
            </label>
            <textarea
              id="prooforigin-guide-question"
              ref={inputRef}
              className="prooforigin-guide__input"
              rows={3}
              maxLength={500}
              value={question}
              disabled={busy}
              placeholder="Ask about ProofOrigin features, unlock, or verification…"
              onChange={(event) => setQuestion(event.target.value)}
            />
            <button type="submit" className="primary prooforigin-guide__submit" disabled={busy}>
              {busy ? "Finding answer…" : "Ask Guide"}
            </button>
          </form>

          {error && (
            <div className="alert-banner alert-banner--error prooforigin-guide__message" role="alert">
              <strong>Guide error</strong>
              {error}
            </div>
          )}

          {answer && (
            <div className="prooforigin-guide__answer" role="status" aria-live="polite">
              {topic && <p className="prooforigin-guide__topic">Topic: {topic}</p>}
              <div className="prooforigin-guide__answer-body">{answer}</div>
              <p className="prooforigin-guide__answer-disclaimer">{GUIDE_DISCLAIMER}</p>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        className="prooforigin-guide__fab"
        aria-expanded={open}
        aria-controls={open ? titleId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Close help" : "Need help?"}
      </button>
    </div>
  );
}

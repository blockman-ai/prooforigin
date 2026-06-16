"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DatasetCaptureAuthGate from "../../../components/dataset/DatasetCaptureAuthGate";
import DatasetProgressDashboard from "../../../components/dataset/DatasetProgressDashboard";
import GlassPanel from "../../../components/protocol/GlassPanel";
import LoadingState from "../../../components/protocol/LoadingState";
import PageShell from "../../../components/protocol/PageShell";
import ProofField from "../../../components/protocol/ProofField";
import ProtocolBadge from "../../../components/protocol/ProtocolBadge";
import StatusCard from "../../../components/protocol/StatusCard";
import { getDatasetCaptureAuthHeaders } from "../../lib/datasetCaptureClient";
import {
  DATASET_CAPTURE_BUCKET_GROUPS,
  DATASET_CAPTURE_BUCKETS,
  DATASET_CAPTURE_EXPANSION_NOTICE,
  SAFE_TRAINING_NOTICE,
  assessCaptureQuality,
  formatBytes,
} from "../../lib/datasetCapture";

const REVIEW_NOTICE =
  "OpenAI suggestions are advisory only. Images are not used for training until manually approved and the safe training gate passes.";

const DEFAULT_APPROVE_SUCCESS = "Capture approved for import.";

function ReviewFeedbackBanner({ variant, title, message, onDismiss }) {
  if (!message && !title) {
    return null;
  }

  return (
    <div
      className={`dataset-review-feedback alert-banner alert-banner--${variant}`}
      role={variant === "error" ? "alert" : "status"}
      aria-live={variant === "error" ? "assertive" : "polite"}
    >
      <div className="dataset-review-feedback__content">
        {title && <strong>{title}</strong>}
        {message && (
          <span className="dataset-review-feedback__message">{message}</span>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          className="secondary dataset-review-feedback__dismiss"
          onClick={onDismiss}
          aria-label="Dismiss message"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}

function formatTimestamp(value) {
  if (!value) return "Unknown";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function bucketLabel(value) {
  return (
    DATASET_CAPTURE_BUCKETS.find((bucket) => bucket.value === value)?.label ||
    value ||
    "Unknown"
  );
}

function CaptureReviewCard({
  capture,
  accessToken,
  onReviewSuccess,
  onReviewError,
  onReviewed,
}) {
  const [signedUrl, setSignedUrl] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(true);
  const [correctionBucket, setCorrectionBucket] = useState(
    capture.human_verified_label || capture.selected_bucket
  );
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [actionError, setActionError] = useState("");
  const [submitting, setSubmitting] = useState("");
  const errorAnchorRef = useRef(null);

  const loadSignedUrl = useCallback(async () => {
    setPreviewLoading(true);
    setPreviewError("");

    try {
      const res = await fetch("/api/dataset-capture/signed-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getDatasetCaptureAuthHeaders(accessToken),
        },
        body: JSON.stringify({ id: capture.id }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setPreviewError(data.error || "Preview unavailable.");
        setSignedUrl("");
        return;
      }

      setSignedUrl(data.signedUrl);
    } catch {
      setPreviewError("Preview request failed.");
      setSignedUrl("");
    } finally {
      setPreviewLoading(false);
    }
  }, [accessToken, capture.id]);

  useEffect(() => {
    loadSignedUrl();
  }, [loadSignedUrl]);

  useEffect(() => {
    if (actionError && errorAnchorRef.current) {
      errorAnchorRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [actionError]);

  const qualityWarnings =
    capture.quality_warnings ||
    assessCaptureQuality({
      width: capture.width,
      height: capture.height,
      fileSize: capture.file_size,
    });

  async function submitReview(action) {
    setActionError("");
    setSubmitting(action);

    try {
      const res = await fetch("/api/dataset-capture/review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getDatasetCaptureAuthHeaders(accessToken),
        },
        body: JSON.stringify({
          id: capture.id,
          action,
          correction_bucket: correctionBucket,
          reviewer_notes: reviewerNotes,
        }),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        const failure = `Review request failed (${res.status || "network"}).`;
        setActionError(failure);
        onReviewError?.({ captureId: capture.id, action, error: failure });
        return;
      }

      if (!res.ok || !data.success) {
        const failure = data.error || "Review action failed.";
        setActionError(failure);
        onReviewError?.({ captureId: capture.id, action, error: failure });
        return;
      }

      onReviewSuccess?.({
        captureId: capture.id,
        action,
        message: data.message,
        capture: data.capture,
        filename: capture.original_filename,
      });
      onReviewed?.(capture.id, action, data.capture);
    } catch {
      const failure = "Review request failed.";
      setActionError(failure);
      onReviewError?.({ captureId: capture.id, action, error: failure });
    } finally {
      setSubmitting("");
    }
  }

  return (
    <article className="dataset-review-card glass-panel">
      <div className="dataset-review-card__media">
        {previewLoading && <LoadingState message="Loading private preview..." />}
        {!previewLoading && signedUrl && (
          <img src={signedUrl} alt={capture.original_filename} />
        )}
        {!previewLoading && previewError && (
          <div className="dataset-review-card__preview-error">
            <p>{previewError}</p>
            <button type="button" className="secondary" onClick={loadSignedUrl}>
              Retry preview
            </button>
          </div>
        )}
        <p className="dataset-review-card__preview-note">
          Signed preview expires in about 2 minutes.
        </p>
      </div>

      <div className="dataset-review-card__body">
        <div className="dataset-review-card__header">
          <h3 className="dataset-review-card__title">{capture.original_filename}</h3>
          <ProtocolBadge variant="pending">Pending review</ProtocolBadge>
        </div>

        {capture.is_duplicate && (
          <StatusCard
            variant="warning"
            title="Duplicate warning"
            body="This SHA-256 already exists in the capture vault."
            className="dataset-status"
          />
        )}

        {qualityWarnings.length > 0 && (
          <StatusCard
            variant="warning"
            title="Image quality warning"
            body={qualityWarnings.join(" ")}
            className="dataset-status"
          />
        )}

        <p className="dataset-notice">{SAFE_TRAINING_NOTICE}</p>

        <div className="proof-grid">
          <ProofField label="Selected bucket" value={bucketLabel(capture.selected_bucket)} />
          <ProofField
            label="Human selected bucket"
            value={bucketLabel(capture.human_verified_label || capture.selected_bucket)}
          />
          <ProofField
            label="OpenAI suggested bucket"
            value={bucketLabel(capture.suggested_bucket) || "None"}
          />
          <ProofField
            label="Approval status"
            value={
              capture.approved_for_training
                ? "Approved for import"
                : capture.rejected
                  ? "Rejected"
                  : "Pending"
            }
          />
          <ProofField label="SHA256" value={capture.sha256} mono />
          <ProofField label="File size" value={formatBytes(capture.file_size)} />
          <ProofField
            label="Dimensions"
            value={
              capture.width && capture.height
                ? `${capture.width} x ${capture.height}`
                : "Unknown"
            }
          />
          <ProofField label="Consent" value={capture.consent_status || "Unknown"} />
          <ProofField label="Created" value={formatTimestamp(capture.created_at)} />
          <ProofField label="Source" value={capture.source || "Unknown"} />
        </div>

        {capture.notes && (
          <div className="dataset-review-card__notes">
            <strong>Capture notes</strong>
            <p>{capture.notes}</p>
          </div>
        )}

        {capture.vision_notes && (
          <div className="dataset-review-card__notes dataset-review-card__notes--vision">
            <strong>OpenAI / vision notes</strong>
            <p>{capture.vision_notes}</p>
          </div>
        )}

        <label className="dataset-field">
          <span className="dataset-field__label">Correction bucket</span>
          <select
            className="dataset-field__input"
            value={correctionBucket}
            onChange={(event) => setCorrectionBucket(event.target.value)}
            disabled={Boolean(submitting)}
          >
            {DATASET_CAPTURE_BUCKET_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.buckets.map((bucket) => (
                  <option key={bucket.value} value={bucket.value}>
                    {bucket.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <span className="dataset-field__hint">{DATASET_CAPTURE_EXPANSION_NOTICE}</span>
        </label>

        <label className="dataset-field">
          <span className="dataset-field__label">Reviewer notes</span>
          <textarea
            className="dataset-field__textarea"
            rows={3}
            value={reviewerNotes}
            onChange={(event) => setReviewerNotes(event.target.value)}
            placeholder="Optional reviewer notes"
            disabled={Boolean(submitting)}
          />
        </label>

        {actionError && (
          <div ref={errorAnchorRef}>
            <StatusCard variant="error" body={actionError} className="dataset-status" />
          </div>
        )}

        <div className="protocol-actions">
          <button
            type="button"
            className="primary"
            disabled={Boolean(submitting)}
            onClick={() => submitReview("approve")}
          >
            {submitting === "approve" ? "Approving..." : "Approve for import"}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={Boolean(submitting)}
            onClick={() => submitReview("update_bucket")}
          >
            {submitting === "update_bucket" ? "Saving..." : "Save bucket correction"}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={Boolean(submitting)}
            onClick={() => submitReview("wrong_bucket")}
          >
            Wrong bucket
          </button>
          <button
            type="button"
            className="secondary"
            disabled={Boolean(submitting)}
            onClick={() => submitReview("duplicate")}
          >
            Mark duplicate
          </button>
          <button
            type="button"
            className="secondary"
            disabled={Boolean(submitting)}
            onClick={() => submitReview("low_quality")}
          >
            Low quality
          </button>
          <button
            type="button"
            className="secondary"
            disabled={Boolean(submitting)}
            onClick={() => submitReview("keep_for_regression_only")}
          >
            Regression only
          </button>
          <button
            type="button"
            className="secondary"
            disabled={Boolean(submitting)}
            onClick={() => submitReview("reject")}
          >
            {submitting === "reject" ? "Rejecting..." : "Reject"}
          </button>
        </div>
      </div>
    </article>
  );
}

function DatasetCaptureReviewPanel({ accessToken, email, onSignOut }) {
  const [captures, setCaptures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [feedbackBanner, setFeedbackBanner] = useState(null);
  const [approvedSessionCount, setApprovedSessionCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [progressRefreshSignal, setProgressRefreshSignal] = useState(0);
  const feedbackRef = useRef(null);

  const showFeedback = useCallback((variant, message, title) => {
    setFeedbackBanner({ variant, message, title });
    requestAnimationFrame(() => {
      feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, []);

  const loadCaptures = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }
    setLoadError("");

    try {
      const res = await fetch("/api/dataset-capture/list", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getDatasetCaptureAuthHeaders(accessToken),
        },
        body: JSON.stringify({ limit: 50 }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setLoadError(data.error || "Unable to load pending captures.");
        setCaptures([]);
        setPendingCount(0);
        return;
      }

      const nextCaptures = data.captures || [];
      setCaptures(nextCaptures);
      setPendingCount(nextCaptures.length);
    } catch {
      setLoadError("Unable to reach the review list API.");
      setCaptures([]);
      setPendingCount(0);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [accessToken]);

  useEffect(() => {
    loadCaptures();
  }, [loadCaptures]);

  function refreshProgress() {
    setProgressRefreshSignal((value) => value + 1);
  }

  function handleReviewSuccess({ captureId, action, message, filename }) {
    if (action === "approve") {
      setApprovedSessionCount((count) => count + 1);
      showFeedback(
        "success",
        message || "",
        DEFAULT_APPROVE_SUCCESS
      );
      setCaptures((prev) => {
        const next = prev.filter((capture) => capture.id !== captureId);
        setPendingCount(next.length);
        return next;
      });
      refreshProgress();
      loadCaptures({ silent: true });
      return;
    }

    const successTitles = {
      reject: "Capture rejected",
      duplicate: "Marked duplicate",
      low_quality: "Marked low quality",
      keep_for_regression_only: "Saved for regression",
      update_bucket: "Bucket updated",
      wrong_bucket: "Bucket corrected",
    };

    if (
      action === "reject" ||
      action === "duplicate" ||
      action === "low_quality"
    ) {
      showFeedback(
        "success",
        message || `${filename || "Capture"} ${action.replace(/_/g, " ")}.`,
        successTitles[action] || "Review saved"
      );
      setCaptures((prev) => {
        const next = prev.filter((capture) => capture.id !== captureId);
        setPendingCount(next.length);
        return next;
      });
      refreshProgress();
      loadCaptures({ silent: true });
      return;
    }

    if (message) {
      showFeedback(
        "success",
        message,
        successTitles[action] || "Review saved"
      );
      refreshProgress();
    }
  }

  function handleReviewError({ error }) {
    showFeedback(
      "error",
      error || "Review action failed.",
      "Approval failed"
    );
  }

  function handleReviewed(captureId, action, updatedCapture) {
    if (
      (action === "update_bucket" || action === "wrong_bucket") &&
      updatedCapture
    ) {
      setCaptures((prev) =>
        prev.map((capture) =>
          capture.id === captureId ? { ...capture, ...updatedCapture } : capture
        )
      );
    }
  }

  return (
    <PageShell
      narrow
      badge="Private review"
      title="Dataset capture review"
      subtitle="Approve or reject pending captures before any training use."
    >
      <DatasetProgressDashboard
        accessToken={accessToken}
        refreshSignal={progressRefreshSignal}
      />

      <GlassPanel
        title="Pending captures"
        subtitle={`Signed in as ${email}. ${pendingCount} pending · Approved this session: ${approvedSessionCount}`}
      >
        <div ref={feedbackRef} className="dataset-review-feedback-anchor">
          {feedbackBanner && (
            <ReviewFeedbackBanner
              variant={feedbackBanner.variant}
              title={feedbackBanner.title}
              message={feedbackBanner.message}
              onDismiss={() => setFeedbackBanner(null)}
            />
          )}
        </div>

        <p className="dataset-notice">{REVIEW_NOTICE}</p>

        <div className="protocol-actions dataset-review-toolbar">
          <button
            type="button"
            className="secondary"
            disabled={loading}
            onClick={loadCaptures}
          >
            {loading ? "Refreshing..." : "Refresh list"}
          </button>
          <a href="/dataset-capture" className="secondary">
            Back to capture upload
          </a>
          <button type="button" className="secondary" onClick={onSignOut}>
            Sign out
          </button>
        </div>

        {loadError && (
          <StatusCard variant="error" body={loadError} className="dataset-status" />
        )}

        {loading && captures.length === 0 && (
          <LoadingState message="Loading pending captures..." />
        )}

        {!loading && captures.length === 0 && !loadError && (
          <StatusCard
            variant="info"
            title="No pending captures"
            body="Upload new images from the private capture page to review them here."
          />
        )}

        <div className="dataset-review-list">
          {captures.map((capture) => (
            <CaptureReviewCard
              key={capture.id}
              capture={capture}
              accessToken={accessToken}
              onReviewSuccess={handleReviewSuccess}
              onReviewError={handleReviewError}
              onReviewed={handleReviewed}
            />
          ))}
        </div>
      </GlassPanel>
    </PageShell>
  );
}

export default function DatasetCaptureReviewPage() {
  return (
    <DatasetCaptureAuthGate
      badge="Private review"
      title="Dataset capture review"
      subtitle="Approved admins only."
    >
      {(auth) => (
        <DatasetCaptureReviewPanel
          accessToken={auth.accessToken}
          email={auth.email}
          onSignOut={auth.onSignOut}
        />
      )}
    </DatasetCaptureAuthGate>
  );
}

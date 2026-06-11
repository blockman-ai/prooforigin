"use client";

import { useCallback, useEffect, useState } from "react";
import GlassPanel from "../../../components/protocol/GlassPanel";
import LoadingState from "../../../components/protocol/LoadingState";
import PageShell from "../../../components/protocol/PageShell";
import ProofField from "../../../components/protocol/ProofField";
import ProtocolBadge from "../../../components/protocol/ProtocolBadge";
import StatusCard from "../../../components/protocol/StatusCard";
import {
  DATASET_CAPTURE_BUCKETS,
  formatBytes,
} from "../../lib/datasetCapture";

const REVIEW_NOTICE =
  "OpenAI suggestions are advisory only. Images are not used for training until manually approved.";

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

function CaptureReviewCard({ capture, secret, onReviewed }) {
  const [signedUrl, setSignedUrl] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(true);
  const [correctionBucket, setCorrectionBucket] = useState(
    capture.human_verified_label || capture.selected_bucket
  );
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [submitting, setSubmitting] = useState("");

  const loadSignedUrl = useCallback(async () => {
    setPreviewLoading(true);
    setPreviewError("");

    try {
      const res = await fetch("/api/dataset-capture/signed-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, id: capture.id }),
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
  }, [capture.id, secret]);

  useEffect(() => {
    loadSignedUrl();
  }, [loadSignedUrl]);

  async function submitReview(action) {
    setActionError("");
    setActionMessage("");
    setSubmitting(action);

    try {
      const res = await fetch("/api/dataset-capture/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret,
          id: capture.id,
          action,
          correction_bucket: correctionBucket,
          reviewer_notes: reviewerNotes,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setActionError(data.error || "Review action failed.");
        return;
      }

      const actionLabel =
        action === "approve"
          ? "approved for training"
          : action === "reject"
            ? "rejected"
            : "bucket updated";

      setActionMessage(`Capture ${actionLabel}.`);
      onReviewed(capture.id, action, data.capture);
    } catch {
      setActionError("Review request failed.");
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

        <div className="proof-grid">
          <ProofField label="Selected bucket" value={bucketLabel(capture.selected_bucket)} />
          <ProofField
            label="Suggested bucket"
            value={bucketLabel(capture.suggested_bucket) || "None"}
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
            {DATASET_CAPTURE_BUCKETS.map((bucket) => (
              <option key={bucket.value} value={bucket.value}>
                {bucket.label}
              </option>
            ))}
          </select>
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
          <StatusCard variant="error" body={actionError} className="dataset-status" />
        )}

        {actionMessage && (
          <StatusCard variant="success" body={actionMessage} className="dataset-status" />
        )}

        <div className="protocol-actions">
          <button
            type="button"
            className="primary"
            disabled={Boolean(submitting)}
            onClick={() => submitReview("approve")}
          >
            {submitting === "approve" ? "Approving..." : "Approve for training"}
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
            onClick={() => submitReview("reject")}
          >
            {submitting === "reject" ? "Rejecting..." : "Reject"}
          </button>
        </div>
      </div>
    </article>
  );
}

export default function DatasetCaptureReviewPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [unlockSecret, setUnlockSecret] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [secret, setSecret] = useState("");
  const [captures, setCaptures] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const loadCaptures = useCallback(async (captureSecret) => {
    setLoading(true);
    setLoadError("");

    try {
      const res = await fetch("/api/dataset-capture/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: captureSecret, limit: 50 }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setLoadError(data.error || "Unable to load pending captures.");
        setCaptures([]);
        return;
      }

      setCaptures(data.captures || []);
    } catch {
      setLoadError("Unable to reach the review list API.");
      setCaptures([]);
    } finally {
      setLoading(false);
    }
  }, []);

  async function handleUnlock(event) {
    event.preventDefault();
    setUnlockError("");
    setUnlockLoading(true);

    try {
      const res = await fetch("/api/dataset-capture/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: unlockSecret }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setUnlockError(data.error || "Unable to unlock dataset review.");
        return;
      }

      setSecret(unlockSecret);
      setUnlocked(true);
      await loadCaptures(unlockSecret);
    } catch {
      setUnlockError("Unable to reach the dataset capture gate.");
    } finally {
      setUnlockLoading(false);
    }
  }

  function handleReviewed(captureId, action, updatedCapture) {
    if (action === "approve" || action === "reject") {
      setCaptures((prev) => prev.filter((capture) => capture.id !== captureId));
      return;
    }

    if (action === "update_bucket" && updatedCapture) {
      setCaptures((prev) =>
        prev.map((capture) =>
          capture.id === captureId ? { ...capture, ...updatedCapture } : capture
        )
      );
    }
  }

  if (!unlocked) {
    return (
      <PageShell
        narrow
        badge="Private review"
        title="Dataset capture review"
        subtitle="Enter the capture secret to review pending private calibration uploads."
      >
        <GlassPanel title="Access gate">
          <form className="dataset-capture-form" onSubmit={handleUnlock}>
            <label className="dataset-field">
              <span className="dataset-field__label">Capture secret</span>
              <input
                className="dataset-field__input"
                type="password"
                autoComplete="current-password"
                value={unlockSecret}
                onChange={(event) => setUnlockSecret(event.target.value)}
                placeholder="Enter DATASET_CAPTURE_SECRET"
                required
              />
            </label>

            {unlockError && (
              <StatusCard variant="error" body={unlockError} className="dataset-status" />
            )}

            <div className="protocol-actions">
              <button
                type="submit"
                className="primary"
                disabled={unlockLoading || !unlockSecret.trim()}
              >
                {unlockLoading ? "Checking..." : "Continue"}
              </button>
            </div>
          </form>
        </GlassPanel>
      </PageShell>
    );
  }

  return (
    <PageShell
      narrow
      badge="Private review"
      title="Dataset capture review"
      subtitle="Approve or reject pending captures before any training use."
    >
      <GlassPanel
        title="Pending captures"
        subtitle="Only items with approved_for_training=false and rejected=false appear here."
      >
        <p className="dataset-notice">{REVIEW_NOTICE}</p>

        <div className="protocol-actions dataset-review-toolbar">
          <button
            type="button"
            className="secondary"
            disabled={loading}
            onClick={() => loadCaptures(secret)}
          >
            {loading ? "Refreshing..." : "Refresh list"}
          </button>
          <a href="/dataset-capture" className="secondary">
            Back to capture upload
          </a>
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
              secret={secret}
              onReviewed={handleReviewed}
            />
          ))}
        </div>
      </GlassPanel>
    </PageShell>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import DatasetCaptureAuthGate from "../../../components/dataset/DatasetCaptureAuthGate";
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

function CaptureReviewCard({ capture, accessToken, onReviewed }) {
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

  const qualityWarnings =
    capture.quality_warnings ||
    assessCaptureQuality({
      width: capture.width,
      height: capture.height,
      fileSize: capture.file_size,
    });

  async function submitReview(action) {
    setActionError("");
    setActionMessage("");
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
      const data = await res.json();

      if (!res.ok || !data.success) {
        setActionError(data.error || "Review action failed.");
        return;
      }

      const actionLabel =
        action === "approve"
          ? "approved for import (safe gate required before training)"
          : action === "reject"
            ? "rejected"
            : action === "duplicate"
              ? "marked duplicate"
              : action === "low_quality"
                ? "marked low quality"
                : action === "keep_for_regression_only"
                  ? "kept for regression only"
                  : action === "wrong_bucket"
                    ? "bucket corrected"
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
  const [gateLoading, setGateLoading] = useState(true);
  const [gateError, setGateError] = useState("");
  const [gateOpen, setGateOpen] = useState(false);
  const [gateBuckets, setGateBuckets] = useState([]);
  const [showTrainModal, setShowTrainModal] = useState(false);
  const [trainSubmitting, setTrainSubmitting] = useState(false);
  const [trainMessage, setTrainMessage] = useState("");
  const [trainError, setTrainError] = useState("");

  const loadGateStatus = useCallback(async () => {
    setGateLoading(true);
    setGateError("");

    try {
      const res = await fetch("/api/dataset-capture/gate-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getDatasetCaptureAuthHeaders(accessToken),
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setGateError(data.error || "Unable to load training gate status.");
        setGateOpen(false);
        setGateBuckets([]);
        return;
      }

      setGateOpen(Boolean(data.gateOpen));
      setGateBuckets(data.buckets || []);
    } catch {
      setGateError("Unable to reach the training gate API.");
      setGateOpen(false);
      setGateBuckets([]);
    } finally {
      setGateLoading(false);
    }
  }, [accessToken]);

  const loadCaptures = useCallback(async () => {
    setLoading(true);
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
        return;
      }

      setCaptures(data.captures || []);
    } catch {
      setLoadError("Unable to reach the review list API.");
      setCaptures([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    loadCaptures();
    loadGateStatus();
  }, [loadCaptures, loadGateStatus]);

  async function requestTrainCandidate() {
    setTrainSubmitting(true);
    setTrainError("");
    setTrainMessage("");

    try {
      const res = await fetch("/api/dataset-capture/train-candidate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getDatasetCaptureAuthHeaders(accessToken),
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setTrainError(data.error || "Candidate training request failed.");
        if (data.buckets) {
          setGateBuckets(data.buckets);
          setGateOpen(Boolean(data.gateOpen));
        }
        return;
      }

      setTrainMessage(data.message || "Candidate training job created.");
      setShowTrainModal(false);
    } catch {
      setTrainError("Unable to reach the train candidate API.");
    } finally {
      setTrainSubmitting(false);
    }
  }

  function handleReviewed(captureId, action, updatedCapture) {
    if (
      action === "approve" ||
      action === "reject" ||
      action === "duplicate" ||
      action === "low_quality"
    ) {
      setCaptures((prev) => prev.filter((capture) => capture.id !== captureId));
      return;
    }

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
      <GlassPanel
        title="Pending captures"
        subtitle={`Signed in as ${email}. Only pending items appear here.`}
      >
        <p className="dataset-notice">{REVIEW_NOTICE}</p>

        <GlassPanel
          className="dataset-training-panel"
          title="Safe train candidate gate (v0.2)"
          subtitle="Only v0.2 correction buckets count toward this gate. Candidate training runs on the ProofOrigin AI backend only."
        >
          {gateLoading && <LoadingState message="Loading correction gate status..." />}

          {!gateLoading && gateError && (
            <StatusCard variant="error" body={gateError} className="dataset-status" />
          )}

          {!gateLoading && !gateError && (
            <>
              <ul className="dataset-training-gate-list">
                {gateBuckets.map((bucket) => (
                  <li
                    key={bucket.bucket}
                    className={`dataset-training-gate-item ${
                      bucket.met ? "dataset-training-gate-item--met" : ""
                    }`.trim()}
                  >
                    <span>{bucket.label || bucket.bucket}</span>
                    <span className="dataset-training-gate-item__counts">
                      {bucket.current}/{bucket.target}
                    </span>
                    {!bucket.met && (
                      <span className="dataset-training-gate-item__remaining">
                        {bucket.remaining} remaining
                      </span>
                    )}
                    {bucket.met && <ProtocolBadge variant="success">Met</ProtocolBadge>}
                  </li>
                ))}
              </ul>

              <p className="dataset-notice">{DATASET_CAPTURE_EXPANSION_NOTICE}</p>

              <p className="dataset-notice">
                {gateOpen
                  ? "Correction gate open. You may request a candidate training job."
                  : "Correction gate closed. Approve more import-ready images in each bucket before requesting training."}
              </p>

              {trainMessage && (
                <StatusCard variant="success" body={trainMessage} className="dataset-status" />
              )}

              {trainError && (
                <StatusCard variant="error" body={trainError} className="dataset-status" />
              )}

              <div className="protocol-actions">
                <button
                  type="button"
                  className="primary"
                  disabled={!gateOpen || trainSubmitting}
                  onClick={() => setShowTrainModal(true)}
                >
                  Train Candidate Model
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={gateLoading}
                  onClick={loadGateStatus}
                >
                  Refresh gate
                </button>
              </div>
            </>
          )}
        </GlassPanel>

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
              onReviewed={handleReviewed}
            />
          ))}
        </div>
      </GlassPanel>

      {showTrainModal && (
        <div className="dataset-training-modal-backdrop" role="presentation">
          <div
            className="dataset-training-modal glass-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="train-candidate-title"
          >
            <h3 id="train-candidate-title" className="dataset-training-modal__title">
              Request candidate training
            </h3>
            <p className="dataset-training-modal__body">
              This creates a candidate training job only. It will not replace production.
              ProofOrigin AI backend will pull the job and run safe_auto_train.py when ready.
            </p>
            <div className="protocol-actions">
              <button
                type="button"
                className="primary"
                disabled={trainSubmitting}
                onClick={requestTrainCandidate}
              >
                {trainSubmitting ? "Creating job..." : "Create training job"}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={trainSubmitting}
                onClick={() => setShowTrainModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
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

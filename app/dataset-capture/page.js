"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DatasetCaptureAuthGate from "../../components/dataset/DatasetCaptureAuthGate";
import GlassPanel from "../../components/protocol/GlassPanel";
import PageShell from "../../components/protocol/PageShell";
import ProtocolBadge from "../../components/protocol/ProtocolBadge";
import StatusCard from "../../components/protocol/StatusCard";
import { getDatasetCaptureAuthHeaders } from "../lib/datasetCaptureClient";
import { DATASET_CAPTURE_BUCKET_GROUPS, DATASET_CAPTURE_BUCKETS, DATASET_CAPTURE_EXPANSION_NOTICE, DATASET_CAPTURE_MAX_BATCH } from "../lib/datasetCapture";

const PRIVATE_NOTICE =
  "Uploads are stored privately for ProofOrigin calibration and are not used for training until manually approved.";

const STATUS_LABELS = {
  pending: "Pending",
  uploading: "Uploading",
  uploaded: "Uploaded",
  duplicate: "Duplicate skipped",
  failed: "Failed",
};

function createQueueItem(file, index) {
  return {
    key: `${file.name}-${file.size}-${file.lastModified}-${index}`,
    file,
    previewUrl: URL.createObjectURL(file),
    status: "pending",
    error: "",
    captureId: "",
    suggestedBucket: "",
  };
}

function DatasetCaptureUploadPanel({ accessToken, email, onSignOut }) {
  const [selectedBucket, setSelectedBucket] = useState(
    DATASET_CAPTURE_BUCKETS[0].value
  );
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);
  const [queue, setQueue] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [batchError, setBatchError] = useState("");
  const [batchSummary, setBatchSummary] = useState("");
  const queueRef = useRef(queue);
  queueRef.current = queue;

  const selectedCount = queue.length;
  const uploadedCount = queue.filter((item) => item.status === "uploaded").length;
  const failedCount = queue.filter((item) => item.status === "failed").length;

  useEffect(() => {
    return () => {
      queueRef.current.forEach((item) => {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
    };
  }, []);

  const canUpload =
    !uploading && queue.length > 0 && consent && selectedBucket && accessToken;

  function handleFileSelection(event) {
    const picked = Array.from(event.target.files || []);
    event.target.value = "";

    setBatchError("");
    setBatchSummary("");

    if (!picked.length) return;

    const nonImages = picked.filter(
      (file) =>
        !file.type.startsWith("image/") &&
        !/\.(jpe?g|png|gif|webp|heic|heif|bmp|tif?f|avif)$/i.test(file.name)
    );

    if (nonImages.length) {
      setBatchError("Only image files are accepted. Remove non-image files and try again.");
      return;
    }

    if (picked.length > DATASET_CAPTURE_MAX_BATCH) {
      setBatchError(
        `You selected ${picked.length} files. Please upload at most ${DATASET_CAPTURE_MAX_BATCH} images per batch.`
      );
      return;
    }

    queue.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });

    setQueue(picked.map((file, index) => createQueueItem(file, index)));
  }

  function updateQueueItem(key, patch) {
    setQueue((prev) =>
      prev.map((item) => (item.key === key ? { ...item, ...patch } : item))
    );
  }

  async function classifyFile(file) {
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/dataset-capture/classify", {
        method: "POST",
        headers: getDatasetCaptureAuthHeaders(accessToken),
        body: formData,
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        return { suggestedBucket: "", visionNotes: "" };
      }

      const visionNotes = data.reason
        ? `[${data.confidence || "unknown"} confidence] ${data.reason}`
        : data.note || "";

      return {
        suggestedBucket: data.suggested_bucket || "",
        visionNotes,
      };
    } catch {
      return { suggestedBucket: "", visionNotes: "" };
    }
  }

  async function uploadFile(item) {
    const classification = await classifyFile(item.file);

    const formData = new FormData();
    formData.append("file", item.file);
    formData.append("selected_bucket", selectedBucket);
    formData.append("notes", notes);
    formData.append("consent", "true");
    if (classification.suggestedBucket) {
      formData.append("suggested_bucket", classification.suggestedBucket);
    }
    if (classification.visionNotes) {
      formData.append("vision_notes", classification.visionNotes);
    }

    const res = await fetch("/api/dataset-capture/upload", {
      method: "POST",
      headers: getDatasetCaptureAuthHeaders(accessToken),
      body: formData,
    });

    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error("Upload response was invalid.");
    }

    if (!res.ok || (!data.success && !data.duplicate)) {
      throw new Error(data.error || "Upload failed.");
    }

    if (data.duplicate) {
      return {
        captureId: data.existing?.id || "",
        suggestedBucket: data.existing?.suggested_bucket || "",
        duplicate: true,
        duplicateMessage: data.message || "Duplicate image skipped — already captured.",
        existing: data.existing,
      };
    }

    return {
      captureId: data.id,
      suggestedBucket:
        data.suggested_bucket || classification.suggestedBucket || "",
      duplicate: false,
      qualityWarnings: data.quality_warnings || [],
    };
  }

  async function handleBatchUpload(event) {
    event.preventDefault();

    if (!canUpload) return;

    setUploading(true);
    setBatchError("");
    setBatchSummary("");

    let uploaded = 0;
    let failed = 0;
    let duplicates = 0;

    for (const item of queue) {
      if (item.status === "uploaded" || item.status === "duplicate") {
        if (item.status === "uploaded") uploaded += 1;
        if (item.status === "duplicate") duplicates += 1;
        continue;
      }

      updateQueueItem(item.key, { status: "uploading", error: "" });

      try {
        const result = await uploadFile(item);
        if (result.duplicate) {
          updateQueueItem(item.key, {
            status: "duplicate",
            captureId: result.captureId,
            suggestedBucket: result.suggestedBucket,
            duplicateMessage: result.duplicateMessage,
            existing: result.existing,
            error: "",
          });
          duplicates += 1;
        } else {
          updateQueueItem(item.key, {
            status: "uploaded",
            captureId: result.captureId,
            suggestedBucket: result.suggestedBucket,
            qualityWarnings: result.qualityWarnings,
            error: "",
          });
          uploaded += 1;
        }
      } catch (error) {
        updateQueueItem(item.key, {
          status: "failed",
          error: error.message || "Upload failed.",
        });
        failed += 1;
      }
    }

    setUploading(false);
    setBatchSummary(
      `Batch complete: ${uploaded} uploaded, ${duplicates} duplicate${duplicates === 1 ? "" : "s"} skipped, ${failed} failed, ${queue.length} total.`
    );
  }

  const previewItems = useMemo(
    () =>
      queue.map((item) => ({
        ...item,
        statusLabel: STATUS_LABELS[item.status] || item.status,
      })),
    [queue]
  );

  return (
    <PageShell
      narrow
      badge="Private calibration"
      title="Dataset capture"
      subtitle="Upload up to 10 private calibration images in one batch."
    >
      <GlassPanel
        title="Private batch upload"
        subtitle={`Signed in as ${email}. Images stay in a private Supabase bucket.`}
      >
        <p className="dataset-notice">{PRIVATE_NOTICE}</p>

        <form className="dataset-capture-form" onSubmit={handleBatchUpload}>
          <label className="dataset-field">
            <span className="dataset-field__label">Images</span>
            <input
              className="dataset-field__file"
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelection}
              disabled={uploading}
            />
            <span className="dataset-field__hint">
              Select up to {DATASET_CAPTURE_MAX_BATCH} images (.jpg, .png, .heic, etc.)
            </span>
          </label>

          {selectedCount > 0 && (
            <p className="dataset-count">
              <ProtocolBadge>{selectedCount} selected</ProtocolBadge>
              {uploadedCount > 0 && (
                <ProtocolBadge variant="success">{uploadedCount} uploaded</ProtocolBadge>
              )}
              {failedCount > 0 && (
                <ProtocolBadge variant="danger">{failedCount} failed</ProtocolBadge>
              )}
            </p>
          )}

          {previewItems.length > 0 && (
            <div className="dataset-preview-grid" aria-label="Selected image previews">
              {previewItems.map((item) => (
                <figure
                  key={item.key}
                  className={`dataset-preview-item dataset-preview-item--${item.status}`}
                >
                  <img src={item.previewUrl} alt={item.file.name} />
                  <figcaption>
                    <span className="dataset-preview-item__name">{item.file.name}</span>
                    <span className={`dataset-file-status dataset-file-status--${item.status}`}>
                      {item.statusLabel}
                    </span>
                    {item.suggestedBucket && item.suggestedBucket !== selectedBucket && (
                      <span className="dataset-preview-item__suggestion">
                        Suggested: {item.suggestedBucket}
                      </span>
                    )}
                    {item.error && (
                      <span className="dataset-preview-item__error">{item.error}</span>
                    )}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}

          <label className="dataset-field">
            <span className="dataset-field__label">Selected bucket</span>
            <select
              className="dataset-field__input"
              value={selectedBucket}
              onChange={(event) => setSelectedBucket(event.target.value)}
              disabled={uploading}
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
            <span className="dataset-field__label">Notes</span>
            <textarea
              className="dataset-field__textarea"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional capture notes (lighting, device, scenario)"
              disabled={uploading}
            />
          </label>

          <label className="dataset-checkbox">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              disabled={uploading}
            />
            <span>
              I consent to store these images privately for ProofOrigin calibration review.
            </span>
          </label>

          {batchError && (
            <StatusCard variant="error" body={batchError} className="dataset-status" />
          )}

          {batchSummary && (
            <StatusCard variant="success" body={batchSummary} className="dataset-status" />
          )}

          <div className="protocol-actions">
            <button type="submit" className="primary" disabled={!canUpload}>
              {uploading
                ? "Uploading batch..."
                : `Upload ${selectedCount || 0} image${selectedCount === 1 ? "" : "s"}`}
            </button>
            <a href="/dataset-capture/review" className="secondary">
              Review pending captures
            </a>
            <button type="button" className="secondary" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </form>
      </GlassPanel>
    </PageShell>
  );
}

export default function DatasetCapturePage() {
  return (
    <DatasetCaptureAuthGate
      badge="Private calibration"
      title="Dataset capture"
      subtitle="Approved admins only."
    >
      {(auth) => (
        <DatasetCaptureUploadPanel
          accessToken={auth.accessToken}
          email={auth.email}
          onSignOut={auth.onSignOut}
        />
      )}
    </DatasetCaptureAuthGate>
  );
}

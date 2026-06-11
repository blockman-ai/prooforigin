export const DATASET_CAPTURE_BUCKETS = [
  { value: "real_pet_photos", label: "Real pet photos" },
  { value: "phone_screen_photos", label: "Phone screen photos" },
  { value: "indoor_soft_light", label: "Indoor soft light" },
  { value: "screenshots", label: "Screenshots" },
  { value: "ai_controls", label: "AI controls" },
];

export const DATASET_CAPTURE_BUCKET_VALUES = DATASET_CAPTURE_BUCKETS.map(
  (bucket) => bucket.value
);

export const DATASET_CAPTURE_MAX_BATCH = 10;
export const DATASET_CAPTURE_PRIVATE_BUCKET = "po-private-dataset";
export const DATASET_CAPTURE_TABLE = "private_dataset_captures";
export const DATASET_CAPTURE_SOURCE = "dataset_capture_ui";
export const DATASET_CAPTURE_SIGNED_URL_TTL_SECONDS = 120;

export const DATASET_CAPTURE_REVIEW_ACTIONS = {
  APPROVE: "approve",
  REJECT: "reject",
  UPDATE_BUCKET: "update_bucket",
  DUPLICATE: "duplicate",
  WRONG_BUCKET: "wrong_bucket",
  LOW_QUALITY: "low_quality",
  KEEP_FOR_REGRESSION: "keep_for_regression_only",
};

export const SAFE_TRAINING_NOTICE =
  "Will be used for training only after the safe training gate passes (correction targets met + candidate model promotion gates).";

export const DATASET_CAPTURE_LIST_FIELDS = [
  "id",
  "original_filename",
  "sha256",
  "selected_bucket",
  "suggested_bucket",
  "human_verified_label",
  "source",
  "consent_status",
  "notes",
  "vision_notes",
  "width",
  "height",
  "file_size",
  "approved_for_training",
  "rejected",
  "review_status",
  "ready_for_import",
  "is_duplicate",
  "duplicate_of_id",
  "keep_for_regression_only",
  "quality_warnings",
  "reviewer_notes",
  "reviewed_at",
  "created_at",
].join(", ");

export function isDatasetCaptureBucket(value) {
  return DATASET_CAPTURE_BUCKET_VALUES.includes(value);
}

export function formatBytes(bytes) {
  if (bytes == null || Number.isNaN(Number(bytes))) return "Unknown";
  const value = Number(bytes);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function sanitizeStorageFilename(name) {
  const base = (name || "capture.jpg").split(/[/\\]/).pop() || "capture.jpg";
  return base.replace(/[^\w.\-()+ ]/g, "_").slice(0, 180);
}

export function buildDatasetStoragePath(selectedBucket, captureId, originalFilename) {
  const datePrefix = new Date().toISOString().slice(0, 7);
  const safeName = sanitizeStorageFilename(originalFilename);
  return `${selectedBucket}/${datePrefix}/${captureId}/${safeName}`;
}

export function isImageUploadFile(file) {
  if (!file || typeof file !== "object") return false;
  if (file.type && file.type.startsWith("image/")) return true;

  const lowerName = (file.name || "").toLowerCase();
  return /\.(jpe?g|png|gif|webp|heic|heif|bmp|tif?f|avif)$/i.test(lowerName);
}

const MIN_QUALITY_WIDTH = 320;
const MIN_QUALITY_HEIGHT = 320;
const MIN_QUALITY_BYTES = 12 * 1024;

export function assessCaptureQuality({ width, height, fileSize }) {
  const warnings = [];
  if (width != null && height != null) {
    if (width < MIN_QUALITY_WIDTH || height < MIN_QUALITY_HEIGHT) {
      warnings.push("Image may be too small for reliable training.");
    }
  }
  if (fileSize != null && Number(fileSize) < MIN_QUALITY_BYTES) {
    warnings.push("File size is very small; verify image is not corrupted.");
  }
  return warnings;
}

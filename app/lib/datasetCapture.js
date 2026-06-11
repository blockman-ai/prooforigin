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
};

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
  "reviewer_notes",
  "reviewed_at",
  "created_at",
].join(", ");

export function isDatasetCaptureBucket(value) {
  return DATASET_CAPTURE_BUCKET_VALUES.includes(value);
}

export function validateDatasetCaptureSecret(secret) {
  const expected = process.env.DATASET_CAPTURE_SECRET?.trim();

  if (!expected) {
    return {
      ok: false,
      error: "Dataset capture is not configured on this deployment.",
    };
  }

  if (!secret || typeof secret !== "string") {
    return { ok: false, error: "Capture secret is required." };
  }

  if (secret.trim() !== expected) {
    return { ok: false, error: "Invalid capture secret." };
  }

  return { ok: true };
}

export function parseDatasetCaptureRequestBody(body) {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid request body." };
  }

  const secretValidation = validateDatasetCaptureSecret(body.secret);
  if (!secretValidation.ok) {
    return secretValidation;
  }

  return { ok: true, secret: body.secret.trim() };
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

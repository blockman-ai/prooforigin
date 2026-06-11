export const DATASET_CAPTURE_V02_BUCKETS = [
  { value: "real_pet_photos", label: "Real pet photos", gateTarget: 50 },
  { value: "phone_screen_photos", label: "Phone screen photos", gateTarget: 25 },
  { value: "indoor_soft_light", label: "Indoor soft light", gateTarget: 25 },
  { value: "screenshots", label: "Screenshots", gateTarget: 25 },
  { value: "ai_controls", label: "AI controls", gateTarget: 25 },
];

export const DATASET_CAPTURE_EXPANSION_BUCKETS = [
  { value: "real_people_photos", label: "Real people photos" },
  { value: "real_document_photos", label: "Real document photos" },
  { value: "real_food_photos", label: "Real food photos" },
  { value: "real_vehicle_photos", label: "Real vehicle photos" },
  { value: "real_nature_sky", label: "Real nature / sky" },
  { value: "real_low_light", label: "Real low light" },
  { value: "real_reflections_glass", label: "Real reflections / glass" },
  { value: "photo_of_photo", label: "Photo of photo" },
  { value: "social_media_screenshots", label: "Social media screenshots" },
  { value: "edited_real", label: "Edited real" },
  { value: "ai_generated_people", label: "AI generated people" },
  { value: "ai_generated_objects", label: "AI generated objects" },
  { value: "ai_generated_art", label: "AI generated art" },
  { value: "ai_generated_screenshot_like", label: "AI generated screenshot-like" },
  { value: "uncertain_mixed", label: "Uncertain / mixed" },
];

export const DATASET_CAPTURE_BUCKETS = [
  ...DATASET_CAPTURE_V02_BUCKETS,
  ...DATASET_CAPTURE_EXPANSION_BUCKETS,
];

export const DATASET_CAPTURE_BUCKET_GROUPS = [
  {
    label: "v0.2 correction buckets (count toward training gate)",
    buckets: DATASET_CAPTURE_V02_BUCKETS,
  },
  {
    label: "General dataset expansion",
    buckets: DATASET_CAPTURE_EXPANSION_BUCKETS,
  },
];

export const DATASET_CAPTURE_V02_GATE_BUCKET_VALUES = DATASET_CAPTURE_V02_BUCKETS.map(
  (bucket) => bucket.value
);

export const DATASET_CAPTURE_BUCKET_VALUES = DATASET_CAPTURE_BUCKETS.map(
  (bucket) => bucket.value
);

export const DATASET_CAPTURE_EXPANSION_NOTICE =
  "Some buckets are for general dataset expansion and may not count toward the current v0.2 training gate.";

export const DATASET_CAPTURE_BUCKET_GUIDE = {
  real_pet_photos: "Natural photos of real pets or animals.",
  phone_screen_photos: "Photos taken of a phone screen showing content.",
  indoor_soft_light: "Indoor scenes with soft or diffuse lighting.",
  screenshots: "Direct device screenshots or screen captures.",
  ai_controls: "Known AI-generated or synthetic control images.",
  real_people_photos: "Natural photos of real people.",
  real_document_photos: "Photos of documents, receipts, forms, or paper.",
  real_food_photos: "Photos of real food or meals.",
  real_vehicle_photos: "Photos of cars, trucks, or other vehicles.",
  real_nature_sky: "Outdoor nature scenes, landscapes, or sky.",
  real_low_light: "Real photos captured in low-light conditions.",
  real_reflections_glass: "Scenes with reflections, glass, mirrors, or glare.",
  photo_of_photo: "A photo taken of another photo or print.",
  social_media_screenshots: "Screenshots from social media apps or feeds.",
  edited_real: "Real-origin images with visible editing or filters.",
  ai_generated_people: "Synthetic or AI-generated images of people.",
  ai_generated_objects: "Synthetic or AI-generated objects or products.",
  ai_generated_art: "Synthetic or AI-generated art or illustration.",
  ai_generated_screenshot_like: "AI images that resemble screenshots or UI.",
  uncertain_mixed: "Mixed, ambiguous, or uncertain category.",
};

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

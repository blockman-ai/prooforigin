import {
  DATASET_CAPTURE_V02_BUCKETS,
  isDatasetCaptureBucket,
} from "./datasetCapture";

export const DATASET_TRAINING_JOBS_TABLE = "dataset_training_jobs";

export const TRAINING_JOB_STATUSES = {
  REQUESTED: "requested",
  BLOCKED_GATE_CLOSED: "blocked_gate_closed",
  RUNNING: "running",
  FAILED: "failed",
  PASSED_CANDIDATE: "passed_candidate",
  REJECTED_CANDIDATE: "rejected_candidate",
  PROMOTION_READY: "promotion_ready",
};

export const TRAINING_GATE_TARGETS = Object.fromEntries(
  DATASET_CAPTURE_V02_BUCKETS.map((bucket) => [bucket.value, bucket.gateTarget])
);
export function isTrainableCapture(row) {
  if (!row || typeof row !== "object") {
    return false;
  }

  const bucket = row.human_verified_label || row.selected_bucket;

  return (
    row.approved_for_training === true &&
    row.ready_for_import === true &&
    row.rejected !== true &&
    row.is_duplicate !== true &&
    row.keep_for_regression_only !== true &&
    isDatasetCaptureBucket(bucket)
  );
}

export function countTrainableByBucket(rows) {
  const seenSha = new Set();
  const counts = Object.fromEntries(
    DATASET_CAPTURE_V02_BUCKETS.map((bucket) => [bucket.value, 0])
  );

  for (const row of rows || []) {
    if (!isTrainableCapture(row)) {
      continue;
    }

    const bucket = row.human_verified_label || row.selected_bucket;
    if (!TRAINING_GATE_TARGETS[bucket]) {
      continue;
    }

    const shaKey = `${bucket}:${row.sha256 || row.id}`;

    if (seenSha.has(shaKey)) {
      continue;
    }

    seenSha.add(shaKey);
    counts[bucket] += 1;
  }

  return counts;
}

export function buildTrainingGateStatus(counts) {
  const buckets = DATASET_CAPTURE_V02_BUCKETS.map(({ value, label }) => {    const current = counts[value] || 0;
    const target = TRAINING_GATE_TARGETS[value];
    const remaining = Math.max(0, target - current);

    return {
      bucket: value,
      label,
      current,
      target,
      remaining,
      met: current >= target,
    };
  });

  return {
    gateOpen: buckets.every((bucket) => bucket.met),
    buckets,
  };
}

export function formatGateBucketLine(bucketStatus) {
  return `${bucketStatus.bucket} ${bucketStatus.current}/${bucketStatus.target}`;
}

import {
  DATASET_CAPTURE_EXPANSION_BUCKETS,
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

export const TRAINING_GATE_OVERALL_TARGET = DATASET_CAPTURE_V02_BUCKETS.reduce(
  (sum, bucket) => sum + bucket.gateTarget,
  0
);

export function isImportReadyCapture(row) {
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

export function isTrainableCapture(row) {
  if (!row || typeof row !== "object") {
    return false;
  }

  const bucket = row.human_verified_label || row.selected_bucket;

  return isImportReadyCapture(row) && Boolean(TRAINING_GATE_TARGETS[bucket]);
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

export function countImportReadyByBucket(rows, bucketDefinitions) {
  const allowed = new Set(bucketDefinitions.map((bucket) => bucket.value));
  const counts = Object.fromEntries(
    bucketDefinitions.map((bucket) => [bucket.value, 0])
  );
  const seenSha = new Set();

  for (const row of rows || []) {
    if (!isImportReadyCapture(row)) {
      continue;
    }

    const bucket = row.human_verified_label || row.selected_bucket;
    if (!allowed.has(bucket)) {
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

export function buildOverallCorrectionProgress(v02Counts) {
  const current = DATASET_CAPTURE_V02_BUCKETS.reduce(
    (sum, bucket) => sum + (v02Counts[bucket.value] || 0),
    0
  );
  const target = TRAINING_GATE_OVERALL_TARGET;
  const remaining = Math.max(0, target - current);
  const percent =
    target > 0 ? Number(Math.min(100, (current / target) * 100).toFixed(1)) : 0;

  return { current, target, remaining, percent };
}

export function computeDatasetTotals(rows) {
  let approved = 0;
  let pending = 0;
  let rejected = 0;
  let regressionOnly = 0;

  for (const row of rows || []) {
    if (row.keep_for_regression_only === true) {
      regressionOnly += 1;
    }

    if (row.rejected === true) {
      rejected += 1;
    }

    if (
      row.approved_for_training === true &&
      row.ready_for_import === true &&
      row.rejected !== true &&
      row.is_duplicate !== true &&
      row.keep_for_regression_only !== true
    ) {
      approved += 1;
    }

    if (
      row.approved_for_training !== true &&
      row.rejected !== true &&
      row.is_duplicate !== true &&
      row.keep_for_regression_only !== true
    ) {
      pending += 1;
    }
  }

  return {
    approved,
    pending,
    rejected,
    regressionOnly,
    total: rows?.length || 0,
  };
}

export function buildExpansionBucketStats(rows) {
  const counts = countImportReadyByBucket(rows, DATASET_CAPTURE_EXPANSION_BUCKETS);

  return DATASET_CAPTURE_EXPANSION_BUCKETS.map(({ value, label }) => ({
    bucket: value,
    label,
    current: counts[value] || 0,
  }));
}

export function buildTrainingGateStatus(counts) {
  const buckets = DATASET_CAPTURE_V02_BUCKETS.map(({ value, label }) => {
    const current = counts[value] || 0;
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

function parseTimestamp(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfUtcDay(date) {
  const next = new Date(date);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

function startOfUtcWeek(date) {
  const next = startOfUtcDay(date);
  const weekday = next.getUTCDay();
  const diff = weekday === 0 ? 6 : weekday - 1;
  next.setUTCDate(next.getUTCDate() - diff);
  return next;
}

function startOfUtcMonth(date) {
  const next = startOfUtcDay(date);
  next.setUTCDate(1);
  return next;
}

function formatUtcDayKey(date) {
  return date.toISOString().slice(0, 10);
}

export function buildCaptureTimeline(rows, now = new Date()) {
  const dayStart = startOfUtcDay(now).getTime();
  const weekStart = startOfUtcWeek(now).getTime();
  const monthStart = startOfUtcMonth(now).getTime();
  let today = 0;
  let thisWeek = 0;
  let thisMonth = 0;

  for (const row of rows || []) {
    const createdAt = parseTimestamp(row.created_at);
    if (!createdAt) {
      continue;
    }

    const createdMs = createdAt.getTime();
    if (createdMs >= dayStart) {
      today += 1;
    }
    if (createdMs >= weekStart) {
      thisWeek += 1;
    }
    if (createdMs >= monthStart) {
      thisMonth += 1;
    }
  }

  return { today, thisWeek, thisMonth };
}

export function buildCorrectionHistory(rows) {
  const totals = computeDatasetTotals(rows || []);
  const totalDuplicatesSkipped = (rows || []).filter(
    (row) => row.is_duplicate === true || row.review_status === "duplicate"
  ).length;

  const trainableEvents = [];

  for (const row of rows || []) {
    if (!isTrainableCapture(row)) {
      continue;
    }

    const reviewedAt = parseTimestamp(row.reviewed_at || row.created_at);
    if (!reviewedAt) {
      continue;
    }

    trainableEvents.push({
      at: reviewedAt,
      bucket: row.human_verified_label || row.selected_bucket,
      sha256: row.sha256 || row.id,
    });
  }

  trainableEvents.sort((left, right) => left.at - right.at);

  const seenSha = new Set();
  const dailyCounts = new Map();

  for (const event of trainableEvents) {
    const shaKey = `${event.bucket}:${event.sha256}`;
    if (seenSha.has(shaKey)) {
      continue;
    }

    seenSha.add(shaKey);
    const dayKey = formatUtcDayKey(event.at);
    dailyCounts.set(dayKey, (dailyCounts.get(dayKey) || 0) + 1);
  }

  const sortedDays = [...dailyCounts.keys()].sort();
  let cumulative = 0;
  const progressOverTime = sortedDays.map((day) => {
    cumulative += dailyCounts.get(day) || 0;
    const percent =
      TRAINING_GATE_OVERALL_TARGET > 0
        ? Number(
            Math.min(100, (cumulative / TRAINING_GATE_OVERALL_TARGET) * 100).toFixed(1)
          )
        : 0;

    return {
      date: day,
      approvedV02: cumulative,
      target: TRAINING_GATE_OVERALL_TARGET,
      percent,
    };
  });

  return {
    totalApproved: totals.approved,
    totalRejected: totals.rejected,
    totalDuplicatesSkipped,
    progressOverTime: progressOverTime.slice(-14),
  };
}

const TRAINED_JOB_STATUSES = new Set([
  TRAINING_JOB_STATUSES.RUNNING,
  TRAINING_JOB_STATUSES.FAILED,
  TRAINING_JOB_STATUSES.PASSED_CANDIDATE,
  TRAINING_JOB_STATUSES.REJECTED_CANDIDATE,
  TRAINING_JOB_STATUSES.PROMOTION_READY,
]);

const PASSED_JOB_STATUSES = new Set([
  TRAINING_JOB_STATUSES.PASSED_CANDIDATE,
  TRAINING_JOB_STATUSES.PROMOTION_READY,
]);

const FAILED_JOB_STATUSES = new Set([
  TRAINING_JOB_STATUSES.FAILED,
  TRAINING_JOB_STATUSES.REJECTED_CANDIDATE,
]);

function summarizeTrainingJob(job) {
  if (!job) {
    return null;
  }

  return {
    id: job.id,
    status: job.status,
    requestedAt: job.requested_at,
    startedAt: job.started_at,
    finishedAt: job.finished_at,
    candidateModelPath: job.candidate_model_path,
    resultReportPath: job.result_report_path,
    error: job.error,
  };
}

function jobActivityTimestamp(job) {
  return (
    parseTimestamp(job?.finished_at) ||
    parseTimestamp(job?.started_at) ||
    parseTimestamp(job?.requested_at)
  );
}

export function buildTrainingHistory(jobs) {
  const list = [...(jobs || [])].sort(
    (left, right) =>
      (jobActivityTimestamp(right)?.getTime() || 0) -
      (jobActivityTimestamp(left)?.getTime() || 0)
  );

  const candidateModelsTrained = list.filter(
    (job) => job.started_at || TRAINED_JOB_STATUSES.has(job.status)
  ).length;
  const passedCandidates = list.filter((job) =>
    PASSED_JOB_STATUSES.has(job.status)
  ).length;
  const failedCandidates = list.filter((job) =>
    FAILED_JOB_STATUSES.has(job.status)
  ).length;

  const lastTrainingRun = summarizeTrainingJob(
    list.find((job) => job.started_at || job.finished_at) || null
  );

  const lastPromotionReady = summarizeTrainingJob(
    list.find((job) => job.status === TRAINING_JOB_STATUSES.PROMOTION_READY) || null
  );

  return {
    candidateModelsTrained,
    passedCandidates,
    failedCandidates,
    lastTrainingRun,
    lastPromotionReady,
  };
}

export function extractModelVersionLabel(modelPath) {
  if (!modelPath || typeof modelPath !== "string") {
    return null;
  }

  const segment = modelPath.split(/[/\\]/).pop() || modelPath;
  return segment.replace(/\.[^.]+$/, "") || segment;
}

export function buildCandidateModelSummary(jobs, productionModelVersion) {
  const list = [...(jobs || [])].sort(
    (left, right) =>
      (jobActivityTimestamp(right)?.getTime() || 0) -
      (jobActivityTimestamp(left)?.getTime() || 0)
  );

  const latestCandidateJob =
    list.find((job) => job.candidate_model_path) ||
    list.find((job) =>
      [
        TRAINING_JOB_STATUSES.RUNNING,
        TRAINING_JOB_STATUSES.PASSED_CANDIDATE,
        TRAINING_JOB_STATUSES.REJECTED_CANDIDATE,
        TRAINING_JOB_STATUSES.PROMOTION_READY,
        TRAINING_JOB_STATUSES.FAILED,
      ].includes(job.status)
    ) ||
    list[0] ||
    null;

  return {
    productionModelVersion: productionModelVersion || "Not reported",
    latestCandidateVersion: latestCandidateJob
      ? extractModelVersionLabel(latestCandidateJob.candidate_model_path) ||
        `job-${String(latestCandidateJob.id).slice(0, 8)}`
      : "None yet",
    candidateStatus: latestCandidateJob?.status || "none",
    latestCandidateJob: summarizeTrainingJob(latestCandidateJob),
  };
}

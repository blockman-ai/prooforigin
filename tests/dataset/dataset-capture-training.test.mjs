import assert from "node:assert/strict";
import { test } from "node:test";
import { register } from "node:module";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const {
  TRAINING_GATE_OVERALL_TARGET,
  buildCorrectionHistory,
  buildExpansionBucketStats,
  buildOverallCorrectionProgress,
  countImportReadyByBucket,
  countTrainableByBucket,
  isImportReadyCapture,
  isTrainableCapture,
} = await import("../../app/lib/datasetCaptureTraining.js");
const { DATASET_CAPTURE_EXPANSION_BUCKETS } = await import("../../app/lib/datasetCapture.js");

function captureRow(overrides = {}) {
  return {
    id: "capture-1",
    sha256: "sha256-aaa",
    selected_bucket: "real_pet_photos",
    approved_for_training: true,
    ready_for_import: true,
    rejected: false,
    is_duplicate: false,
    keep_for_regression_only: false,
    created_at: "2026-06-10T12:00:00.000Z",
    reviewed_at: "2026-06-10T12:00:00.000Z",
    ...overrides,
  };
}

test("v0.2 bucket is import-ready and trainable when approved", () => {
  const row = captureRow();

  assert.equal(isImportReadyCapture(row), true);
  assert.equal(isTrainableCapture(row), true);
});

test("expansion bucket is import-ready but not trainable", () => {
  const row = captureRow({
    selected_bucket: "real_people_photos",
    sha256: "sha256-expansion",
  });

  assert.equal(isImportReadyCapture(row), true);
  assert.equal(isTrainableCapture(row), false);
});

test("rejected duplicate and regression-only rows are excluded", () => {
  const rejected = captureRow({ rejected: true });
  const duplicate = captureRow({ is_duplicate: true, sha256: "sha256-dup" });
  const regressionOnly = captureRow({
    keep_for_regression_only: true,
    sha256: "sha256-regression",
  });

  for (const row of [rejected, duplicate, regressionOnly]) {
    assert.equal(isImportReadyCapture(row), false, JSON.stringify(row));
    assert.equal(isTrainableCapture(row), false, JSON.stringify(row));
  }
});

test("countTrainableByBucket dedupes by bucket and sha256", () => {
  const rows = [
    captureRow({ id: "capture-a", sha256: "sha256-shared" }),
    captureRow({ id: "capture-b", sha256: "sha256-shared" }),
    captureRow({
      id: "capture-c",
      sha256: "sha256-other",
      selected_bucket: "phone_screen_photos",
    }),
  ];

  const counts = countTrainableByBucket(rows);

  assert.equal(counts.real_pet_photos, 1);
  assert.equal(counts.phone_screen_photos, 1);
});

test("buildOverallCorrectionProgress computes target remaining and percent", () => {
  const progress = buildOverallCorrectionProgress({
    real_pet_photos: 25,
    phone_screen_photos: 25,
  });

  assert.equal(progress.current, 50);
  assert.equal(progress.target, TRAINING_GATE_OVERALL_TARGET);
  assert.equal(progress.remaining, TRAINING_GATE_OVERALL_TARGET - 50);
  assert.equal(progress.percent, Number(((50 / TRAINING_GATE_OVERALL_TARGET) * 100).toFixed(1)));
});

test("expansion stats stay separate from v0.2 gate counts", () => {
  const rows = [
    captureRow({ sha256: "sha256-v02", selected_bucket: "real_pet_photos" }),
    captureRow({
      sha256: "sha256-expansion",
      selected_bucket: "real_people_photos",
    }),
  ];

  const v02Counts = countTrainableByBucket(rows);
  const expansionStats = buildExpansionBucketStats(rows);
  const expansionCounts = countImportReadyByBucket(rows, DATASET_CAPTURE_EXPANSION_BUCKETS);

  assert.equal(v02Counts.real_pet_photos, 1);
  assert.equal(v02Counts.real_people_photos, undefined);
  assert.equal(expansionCounts.real_people_photos, 1);
  assert.equal(
    expansionStats.find((bucket) => bucket.bucket === "real_people_photos")?.current,
    1
  );
  assert.equal(
    expansionStats.some((bucket) => bucket.bucket === "real_pet_photos"),
    false
  );
});

test("buildCorrectionHistory tracks v0.2 trainable progress only", () => {
  const history = buildCorrectionHistory([
    captureRow({
      id: "expansion-only",
      sha256: "sha256-expansion-history",
      selected_bucket: "edited_real",
      reviewed_at: "2026-06-01T10:00:00.000Z",
    }),
    captureRow({
      id: "v02-day-one",
      sha256: "sha256-v02-day-one",
      selected_bucket: "real_pet_photos",
      reviewed_at: "2026-06-02T10:00:00.000Z",
    }),
    captureRow({
      id: "v02-day-two",
      sha256: "sha256-v02-day-two",
      selected_bucket: "phone_screen_photos",
      reviewed_at: "2026-06-03T10:00:00.000Z",
    }),
  ]);

  assert.equal(history.totalApproved, 3);
  assert.equal(history.progressOverTime.length, 2);
  assert.deepEqual(
    history.progressOverTime.map((point) => point.approvedV02),
    [1, 2]
  );
  assert.equal(history.progressOverTime[0].date, "2026-06-02");
  assert.equal(history.progressOverTime[1].date, "2026-06-03");
});

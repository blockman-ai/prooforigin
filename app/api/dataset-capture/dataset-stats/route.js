import { NextResponse } from "next/server";
import { DATASET_CAPTURE_TABLE } from "../../../lib/datasetCapture";
import {
  authorizeDatasetCaptureAdmin,
  datasetCaptureAuthFailureResponse,
} from "../../../lib/datasetCaptureAdmin";
import {
  DATASET_TRAINING_JOBS_TABLE,
  buildCandidateModelSummary,
  buildCaptureTimeline,
  buildCorrectionHistory,
  buildExpansionBucketStats,
  buildOverallCorrectionProgress,
  buildTrainingHistory,
  computeDatasetTotals,
  countTrainableByBucket,
} from "../../../lib/datasetCaptureTraining";
import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const STATS_SELECT =
  "id, sha256, selected_bucket, human_verified_label, approved_for_training, ready_for_import, rejected, is_duplicate, keep_for_regression_only, review_status, reviewed_at, created_at";

const TRAINING_JOB_SELECT =
  "id, requested_by, status, requested_at, started_at, finished_at, result_report_path, candidate_model_path, error";

function getProductionModelVersion() {
  return (
    process.env.PROOFORIGIN_PRODUCTION_MODEL_VERSION?.trim() ||
    process.env.NEXT_PUBLIC_PROOFORIGIN_PRODUCTION_MODEL_VERSION?.trim() ||
    null
  );
}

export async function POST(req) {
  try {
    const auth = await authorizeDatasetCaptureAdmin(req);
    if (!auth.ok) {
      return NextResponse.json(datasetCaptureAuthFailureResponse(auth), {
        status: auth.status,
      });
    }

    if (!isSupabaseAdminConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Private dataset storage is not configured. Set SUPABASE_SERVICE_ROLE_KEY.",
        },
        { status: 503 }
      );
    }

    const supabase = getSupabaseAdmin();
    const [capturesResult, jobsResult] = await Promise.all([
      supabase.from(DATASET_CAPTURE_TABLE).select(STATS_SELECT),
      supabase
        .from(DATASET_TRAINING_JOBS_TABLE)
        .select(TRAINING_JOB_SELECT)
        .order("requested_at", { ascending: false }),
    ]);

    if (capturesResult.error) {
      return NextResponse.json(
        {
          success: false,
          error: capturesResult.error.message || "Unable to load dataset stats.",
        },
        { status: 502 }
      );
    }

    if (jobsResult.error) {
      return NextResponse.json(
        {
          success: false,
          error: jobsResult.error.message || "Unable to load training history.",
        },
        { status: 502 }
      );
    }

    const rows = capturesResult.data || [];
    const jobs = jobsResult.data || [];
    const importReadyRows = rows.filter(
      (row) =>
        row.approved_for_training === true &&
        row.ready_for_import === true &&
        row.rejected !== true &&
        row.is_duplicate !== true &&
        row.keep_for_regression_only !== true
    );
    const v02Counts = countTrainableByBucket(importReadyRows);

    return NextResponse.json({
      success: true,
      totals: computeDatasetTotals(rows),
      overallCorrection: buildOverallCorrectionProgress(v02Counts),
      expansionBuckets: buildExpansionBucketStats(importReadyRows),
      timeline: buildCaptureTimeline(rows),
      correctionHistory: buildCorrectionHistory(rows),
      trainingHistory: buildTrainingHistory(jobs),
      candidateModel: buildCandidateModelSummary(jobs, getProductionModelVersion()),
      note: "Counts are metadata only. No images are exposed by this endpoint.",
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid dataset stats request." },
      { status: 400 }
    );
  }
}

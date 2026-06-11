import { NextResponse } from "next/server";
import { DATASET_CAPTURE_TABLE } from "../../../lib/datasetCapture";
import {
  authorizeDatasetCaptureAdmin,
  datasetCaptureAuthFailureResponse,
} from "../../../lib/datasetCaptureAdmin";
import {
  DATASET_TRAINING_JOBS_TABLE,
  TRAINING_JOB_STATUSES,
  buildTrainingGateStatus,
  countTrainableByBucket,
} from "../../../lib/datasetCaptureTraining";
import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const TRAINABLE_SELECT =
  "id, sha256, selected_bucket, human_verified_label, approved_for_training, ready_for_import, rejected, is_duplicate, keep_for_regression_only";

const ACTIVE_JOB_STATUSES = [
  TRAINING_JOB_STATUSES.REQUESTED,
  TRAINING_JOB_STATUSES.RUNNING,
];

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

    const { data: rows, error: rowsError } = await supabase
      .from(DATASET_CAPTURE_TABLE)
      .select(TRAINABLE_SELECT)
      .eq("approved_for_training", true)
      .eq("ready_for_import", true)
      .eq("rejected", false);

    if (rowsError) {
      return NextResponse.json(
        {
          success: false,
          error: rowsError.message || "Unable to evaluate training gate.",
        },
        { status: 502 }
      );
    }

    const filtered = (rows || []).filter(
      (row) => row.is_duplicate !== true && row.keep_for_regression_only !== true
    );
    const counts = countTrainableByBucket(filtered);
    const gate = buildTrainingGateStatus(counts);

    if (!gate.gateOpen) {
      return NextResponse.json(
        {
          success: false,
          status: TRAINING_JOB_STATUSES.BLOCKED_GATE_CLOSED,
          gateOpen: false,
          buckets: gate.buckets,
          error: "Correction targets are not met. Candidate training is blocked.",
          trainsOnVercel: false,
          message:
            "Training must run on the ProofOrigin AI backend. No job was created while the gate is closed.",
        },
        { status: 409 }
      );
    }

    const { data: activeJobs, error: activeError } = await supabase
      .from(DATASET_TRAINING_JOBS_TABLE)
      .select("id, status, requested_at")
      .in("status", ACTIVE_JOB_STATUSES)
      .order("requested_at", { ascending: false })
      .limit(1);

    if (activeError) {
      return NextResponse.json(
        {
          success: false,
          error: activeError.message || "Unable to check existing training jobs.",
        },
        { status: 502 }
      );
    }

    if (activeJobs?.length) {
      return NextResponse.json(
        {
          success: false,
          error: "A candidate training job is already pending or running.",
          existingJob: activeJobs[0],
        },
        { status: 409 }
      );
    }

    const { data: job, error: insertError } = await supabase
      .from(DATASET_TRAINING_JOBS_TABLE)
      .insert({
        requested_by: auth.email,
        status: TRAINING_JOB_STATUSES.REQUESTED,
      })
      .select(
        "id, requested_by, status, requested_at, started_at, finished_at, result_report_path, candidate_model_path, error"
      )
      .maybeSingle();

    if (insertError) {
      return NextResponse.json(
        {
          success: false,
          error: insertError.message || "Training job could not be created.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      status: TRAINING_JOB_STATUSES.REQUESTED,
      gateOpen: true,
      buckets: gate.buckets,
      job,
      trainsOnVercel: false,
      runsTrainingDirectly: false,
      message:
        "Candidate training job created. ProofOrigin AI backend will pull this job and run scripts/safe_auto_train.py. Production is not replaced automatically.",
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid train candidate request." },
      { status: 400 }
    );
  }
}

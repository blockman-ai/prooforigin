import { NextResponse } from "next/server";
import { DATASET_CAPTURE_TABLE } from "../../../lib/datasetCapture";
import {
  authorizeDatasetCaptureAdmin,
  datasetCaptureAuthFailureResponse,
} from "../../../lib/datasetCaptureAdmin";
import {
  buildTrainingGateStatus,
  countTrainableByBucket,
} from "../../../lib/datasetCaptureTraining";
import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const TRAINABLE_SELECT =
  "id, sha256, selected_bucket, human_verified_label, approved_for_training, ready_for_import, rejected, is_duplicate, keep_for_regression_only";

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
    const { data, error } = await supabase
      .from(DATASET_CAPTURE_TABLE)
      .select(TRAINABLE_SELECT)
      .eq("approved_for_training", true)
      .eq("ready_for_import", true)
      .eq("rejected", false);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message || "Unable to load gate status." },
        { status: 502 }
      );
    }

    const filtered = (data || []).filter(
      (row) => row.is_duplicate !== true && row.keep_for_regression_only !== true
    );
    const counts = countTrainableByBucket(filtered);
    const gate = buildTrainingGateStatus(counts);

    return NextResponse.json({
      success: true,
      gateOpen: gate.gateOpen,
      buckets: gate.buckets,
      trainsOnVercel: false,
      note: "Training runs on the ProofOrigin AI backend after a requested job is picked up.",
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid gate status request." },
      { status: 400 }
    );
  }
}

import { NextResponse } from "next/server";
import {
  DATASET_CAPTURE_REVIEW_ACTIONS,
  DATASET_CAPTURE_TABLE,
  isDatasetCaptureBucket,
} from "../../../lib/datasetCapture";
import {
  authorizeDatasetCaptureAdmin,
  datasetCaptureAuthFailureResponse,
} from "../../../lib/datasetCaptureAdmin";
import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const SELECT_FIELDS =
  "id, original_filename, sha256, selected_bucket, suggested_bucket, human_verified_label, source, consent_status, notes, vision_notes, width, height, file_size, approved_for_training, ready_for_import, rejected, review_status, is_duplicate, keep_for_regression_only, quality_warnings, reviewer_notes, reviewed_at, created_at";

function buildReviewResponse(action, capture) {
  return {
    success: true,
    action,
    capture,
    trains_immediately: false,
    message:
      "Approval recorded. Training runs only through the safe auto-train gate after correction targets are met.",
  };
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

    const body = await req.json();
    const captureId = (body?.id || "").toString().trim();
    const action = (body?.action || "").toString().trim();
    const correctionBucket = (body?.correction_bucket || "").toString().trim();
    const reviewerNotes = (body?.reviewer_notes || "").toString().trim() || null;

    if (!captureId) {
      return NextResponse.json(
        { success: false, error: "Capture id is required." },
        { status: 400 }
      );
    }

    if (!Object.values(DATASET_CAPTURE_REVIEW_ACTIONS).includes(action)) {
      return NextResponse.json(
        { success: false, error: "A valid review action is required." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: existing, error: lookupError } = await supabase
      .from(DATASET_CAPTURE_TABLE)
      .select("*")
      .eq("id", captureId)
      .maybeSingle();

    if (lookupError) {
      return NextResponse.json(
        { success: false, error: lookupError.message || "Capture lookup failed." },
        { status: 502 }
      );
    }

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Capture not found." },
        { status: 404 }
      );
    }

    const reviewedAt = new Date().toISOString();
    let patch = {
      reviewer_notes: reviewerNotes,
      reviewed_at: reviewedAt,
      review_status: action,
    };

    if (action === DATASET_CAPTURE_REVIEW_ACTIONS.APPROVE) {
      const approvedBucket =
        correctionBucket ||
        existing.human_verified_label ||
        existing.selected_bucket;

      if (!isDatasetCaptureBucket(approvedBucket)) {
        return NextResponse.json(
          {
            success: false,
            error: "Choose a valid correction bucket before approving.",
          },
          { status: 400 }
        );
      }

      patch = {
        ...patch,
        approved_for_training: true,
        ready_for_import: true,
        rejected: false,
        keep_for_regression_only: false,
        selected_bucket: approvedBucket,
        human_verified_label: approvedBucket,
        review_status: "approve",
      };
    } else if (action === DATASET_CAPTURE_REVIEW_ACTIONS.REJECT) {
      patch = {
        ...patch,
        approved_for_training: false,
        ready_for_import: false,
        rejected: true,
        review_status: "reject",
      };
    } else if (action === DATASET_CAPTURE_REVIEW_ACTIONS.DUPLICATE) {
      patch = {
        ...patch,
        approved_for_training: false,
        ready_for_import: false,
        rejected: true,
        is_duplicate: true,
        review_status: "duplicate",
      };
    } else if (action === DATASET_CAPTURE_REVIEW_ACTIONS.LOW_QUALITY) {
      patch = {
        ...patch,
        approved_for_training: false,
        ready_for_import: false,
        rejected: true,
        review_status: "low_quality",
      };
    } else if (action === DATASET_CAPTURE_REVIEW_ACTIONS.KEEP_FOR_REGRESSION) {
      patch = {
        ...patch,
        approved_for_training: false,
        ready_for_import: false,
        rejected: false,
        keep_for_regression_only: true,
        review_status: "keep_for_regression_only",
      };
    } else if (
      action === DATASET_CAPTURE_REVIEW_ACTIONS.UPDATE_BUCKET ||
      action === DATASET_CAPTURE_REVIEW_ACTIONS.WRONG_BUCKET
    ) {
      if (!isDatasetCaptureBucket(correctionBucket)) {
        return NextResponse.json(
          {
            success: false,
            error: "A valid correction bucket is required.",
          },
          { status: 400 }
        );
      }

      patch = {
        ...patch,
        selected_bucket: correctionBucket,
        human_verified_label: correctionBucket,
        approved_for_training: false,
        ready_for_import: false,
        rejected: false,
        review_status:
          action === DATASET_CAPTURE_REVIEW_ACTIONS.WRONG_BUCKET
            ? "wrong_bucket"
            : "update_bucket",
      };
    }

    const { data, error } = await supabase
      .from(DATASET_CAPTURE_TABLE)
      .update(patch)
      .eq("id", captureId)
      .select(SELECT_FIELDS)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message || "Review update failed." },
        { status: 502 }
      );
    }

    return NextResponse.json(buildReviewResponse(action, data));
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid review request." },
      { status: 400 }
    );
  }
}

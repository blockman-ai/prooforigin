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

function buildReviewResponse(action, capture) {
  return {
    success: true,
    action,
    capture,
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
        rejected: false,
        selected_bucket: approvedBucket,
        human_verified_label: approvedBucket,
      };
    } else if (action === DATASET_CAPTURE_REVIEW_ACTIONS.REJECT) {
      patch = {
        ...patch,
        approved_for_training: false,
        rejected: true,
      };
    } else if (action === DATASET_CAPTURE_REVIEW_ACTIONS.UPDATE_BUCKET) {
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
        rejected: false,
      };
    }

    const { data, error } = await supabase
      .from(DATASET_CAPTURE_TABLE)
      .update(patch)
      .eq("id", captureId)
      .select(
        "id, original_filename, sha256, selected_bucket, suggested_bucket, human_verified_label, source, consent_status, notes, vision_notes, width, height, file_size, approved_for_training, rejected, reviewer_notes, reviewed_at, created_at"
      )
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

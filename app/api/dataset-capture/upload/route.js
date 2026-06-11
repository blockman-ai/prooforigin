import crypto from "crypto";
import sharp from "sharp";
import { NextResponse } from "next/server";
import {
  DATASET_CAPTURE_PRIVATE_BUCKET,
  DATASET_CAPTURE_SOURCE,
  DATASET_CAPTURE_TABLE,
  assessCaptureQuality,
  buildDatasetStoragePath,
  isDatasetCaptureBucket,
  isImageUploadFile,
} from "../../../lib/datasetCapture";
import {
  authorizeDatasetCaptureAdmin,
  datasetCaptureAuthFailureResponse,
} from "../../../lib/datasetCaptureAdmin";
import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

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

    const formData = await req.formData();
    const file = formData.get("file");
    const selectedBucket = formData.get("selected_bucket");
    const suggestedBucket = formData.get("suggested_bucket");
    const notes = (formData.get("notes") || "").toString().trim();
    const visionNotes = (formData.get("vision_notes") || "").toString().trim();
    const consent = formData.get("consent");

    if (consent !== "true" && consent !== true) {
      return NextResponse.json(
        {
          success: false,
          error: "Consent is required before uploading calibration captures.",
        },
        { status: 400 }
      );
    }

    if (!isDatasetCaptureBucket(selectedBucket)) {
      return NextResponse.json(
        { success: false, error: "A valid calibration bucket must be selected." },
        { status: 400 }
      );
    }

    if (!file || !isImageUploadFile(file)) {
      return NextResponse.json(
        { success: false, error: "Only image files can be uploaded." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");

    const supabase = getSupabaseAdmin();
    const { data: existing, error: duplicateLookupError } = await supabase
      .from(DATASET_CAPTURE_TABLE)
      .select(
        "id, sha256, selected_bucket, suggested_bucket, approved_for_training, rejected, review_status, created_at"
      )
      .eq("sha256", sha256)
      .maybeSingle();

    if (duplicateLookupError) {
      return NextResponse.json(
        {
          success: false,
          error: duplicateLookupError.message || "Duplicate lookup failed.",
        },
        { status: 502 }
      );
    }

    if (existing) {
      return NextResponse.json({
        success: true,
        duplicate: true,
        message: "Duplicate image skipped — already captured.",
        sha256,
        existing: {
          id: existing.id,
          selected_bucket: existing.selected_bucket,
          suggested_bucket: existing.suggested_bucket,
          approved_for_training: existing.approved_for_training,
          rejected: existing.rejected,
          review_status: existing.review_status,
          created_at: existing.created_at,
        },
      });
    }

    const captureId = crypto.randomUUID();
    const storagePath = buildDatasetStoragePath(
      selectedBucket,
      captureId,
      file.name
    );

    let width = null;
    let height = null;

    try {
      const metadata = await sharp(buffer).metadata();
      width = metadata.width ?? null;
      height = metadata.height ?? null;
    } catch {
      width = null;
      height = null;
    }

    const qualityWarnings = assessCaptureQuality({
      width,
      height,
      fileSize: file.size || buffer.length,
    });

    const { error: storageError } = await supabase.storage
      .from(DATASET_CAPTURE_PRIVATE_BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (storageError) {
      return NextResponse.json(
        {
          success: false,
          error: storageError.message || "Private storage upload failed.",
        },
        { status: 502 }
      );
    }

    const normalizedSuggested =
      suggestedBucket && isDatasetCaptureBucket(suggestedBucket)
        ? suggestedBucket
        : null;

    const row = {
      id: captureId,
      storage_path: storagePath,
      original_filename: file.name || "unknown",
      sha256,
      selected_bucket: selectedBucket,
      suggested_bucket: normalizedSuggested,
      human_verified_label: selectedBucket,
      source: DATASET_CAPTURE_SOURCE,
      consent_status: "granted",
      notes: notes || null,
      vision_notes: visionNotes || null,
      width,
      height,
      file_size: file.size || buffer.length,
      approved_for_training: false,
      ready_for_import: false,
      rejected: false,
      is_duplicate: false,
      keep_for_regression_only: false,
      quality_warnings: qualityWarnings.length ? qualityWarnings : null,
      review_status: "pending_review",
    };

    const { error: insertError } = await supabase
      .from(DATASET_CAPTURE_TABLE)
      .insert(row);

    if (insertError) {
      await supabase.storage
        .from(DATASET_CAPTURE_PRIVATE_BUCKET)
        .remove([storagePath]);

      return NextResponse.json(
        {
          success: false,
          error: insertError.message || "Dataset capture record could not be saved.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      duplicate: false,
      id: captureId,
      original_filename: row.original_filename,
      selected_bucket: selectedBucket,
      suggested_bucket: normalizedSuggested,
      sha256,
      quality_warnings: qualityWarnings,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Dataset capture upload failed.",
      },
      { status: 500 }
    );
  }
}

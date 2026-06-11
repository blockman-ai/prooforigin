import { NextResponse } from "next/server";
import {
  DATASET_CAPTURE_PRIVATE_BUCKET,
  DATASET_CAPTURE_SIGNED_URL_TTL_SECONDS,
  DATASET_CAPTURE_TABLE,
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

    const body = await req.json();
    const captureId = (body?.id || "").toString().trim();

    if (!captureId) {
      return NextResponse.json(
        { success: false, error: "Capture id is required." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: capture, error: lookupError } = await supabase
      .from(DATASET_CAPTURE_TABLE)
      .select("id, storage_path")
      .eq("id", captureId)
      .maybeSingle();

    if (lookupError) {
      return NextResponse.json(
        { success: false, error: lookupError.message || "Capture lookup failed." },
        { status: 502 }
      );
    }

    if (!capture?.storage_path) {
      return NextResponse.json(
        { success: false, error: "Capture not found." },
        { status: 404 }
      );
    }

    const { data, error } = await supabase.storage
      .from(DATASET_CAPTURE_PRIVATE_BUCKET)
      .createSignedUrl(
        capture.storage_path,
        DATASET_CAPTURE_SIGNED_URL_TTL_SECONDS
      );

    if (error || !data?.signedUrl) {
      return NextResponse.json(
        {
          success: false,
          error: error?.message || "Signed preview URL could not be created.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      id: captureId,
      signedUrl: data.signedUrl,
      expiresIn: DATASET_CAPTURE_SIGNED_URL_TTL_SECONDS,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid signed URL request." },
      { status: 400 }
    );
  }
}
